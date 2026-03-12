require('dotenv').config({ path: '/home/jeanf/axam/ordenes-de-compra/version-nueva/AXAM-plataforma-gestion/.env' });
const { getPrismaClient } = require('/home/jeanf/axam/ordenes-de-compra/version-nueva/AXAM-plataforma-gestion/prisma/client');
const prisma = getPrismaClient();

async function main() {
    const prod = await prisma.producto.findUnique({ where: { sku: 'KC12071' } });
    console.log('Producto id:', prod?.id);

    // ¿Hay datos de MARZO 2026 en ventaHistorica?
    const marzoHist = await prisma.ventaHistorica.findMany({
        where: { productoId: prod.id, ano: 2026, mes: 3 }
    });
    const sumaMarzoHist = marzoHist.reduce((s, r) => s + r.cantidadVendida, 0);
    console.log('\nventaHistorica MARZO 2026:', marzoHist.length, 'filas | total:', sumaMarzoHist, 'u');
    marzoHist.forEach(r => console.log(`  vendedor: ${r.vendedor} | ${r.cantidadVendida}u | $${r.montoNeto}`));

    // ¿Cuánto hay en ventaActual?
    const actual = await prisma.ventaActual.findMany({ where: { productoId: prod.id } });
    const sumaActual = actual.reduce((s, r) => s + r.cantidadVendida, 0);
    console.log('\nventaActual (mes en curso):', actual.length, 'filas | total:', sumaActual, 'u');
    actual.forEach(r => console.log(`  vendedor: ${r.vendedor} | ${r.cantidadVendida}u | $${r.montoNeto}`));

    console.log('\n--- ANÁLISIS ---');
    console.log(`Si ventasController suma hist(${sumaMarzoHist}u) + actual(${sumaActual}u) = ${sumaMarzoHist + sumaActual}u (¿coincide con Reporte Ingresos 718u?)`);
    console.log(`Si API Margenes suma hist sin mes actual (solo usa actual) = ${sumaActual}u`);

    // Total historial completo del rango filtro (ene-mar 2026)
    const totalHist = await prisma.ventaHistorica.groupBy({
        by: ['productoId'],
        _sum: { cantidadVendida: true, montoNeto: true },
        where: { productoId: prod.id, OR: [{ ano: 2026, mes: 1 }, { ano: 2026, mes: 2 }, { ano: 2026, mes: 3 }] }
    });
    console.log('\ngroupBy total hist 3 meses:', totalHist[0]?._sum?.cantidadVendida, 'u (lo que daría /api/margenes viejo)');

    await prisma.$disconnect();
}
main().catch(console.error);
