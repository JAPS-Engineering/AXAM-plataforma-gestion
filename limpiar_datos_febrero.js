const { getPrismaClient } = require('./prisma/client');

const prisma = getPrismaClient();

async function limpiarDatosIncorrectos() {
    console.log('=== LIMPIEZA DE DATOS INCORRECTOS ===\n');

    // Los datos de 2026-02 son incorrectos (son de enero mal etiquetados)
    // Deben eliminarse porque la rotación ya guardó correctamente los datos como 2026-01

    console.log('Verificando datos de febrero 2026...');
    const feb2026 = await prisma.ventaHistorica.count({
        where: { ano: 2026, mes: 2 }
    });

    console.log(`Encontrados ${feb2026} registros en 2026-02 (incorrectos)`);

    if (feb2026 > 0) {
        console.log('\nEliminando datos incorrectos de febrero 2026...');
        const resultado = await prisma.ventaHistorica.deleteMany({
            where: { ano: 2026, mes: 2 }
        });

        console.log(`✅ Eliminados ${resultado.count} registros`);
    } else {
        console.log('✅ No hay datos incorrectos para eliminar');
    }

    // Verificar estado final
    console.log('\n=== ESTADO FINAL ===');
    const enero2026 = await prisma.ventaHistorica.aggregate({
        where: { ano: 2026, mes: 1 },
        _count: { _all: true },
        _sum: { montoNeto: true }
    });

    console.log(`Enero 2026: ${enero2026._count._all} registros, $${(enero2026._sum.montoNeto || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })}`);

    const feb2026Final = await prisma.ventaHistorica.count({
        where: { ano: 2026, mes: 2 }
    });

    console.log(`Febrero 2026: ${feb2026Final} registros (debe ser 0)`);

    await prisma.$disconnect();
}

limpiarDatosIncorrectos().catch(console.error);
