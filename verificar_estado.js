const { getPrismaClient } = require('./prisma/client');
const { getMesActual } = require('./services/rotacionService');
const { getChileDate } = require('./utils/timezone');

const prisma = getPrismaClient();

async function verificarEstado() {
    console.log('\n=== VERIFICACIÓN DE ESTADO DE DATOS ===\n');

    // 1. Verificar getMesActual actual
    const mesActualServidor = getMesActual();
    console.log('getMesActual() (servidor):', mesActualServidor);

    // 2. Verificar fecha Chile
    const fechaChile = getChileDate();
    const { getYear, getMonth } = require('date-fns');
    const mesActualChile = {
        ano: getYear(fechaChile),
        mes: getMonth(fechaChile) + 1
    };
    console.log('Mes actual Chile (correcto):', mesActualChile);
    console.log('Fecha Chile completa:', fechaChile.toISOString(), '\n');

    // 3. Verificar VentaHistorica por mes
    console.log('=== VENTAS HISTÓRICAS ===');
    const historicas = await prisma.ventaHistorica.groupBy({
        by: ['ano', 'mes'],
        _count: { _all: true },
        _sum: { montoNeto: true },
        orderBy: [{ ano: 'desc' }, { mes: 'desc' }]
    });

    historicas.forEach(h => {
        const monto = h._sum.montoNeto || 0;
        console.log(`${h.ano}-${String(h.mes).padStart(2, '0')}: ${h._count._all} registros, $${monto.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`);
    });

    // 4. Verificar VentaActual
    console.log('\n=== VENTAS ACTUALES (Mes en Curso) ===');
    const actuales = await prisma.ventaActual.aggregate({
        _count: { _all: true },
        _sum: { montoNeto: true, cantidadVendida: true }
    });

    const montoActual = actuales._sum.montoNeto || 0;
    console.log(`Registros: ${actuales._count._all}`);
    console.log(`Total Monto: $${montoActual.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`);
    console.log(`Total Cantidad: ${actuales._sum.cantidadVendida || 0}`);

    // 5. Mostrar algunos productos de VentaActual
    console.log('\n=== MUESTRA DE VENTAS ACTUALES (primeros 5) ===');
    const muestras = await prisma.ventaActual.findMany({
        take: 5,
        orderBy: { montoNeto: 'desc' },
        include: {
            producto: {
                select: { sku: true, descripcion: true }
            }
        }
    });

    muestras.forEach(v => {
        console.log(`${v.producto.sku}: $${v.montoNeto.toLocaleString('es-CL', { maximumFractionDigits: 0 })}, Cant: ${v.cantidadVendida}`);
    });

    // 6. Diagnóstico
    console.log('\n=== DIAGNÓSTICO ===');
    if (montoActual > 100000) {
        console.log('⚠️  PROBLEMA DETECTADO: VentaActual tiene datos significativos ($' +
            montoActual.toLocaleString('es-CL', { maximumFractionDigits: 0 }) + ')');
        console.log('    Esto sugiere que los datos de enero NO se resetearon correctamente.');
    } else {
        console.log('✅ VentaActual está prácticamente vacía (correcto para inicio de mes)');
    }

    const enero2026 = historicas.find(h => h.ano === 2026 && h.mes === 1);
    if (enero2026) {
        console.log('✅ Enero 2026 está en VentaHistorica: $' +
            (enero2026._sum.montoNeto || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 }));
    } else {
        console.log('⚠️  Enero 2026 NO está en VentaHistorica');
    }

    await prisma.$disconnect();
}

verificarEstado().catch(console.error);
