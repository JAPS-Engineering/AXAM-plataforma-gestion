/**
 * Script de verificación: compara ventas de KC12071 en el Excel de Manager+
 * contra lo que hay en la base de datos (ventaHistorica y ventaSemanal).
 *
 * Uso: node scripts/test/compareKC12071.js
 */

require('dotenv').config({ path: '/home/jeanf/axam/ordenes-de-compra/version-nueva/AXAM-plataforma-gestion/.env' });
const XLSX = require('xlsx');
const { getPrismaClient } = require('../../prisma/client');
const { getISOWeek, getYear, format, parse, parseISO } = require('date-fns');

const SKU = 'KC12071';
const EXCEL_PATH = '/home/jeanf/axam/ordenes-de-compra/version-nueva/AXAM-plataforma-gestion/informe_ventas.xlsx';

const prisma = getPrismaClient();

function parseDate(rawDate) {
    if (!rawDate) return null;
    // Formato "dd/MM/yyyy"
    const parts = rawDate.toString().split('/');
    if (parts.length === 3) {
        return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }
    return null;
}

async function main() {
    console.log('\n=======================================================');
    console.log(`  VERIFICACIÓN DE VENTAS: ${SKU}`);
    console.log('=======================================================\n');

    // ============================================================
    // 1. LEER EXCEL y filtrar filas de KC12071
    // ============================================================
    const wb = XLSX.readFile(EXCEL_PATH);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);

    // Columnas del Excel:
    // "Fecha de documento", "Tipo de documento", "Código producto",
    // "Cantidad vendidos", "Neto por producto"

    const excelRows = rows.filter(r => r['Código producto'] === SKU);
    console.log(`📄 Excel: ${excelRows.length} filas para ${SKU}`);
    console.log(`   Tipos de documento encontrados: ${[...new Set(excelRows.map(r => r['Tipo de documento']))].join(', ')}`);

    // Totales globales desde el Excel
    let excelTotalUnidades = 0;
    let excelTotalNeto = 0;
    for (const r of excelRows) {
        const tipo = r['Tipo de documento'];
        const cant = parseFloat(r['Cantidad vendidos'] || 0);
        const neto = parseFloat(r['Neto por producto'] || 0);
        if (tipo === 'NCVE') {
            excelTotalUnidades -= cant;
            excelTotalNeto -= neto;
        } else {
            excelTotalUnidades += cant;
            excelTotalNeto += neto;
        }
    }
    console.log(`\n📊 TOTALES EN EXCEL:`);
    console.log(`   Unidades: ${excelTotalUnidades}`);
    console.log(`   CLP Neto: ${excelTotalNeto.toLocaleString('es-CL')}`);

    // ============================================================
    // 2. AGRUPAR EXCEL POR MES
    // ============================================================
    const excelPorMes = {};
    for (const r of excelRows) {
        const fecha = parseDate(r['Fecha de documento']);
        if (!fecha) continue;
        const key = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
        if (!excelPorMes[key]) excelPorMes[key] = { unidades: 0, neto: 0 };
        const tipo = r['Tipo de documento'];
        const cant = parseFloat(r['Cantidad vendidos'] || 0);
        const neto = parseFloat(r['Neto por producto'] || 0);
        if (tipo === 'NCVE') {
            excelPorMes[key].unidades -= cant;
            excelPorMes[key].neto -= neto;
        } else {
            excelPorMes[key].unidades += cant;
            excelPorMes[key].neto += neto;
        }
    }

    // ============================================================
    // 3. AGRUPAR EXCEL POR SEMANA
    // ============================================================
    const excelPorSemana = {};
    for (const r of excelRows) {
        const fecha = parseDate(r['Fecha de documento']);
        if (!fecha) continue;
        const week = getISOWeek(fecha);
        const year = getYear(fecha);
        const key = `${year}-W${String(week).padStart(2, '0')}`;
        if (!excelPorSemana[key]) excelPorSemana[key] = { unidades: 0, neto: 0 };
        const tipo = r['Tipo de documento'];
        const cant = parseFloat(r['Cantidad vendidos'] || 0);
        const neto = parseFloat(r['Neto por producto'] || 0);
        if (tipo === 'NCVE') {
            excelPorSemana[key].unidades -= cant;
            excelPorSemana[key].neto -= neto;
        } else {
            excelPorSemana[key].unidades += cant;
            excelPorSemana[key].neto += neto;
        }
    }

    // ============================================================
    // 4. OBTENER DATOS DE LA BASE DE DATOS
    // ============================================================
    const producto = await prisma.producto.findUnique({ where: { sku: SKU } });
    if (!producto) {
        console.error(`\n❌ Producto ${SKU} no encontrado en la base de datos`);
        return;
    }
    console.log(`\n✅ Producto en DB: ${producto.nombre} (id: ${producto.id})`);

    // Datos mensuales históricos
    const ventasMensuales = await prisma.ventaHistorica.findMany({
        where: { productoId: producto.id },
        orderBy: [{ ano: 'asc' }, { mes: 'asc' }]
    });

    // Datos semanales
    const ventasSemanales = await prisma.ventaSemanal.findMany({
        where: { productoId: producto.id },
        orderBy: [{ ano: 'asc' }, { semana: 'asc' }]
    });

    // Totales DB
    const dbTotalUnidades = ventasMensuales.reduce((s, v) => s + v.cantidadVendida, 0);
    const dbTotalNeto = ventasMensuales.reduce((s, v) => s + (v.montoNeto || 0), 0);
    console.log(`\n📊 TOTALES EN BASE DE DATOS (mensual histórico):`);
    console.log(`   Unidades: ${dbTotalUnidades}`);
    console.log(`   CLP Neto: ${dbTotalNeto.toLocaleString('es-CL')}`);

    // ============================================================
    // 5. COMPARACIÓN MENSUAL
    // ============================================================
    console.log('\n=======================================================');
    console.log('  COMPARACIÓN MENSUAL');
    console.log('=======================================================');
    console.log(`${'Mes'.padEnd(10)} ${'Excel U'.padStart(8)} ${'DB U'.padStart(8)} ${'Δ U'.padStart(8)} │ ${'Excel CLP'.padStart(14)} ${'DB CLP'.padStart(14)} ${'Δ CLP'.padStart(12)}`);
    console.log('─'.repeat(90));

    // Agregar por mes en DB
    const dbPorMes = {};
    for (const v of ventasMensuales) {
        const key = `${v.ano}-${String(v.mes).padStart(2, '0')}`;
        if (!dbPorMes[key]) dbPorMes[key] = { unidades: 0, neto: 0 };
        dbPorMes[key].unidades += v.cantidadVendida;
        dbPorMes[key].neto += v.montoNeto || 0;
    }

    const allMeses = [...new Set([...Object.keys(excelPorMes), ...Object.keys(dbPorMes)])].sort();
    let discrepanciasMes = 0;
    for (const mes of allMeses) {
        const ex = excelPorMes[mes] || { unidades: 0, neto: 0 };
        const db = dbPorMes[mes] || { unidades: 0, neto: 0 };
        const deltaU = db.unidades - ex.unidades;
        const deltaN = db.neto - ex.neto;
        const ok = Math.abs(deltaU) < 0.01 && Math.abs(deltaN) < 2;
        if (!ok) discrepanciasMes++;
        const flag = ok ? '✅' : '⚠️ ';
        console.log(`${flag} ${mes.padEnd(8)} ${String(ex.unidades).padStart(8)} ${String(db.unidades).padStart(8)} ${String(deltaU).padStart(8)} │ ${ex.neto.toLocaleString('es-CL').padStart(14)} ${db.neto.toLocaleString('es-CL').padStart(14)} ${deltaN.toLocaleString('es-CL').padStart(12)}`);
    }
    console.log(`\n${discrepanciasMes === 0 ? '✅ Sin discrepancias mensuales' : `⚠️  ${discrepanciasMes} mes(es) con discrepancias`}`);

    // ============================================================
    // 6. COMPARACIÓN SEMANAL
    // ============================================================
    console.log('\n=======================================================');
    console.log('  COMPARACIÓN SEMANAL');
    console.log('=======================================================');
    console.log(`${'Semana'.padEnd(12)} ${'Excel U'.padStart(8)} ${'DB U'.padStart(8)} ${'Δ U'.padStart(8)} │ ${'Excel CLP'.padStart(14)} ${'DB CLP'.padStart(14)} ${'Δ CLP'.padStart(12)}`);
    console.log('─'.repeat(90));

    const dbPorSemana = {};
    for (const v of ventasSemanales) {
        const key = `${v.ano}-W${String(v.semana).padStart(2, '0')}`;
        if (!dbPorSemana[key]) dbPorSemana[key] = { unidades: 0, neto: 0 };
        dbPorSemana[key].unidades += v.cantidadVendida;
        dbPorSemana[key].neto += v.montoNeto || 0;
    }

    const allSemanas = [...new Set([...Object.keys(excelPorSemana), ...Object.keys(dbPorSemana)])].sort();
    let discrepanciasSem = 0;
    for (const sem of allSemanas) {
        const ex = excelPorSemana[sem] || { unidades: 0, neto: 0 };
        const db = dbPorSemana[sem] || { unidades: 0, neto: 0 };
        const deltaU = db.unidades - ex.unidades;
        const deltaN = db.neto - ex.neto;
        const ok = Math.abs(deltaU) < 0.01 && Math.abs(deltaN) < 2;
        if (!ok) discrepanciasSem++;
        const flag = ok ? '✅' : '⚠️ ';
        console.log(`${flag} ${sem.padEnd(10)} ${String(ex.unidades).padStart(8)} ${String(db.unidades).padStart(8)} ${String(deltaU).padStart(8)} │ ${ex.neto.toLocaleString('es-CL').padStart(14)} ${db.neto.toLocaleString('es-CL').padStart(14)} ${deltaN.toLocaleString('es-CL').padStart(12)}`);
    }
    console.log(`\n${discrepanciasSem === 0 ? '✅ Sin discrepancias semanales' : `⚠️  ${discrepanciasSem} semana(s) con discrepancias`}`);

    console.log('\n=======================================================\n');
    await prisma.$disconnect();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
