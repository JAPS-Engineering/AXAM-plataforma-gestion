/**
 * Script de diagnóstico para verificar el estado de VentaActual
 * Uso: node scripts/debug_venta_actual.js
 */

require('dotenv').config();
const { getPrismaClient } = require('../prisma/client');

const prisma = getPrismaClient();

async function main() {
    console.log('=== DIAGNÓSTICO DE VENTA ACTUAL ===\n');

    // 1. Contar registros en VentaActual
    const countVentaActual = await prisma.ventaActual.count();
    console.log(`1. Total registros en VentaActual: ${countVentaActual}`);

    if (countVentaActual === 0) {
        console.log('\n⚠️  LA TABLA VentaActual ESTÁ VACÍA!');
        console.log('   Esto explica por qué "Venta Mes" muestra 0.');
        console.log('   Ejecuta: node scripts/syncDaily.js current');
        console.log('   Para poblar la tabla con datos del mes actual.\n');
    } else {
        // 2. Mostrar algunos registros de ejemplo
        const sampleRecords = await prisma.ventaActual.findMany({
            take: 10,
            include: { producto: { select: { sku: true, descripcion: true } } },
            orderBy: { cantidadVendida: 'desc' }
        });

        console.log('\n2. Top 10 productos con más ventas en VentaActual:');
        sampleRecords.forEach((r, i) => {
            console.log(`   ${i + 1}. ${r.producto.sku}: ${r.cantidadVendida} unidades, Stock: ${r.stockActual}`);
        });

        // 3. Sumar ventas totales
        const totalVentas = await prisma.ventaActual.aggregate({
            _sum: { cantidadVendida: true, montoNeto: true }
        });
        console.log(`\n3. Total ventas en VentaActual:`);
        console.log(`   Cantidad: ${totalVentas._sum.cantidadVendida || 0}`);
        console.log(`   Monto Neto: $${(totalVentas._sum.montoNeto || 0).toLocaleString('es-CL')}`);

        // 4. Verificar última actualización
        const lastUpdate = await prisma.ventaActual.findFirst({
            orderBy: { updatedAt: 'desc' },
            select: { updatedAt: true }
        });
        console.log(`\n4. Última actualización de VentaActual: ${lastUpdate?.updatedAt || 'N/A'}`);
    }

    // 5. Comparar con VentaHistorica del mes actual
    const now = new Date();
    const mesActual = now.getMonth() + 1;
    const anoActual = now.getFullYear();

    const ventasHistoricasMesActual = await prisma.ventaHistorica.aggregate({
        where: { ano: anoActual, mes: mesActual },
        _sum: { cantidadVendida: true, montoNeto: true },
        _count: true
    });

    console.log(`\n5. VentaHistorica del mes actual (${mesActual}/${anoActual}):`);
    console.log(`   Registros: ${ventasHistoricasMesActual._count}`);
    console.log(`   Cantidad: ${ventasHistoricasMesActual._sum.cantidadVendida || 0}`);
    console.log(`   Monto Neto: $${(ventasHistoricasMesActual._sum.montoNeto || 0).toLocaleString('es-CL')}`);

    // 6. Verificar el mes anterior para comparación
    let mesAnterior = mesActual - 1;
    let anoAnterior = anoActual;
    if (mesAnterior === 0) {
        mesAnterior = 12;
        anoAnterior--;
    }

    const ventasHistoricasMesAnterior = await prisma.ventaHistorica.aggregate({
        where: { ano: anoAnterior, mes: mesAnterior },
        _sum: { cantidadVendida: true, montoNeto: true },
        _count: true
    });

    console.log(`\n6. VentaHistorica del mes anterior (${mesAnterior}/${anoAnterior}):`);
    console.log(`   Registros: ${ventasHistoricasMesAnterior._count}`);
    console.log(`   Cantidad: ${ventasHistoricasMesAnterior._sum.cantidadVendida || 0}`);
    console.log(`   Monto Neto: $${(ventasHistoricasMesAnterior._sum.montoNeto || 0).toLocaleString('es-CL')}`);

    console.log('\n=== FIN DEL DIAGNÓSTICO ===');

    await prisma.$disconnect();
}

main().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
