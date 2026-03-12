/**
 * Diagnóstico: qué tipos de documentos tiene el Excel para KC12071 en Enero y Febrero 2026
 * y luego llama a la API para ver qué tipos de documentos retorna para esos meses.
 */
require('dotenv').config({ path: '/home/jeanf/axam/ordenes-de-compra/version-nueva/AXAM-plataforma-gestion/.env' });
const XLSX = require('xlsx');
const axios = require('axios');
const { format } = require('date-fns');
const { getAuthHeaders } = require('../../utils/auth');

const SKU = 'KC12071';
const EXCEL_PATH = '/home/jeanf/axam/ordenes-de-compra/version-nueva/AXAM-plataforma-gestion/informe_ventas.xlsx';
const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

async function fetchDocType(docType, df, dt) {
    const headers = await getAuthHeaders();
    const url = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/${docType}/V?details=1&df=${df}&dt=${dt}`;
    console.log(`  → GET ${url}`);
    try {
        const r = await axios.get(url, { headers, timeout: 120000 });
        const docs = r.data.data || r.data || [];
        return Array.isArray(docs) ? docs : [];
    } catch (e) {
        if (e.response?.status === 400 || e.response?.status === 404) {
            console.log(`  → ${docType}: sin resultados (${e.response.status})`);
            return [];
        }
        throw e;
    }
}

function sumaUnidades(docs, sku) {
    let unidades = 0;
    for (const doc of docs) {
        const detalles = doc.detalles || doc.detalle || doc.items || [];
        for (const item of detalles) {
            const cod = item.codigo || item.cod_prod || item.codigo_prod || item.cod_art || item.sku;
            if (cod === sku) {
                unidades += parseFloat(item.cantidad || item.cant || 0);
            }
        }
    }
    return unidades;
}

async function main() {
    // ---- Excel ----
    const wb = XLSX.readFile(EXCEL_PATH);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);

    for (const [label, prefix] of [['Enero 2026', '01/2026'], ['Febrero 2026', '02/2026']]) {
        const mesRows = rows.filter(r => r['Código producto'] === SKU && String(r['Fecha de documento']).includes(prefix.replace('01/2026', '/01/2026').replace('02/2026', '/02/2026')));
        
        // Corrección: formato dd/mm/yyyy - el mes está en posición 1 del split
        const mesFiltered = rows.filter(r => {
            const cod = r['Código producto'];
            const fecha = String(r['Fecha de documento'] || '');
            const parts = fecha.split('/');
            const mes = parts[1];
            const anio = parts[2];
            if (prefix === '01/2026') return cod === SKU && mes === '01' && anio === '2026';
            if (prefix === '02/2026') return cod === SKU && mes === '02' && anio === '2026';
            return false;
        });

        const byType = {};
        for (const r of mesFiltered) {
            const t = r['Tipo de documento'];
            if (!byType[t]) byType[t] = { unidades: 0, neto: 0, docs: new Set() };
            const sign = t === 'NCVE' ? -1 : 1;
            byType[t].unidades += sign * parseFloat(r['Cantidad vendidos'] || 0);
            byType[t].neto += sign * parseFloat(r['Neto por producto'] || 0);
            byType[t].docs.add(r['Número de documento']);
        }

        const totalU = Object.values(byType).reduce((s, v) => s + v.unidades, 0);
        const totalN = Object.values(byType).reduce((s, v) => s + v.neto, 0);

        console.log(`\n========== EXCEL: ${label} ==========`);
        console.log(`Total Unidades: ${totalU} | Total CLP: ${totalN.toLocaleString('es-CL')}`);
        for (const [t, v] of Object.entries(byType)) {
            console.log(`  ${t}: ${v.unidades}u / ${v.neto.toLocaleString('es-CL')} CLP (${v.docs.size} documentos)`);
        }

        // ---- API ----
        const [dia, mesNum, anio] = prefix === '01/2026' 
            ? ['01', '01', '2026'] 
            : ['01', '02', '2026'];
        const ultimoDia = prefix === '01/2026' ? '31' : '28';
        const df = `${anio}${mesNum}${dia}`;
        const dt = `${anio}${mesNum}${ultimoDia}`;

        console.log(`\n========== API: ${label} (${df} - ${dt}) ==========`);
        const TYPES_TO_TRY = ['FAVE', 'BOVE', 'NCVE', 'GDVE'];

        for (const docType of TYPES_TO_TRY) {
            const docs = await fetchDocType(docType, df, dt);
            const u = sumaUnidades(docs, SKU);
            console.log(`  ${docType}: ${docs.length} documentos totales | ${SKU}: ${u} unidades`);
            // Si hay unidades, mostrar documentos relevantes
            for (const doc of docs) {
                const detalles = doc.detalles || doc.detalle || doc.items || [];
                for (const item of detalles) {
                    const cod = item.codigo || item.cod_prod || item.codigo_prod || item.cod_art || item.sku;
                    if (cod === SKU) {
                        const cant = parseFloat(item.cantidad || item.cant || 0);
                        console.log(`    Doc ${doc.folio || doc.numero} | ${SKU}: ${cant}u`);
                    }
                }
            }
            await new Promise(r => setTimeout(r, 500));
        }
    }
}

main().catch(e => { console.error(e.message); process.exit(1); });
