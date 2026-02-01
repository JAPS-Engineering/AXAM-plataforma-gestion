const { getPrismaClient } = require('./prisma/client');
const { getMesActual } = require('./services/rotacionService');

const prisma = getPrismaClient();

async function verificarDatos() {
    console.log('=== VERIFICACIÓN DE DATOS ===\n');

    const mesActual = getMesActual();
    console.log('Mes Actual según getMesActual():', mesActual);

    // Verificar VentaHistorica
    const historicas = await prisma.ventaHistorica.groupBy({
        by: ['ano', 'mes'],
        _count: { _all: true },
        _sum: { montoNeto: true },
        orderBy: [{ ano: 'desc' }, { mes: 'desc' }]
    });

    console.log('\n=== VENTAS HISTÓRICAS POR MES ===');
    historicas.forEach(h => {
        console.log(`${h.ano}-${h.mes}: ${h._count._all} registros, $${h._sum.montoNeto?.toFixed(0) || 0}`);
    });

    // Verificar VentaActual
    const actuales = await prisma.ventaActual.aggregate({
        _count: { _all: true },
        _sum: { montoNeto: true }
    });

    console.log('\n=== VENTAS ACTUALES (MES EN CURSO) ===');
    console.log(`Registros: ${actuales._count._all}, Total: $${actuales._sum.montoNeto?.toFixed(0) || 0}`);

    // Ver algunos registros de VentaActual
    const samplesActuales = await prisma.ventaActual.findMany({
        take: 3,
        include: { producto: { select: { sku: true } } }
    });

    console.log('\nMuestra de VentaActual:');
    samplesActuales.forEach(v => {
        console.log(`  Producto ${v.producto.sku}: Vendido=$${v.montoNeto.toFixed(0)}, Cantidad=${v.cantidadVendida}`);
    });

    await prisma.$disconnect();
}

verificarDatos().catch(console.error);
