/**
 * Auditoría Exhaustiva KC12071 - Enero y Febrero 2026
 * 
 * Para cada mes:
 *  1. Descarga TODAS las GDVEs y lista las que contienen KC12071
 *  2. Descarga TODAS las FAVEs y lista las que contienen KC12071
 *     → Dentro de cada FAVE, detecta si hay referencia a una GDVE (glosa o campo referencias)
 *  3. Descarga BOVE y NCVE y lista las que contienen KC12071
 *  4. Compara con el Excel (todos los documentos del informe para KC12071)
 *  5. Muestra qué documentos están en Manager pero no en el Excel, y viceversa
 */

require('dotenv').config({ path: '/home/jeanf/axam/ordenes-de-compra/version-nueva/AXAM-plataforma-gestion/.env' });
const XLSX = require('xlsx');
const axios = require('axios');
const { format } = require('date-fns');
const { getAuthHeaders } = require('../../utils/auth');
const fs = require('fs');

const SKU = 'KC12071';
const EXCEL_PATH = '/home/jeanf/axam/ordenes-de-compra/version-nueva/AXAM-plataforma-gestion/informe_ventas.xlsx';
const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

// ── Helpers ────────────────────────────────────────────────────────────────

async function fetchDocs(docType, df, dt) {
    const headers = await getAuthHeaders();
    const url = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/${docType}/V?details=1&df=${df}&dt=${dt}`;
    try {
        const r = await axios.get(url, { headers, timeout: 120000 });
        const docs = r.data.data || r.data || [];
        return Array.isArray(docs) ? docs : [];
    } catch (e) {
        if (e.response?.status === 400 || e.response?.status === 404) return [];
        throw e;
    }
}

function getReferencedGDFolio(doc) {
    // Revisar campo referencias estructurado
    if (doc.referencias && Array.isArray(doc.referencias)) {
        for (const ref of doc.referencias) {
            if (ref.tipo_doc && (ref.tipo_doc.includes('GD') || ref.tipo_doc.includes('GUIA'))) {
                return ref.folio_ref || ref.folio || null;
            }
        }
    }
    // Revisar glosa
    const glosa = (doc.glosa || doc.glosa_enc || '').toUpperCase();
    const match = glosa.match(/(?:GD|GUIA|GDVE|GDV)\s*[-:]?\s*(\d+)/);
    return match ? match[1] : null;
}

function getItemsForSKU(doc, sku) {
    const detalles = doc.detalles || doc.detalle || doc.items || [];
    return detalles.filter(item => {
        const cod = item.codigo || item.cod_prod || item.codigo_prod || item.cod_art || item.sku;
        return cod === sku;
    });
}

function sumItems(items) {
    return items.reduce((acc, item) => {
        acc.unidades += parseFloat(item.cantidad || item.cant || 0);
        acc.neto += parseFloat(item.precio_neto || item.monto_neto || item.neto || 
                               (parseFloat(item.precio_unitario || 0) * parseFloat(item.cantidad || 0)) || 0);
        return acc;
    }, { unidades: 0, neto: 0 });
}

// ── Main ───────────────────────────────────────────────────────────────────

async function auditarMes(label, df, dt) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  AUDITORÍA: ${label}  (${df} → ${dt})`);
    console.log(`${'═'.repeat(70)}`);

    // ── 1. Manager+ API ────────────────────────────────────────────────────
    console.log('\n[1] Descargando documentos de Manager+...');
    const [faves, boves, ncves, gdves] = await Promise.all([
        (async () => { process.stdout.write('  FAVE...'); const d = await fetchDocs('FAVE', df, dt); console.log(` ${d.length} docs`); return d; })(),
        (async () => { await new Promise(r => setTimeout(r, 500)); process.stdout.write('  BOVE...'); const d = await fetchDocs('BOVE', df, dt); console.log(` ${d.length} docs`); return d; })(),
        (async () => { await new Promise(r => setTimeout(r, 1000)); process.stdout.write('  NCVE...'); const d = await fetchDocs('NCVE', df, dt); console.log(` ${d.length} docs`); return d; })(),
        (async () => { await new Promise(r => setTimeout(r, 1500)); process.stdout.write('  GDVE...'); const d = await fetchDocs('GDVE', df, dt); console.log(` ${d.length} docs`); return d; })(),
    ]);

    // ── Filtrar para KC12071 ───────────────────────────────────────────────
    const managerDocs = {
        // doc folio -> { tipo, unidades, neto, referenciaGD, items }
    };

    const counters = {
        FAVE: { docs: [], unidades: 0, neto: 0 },
        FAVE_con_GD: { docs: [], unidades: 0, neto: 0 },  // FAVEs que referencian una GD
        BOVE: { docs: [], unidades: 0, neto: 0 },
        NCVE: { docs: [], unidades: 0, neto: 0 },
        GDVE: { docs: [], unidades: 0, neto: 0 },           // Guías (todas)
        GDVE_sin_factura: { docs: [], unidades: 0, neto: 0 }, // Guías sin FAVE correspondiente
    };

    // Procesar FAVEs
    const faveGDRefs = new Set(); // folios de GDs que ya tienen FAVE
    for (const doc of faves) {
        const items = getItemsForSKU(doc, SKU);
        if (items.length === 0) continue;
        const { unidades, neto } = sumItems(items);
        const gdRef = getReferencedGDFolio(doc);
        const folio = String(doc.folio || doc.numero);

        counters.FAVE.docs.push({ folio, unidades, neto, gdRef });
        counters.FAVE.unidades += unidades;
        counters.FAVE.neto += neto;

        if (gdRef) {
            faveGDRefs.add(gdRef);
            counters.FAVE_con_GD.docs.push({ folio, unidades, neto, gdRef });
            counters.FAVE_con_GD.unidades += unidades;
            counters.FAVE_con_GD.neto += neto;
        }

        managerDocs[folio] = { tipo: 'FAVE', unidades, neto, gdRef };
    }

    // Procesar BOVEs
    for (const doc of boves) {
        const items = getItemsForSKU(doc, SKU);
        if (items.length === 0) continue;
        const { unidades, neto } = sumItems(items);
        const folio = String(doc.folio || doc.numero);
        counters.BOVE.docs.push({ folio, unidades, neto });
        counters.BOVE.unidades += unidades;
        counters.BOVE.neto += neto;
        managerDocs[folio] = { tipo: 'BOVE', unidades, neto };
    }

    // Procesar NCVEs
    for (const doc of ncves) {
        const items = getItemsForSKU(doc, SKU);
        if (items.length === 0) continue;
        const { unidades, neto } = sumItems(items);
        const folio = String(doc.folio || doc.numero);
        counters.NCVE.docs.push({ folio, unidades, neto });
        counters.NCVE.unidades += unidades;
        counters.NCVE.neto += neto;
        managerDocs[folio] = { tipo: 'NCVE', unidades, neto };
    }

    // Procesar GDVEs
    for (const doc of gdves) {
        const items = getItemsForSKU(doc, SKU);
        if (items.length === 0) continue;
        const { unidades, neto } = sumItems(items);
        const folio = String(doc.folio || doc.numero);
        const tieneFave = faveGDRefs.has(folio);

        counters.GDVE.docs.push({ folio, unidades, neto, facturada: tieneFave });
        counters.GDVE.unidades += unidades;
        counters.GDVE.neto += neto;

        if (!tieneFave) {
            counters.GDVE_sin_factura.docs.push({ folio, unidades, neto });
            counters.GDVE_sin_factura.unidades += unidades;
            counters.GDVE_sin_factura.neto += neto;
        }

        managerDocs[folio] = { tipo: 'GDVE', unidades, neto, facturada: tieneFave };
    }

    // ── Resumen Manager ────────────────────────────────────────────────────
    console.log('\n[2] RESUMEN MANAGER+ (documentos con KC12071):');
    console.log(`    FAVE total          : ${counters.FAVE.docs.length} docs | ${counters.FAVE.unidades}u`);
    console.log(`    └── FAVE con ref GD : ${counters.FAVE_con_GD.docs.length} docs | ${counters.FAVE_con_GD.unidades}u (cuentan como FAVE)`);
    console.log(`    BOVE total          : ${counters.BOVE.docs.length} docs | ${counters.BOVE.unidades}u`);
    console.log(`    NCVE total          : ${counters.NCVE.docs.length} docs | ${counters.NCVE.unidades}u`);
    console.log(`    GDVE total          : ${counters.GDVE.docs.length} docs | ${counters.GDVE.unidades}u`);
    console.log(`    └── GDVE sin FAVE   : ${counters.GDVE_sin_factura.docs.length} docs | ${counters.GDVE_sin_factura.unidades}u (pendientes de facturar)`);
    console.log(`    └── GDVE con FAVE   : ${counters.GDVE.docs.length - counters.GDVE_sin_factura.docs.length} docs | ${counters.GDVE.unidades - counters.GDVE_sin_factura.unidades}u (ya facturadas)`);

    const netManager_sinGD = counters.FAVE.unidades + counters.BOVE.unidades - counters.NCVE.unidades;
    const netManager_conGD = netManager_sinGD + counters.GDVE_sin_factura.unidades;
    console.log(`\n    Neto Manager (solo facturas)              : ${netManager_sinGD}u`);
    console.log(`    Neto Manager (+GDs sin facturar)           : ${netManager_conGD}u`);

    // ── Excel ──────────────────────────────────────────────────────────────
    const wb = XLSX.readFile(EXCEL_PATH);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const allRows = XLSX.utils.sheet_to_json(ws);

    const [mesNum, anio] = [df.slice(4, 6), df.slice(0, 4)];
    const excelRows = allRows.filter(r => {
        const cod = r['Código producto'];
        const fecha = String(r['Fecha de documento'] || '');
        const parts = fecha.split('/');
        return cod === SKU && parts[1] === mesNum && parts[2] === anio;
    });

    const excelByDoc = {};
    const excelCounters = {};
    for (const r of excelRows) {
        const tipo = r['Tipo de documento'];
        const folio = String(r['Número de documento']);
        const cant = parseFloat(r['Cantidad vendidos'] || 0);
        const neto = parseFloat(r['Neto por producto'] || 0);
        const sign = tipo === 'NCVE' ? -1 : 1;

        if (!excelCounters[tipo]) excelCounters[tipo] = { docs: new Set(), unidades: 0, neto: 0 };
        excelCounters[tipo].docs.add(folio);
        excelCounters[tipo].unidades += sign * cant;
        excelCounters[tipo].neto += sign * neto;

        if (!excelByDoc[folio]) excelByDoc[folio] = { tipo, unidades: 0, neto: 0 };
        excelByDoc[folio].unidades += sign * cant;
        excelByDoc[folio].neto += sign * neto;
    }

    console.log('\n[3] RESUMEN EXCEL (informe_ventas.xlsx):');
    let excelNeto = 0;
    for (const [tipo, v] of Object.entries(excelCounters)) {
        console.log(`    ${tipo.padEnd(8)}: ${v.docs.size} docs | ${v.unidades}u`);
        excelNeto += v.unidades;
    }
    console.log(`    Neto Excel total                          : ${excelNeto}u`);

    // ── Cruce: documentos en Manager pero no en Excel ──────────────────────
    console.log('\n[4] DOCUMENTOS EN MANAGER+ NO ENCONTRADOS EN EXCEL:');
    const managerFolios = new Set(Object.keys(managerDocs));
    const excelFolios = new Set(Object.keys(excelByDoc));
    let soloManager = 0;
    for (const folio of managerFolios) {
        if (!excelFolios.has(folio)) {
            const d = managerDocs[folio];
            console.log(`    ⚠️  Doc ${folio} (${d.tipo}) | ${d.unidades}u${d.gdRef ? ` [ref GD ${d.gdRef}]` : ''}${d.tipo === 'GDVE' && d.facturada ? ' [GDVE ya facturada]' : ''}`);
            soloManager++;
        }
    }
    if (soloManager === 0) console.log('    ✅ Todos los docs de Manager están en el Excel');

    // ── Cruce: documentos en Excel pero no en Manager ──────────────────────
    console.log('\n[5] DOCUMENTOS EN EXCEL NO ENCONTRADOS EN MANAGER+:');
    let soloExcel = 0;
    for (const folio of excelFolios) {
        if (!managerFolios.has(folio)) {
            const d = excelByDoc[folio];
            console.log(`    ⚠️  Doc ${folio} (${d.tipo}) | ${d.unidades}u`);
            soloExcel++;
        }
    }
    if (soloExcel === 0) console.log('    ✅ Todos los docs del Excel están en Manager');

    // ── Documentos en ambos pero con cantidades distintas ─────────────────
    console.log('\n[6] DOCUMENTOS EN AMBOS PERO CON CANTIDADES DISTINTAS:');
    let distinto = 0;
    for (const folio of managerFolios) {
        if (excelFolios.has(folio)) {
            const m = managerDocs[folio];
            const e = excelByDoc[folio];
            const deltaU = (e.unidades || 0) - m.unidades;
            if (Math.abs(deltaU) > 0.01) {
                console.log(`    ⚠️  Doc ${folio} (${m.tipo}) | Manager: ${m.unidades}u, Excel: ${e.unidades}u, Δ: ${deltaU}u`);
                distinto++;
            }
        }
    }
    if (distinto === 0) console.log('    ✅ Todas las cantidades coinciden en documentos compartidos');

    console.log('\n[7] TABLA RESUMEN FINAL:');
    const col1 = 44;
    console.log(`    ${'Tipo'.padEnd(col1)} Manager+  Excel      Delta`);
    console.log(`    ${'FAVE (unidades brutas)'.padEnd(col1)} ${String(counters.FAVE.unidades).padStart(8)} ${String(excelCounters['FAVE']?.unidades || 0).padStart(8)} ${String((excelCounters['FAVE']?.unidades || 0) - counters.FAVE.unidades).padStart(8)}`);
    console.log(`    ${'NCVE (unidades a restar)'.padEnd(col1)} ${String(counters.NCVE.unidades).padStart(8)} ${String(Math.abs(excelCounters['NCVE']?.unidades || 0)).padStart(8)} ${String(Math.abs(excelCounters['NCVE']?.unidades || 0) - counters.NCVE.unidades).padStart(8)}`);
    console.log(`    ${'BOVE'.padEnd(col1)} ${String(counters.BOVE.unidades).padStart(8)} ${String(excelCounters['BOVE']?.unidades || 0).padStart(8)} ${String((excelCounters['BOVE']?.unidades || 0) - counters.BOVE.unidades).padStart(8)}`);
    console.log(`    ${'GDVE total'.padEnd(col1)} ${String(counters.GDVE.unidades).padStart(8)} ${'N/A'.padStart(8)}`);
    console.log(`    ${'GDVE sin factura (pendientes)'.padEnd(col1)} ${String(counters.GDVE_sin_factura.unidades).padStart(8)} ${'N/A'.padStart(8)}`);
    console.log('    ' + '─'.repeat(60));
    console.log(`    ${'NETO (solo facturas)'.padEnd(col1)} ${String(netManager_sinGD).padStart(8)} ${String(excelNeto).padStart(8)} ${String(excelNeto - netManager_sinGD).padStart(8)}`);
    console.log(`    ${'NETO (+GDs sin facturar)'.padEnd(col1)} ${String(netManager_conGD).padStart(8)}`);
}

async function main() {
    await auditarMes('Enero 2026', '20260101', '20260131');
    await auditarMes('Febrero 2026', '20260201', '20260228');
    console.log('\n✅ Auditoría completa\n');
}

main().catch(e => { console.error(e.message, e.stack); process.exit(1); });
