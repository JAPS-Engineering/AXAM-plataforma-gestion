
const { getPrismaClient } = require('../prisma/client');
const prisma = getPrismaClient();

async function debug() {
    console.log('=== DEBUG SALES DISCREPANCY ===');

    try {
        const mesActual = 2; // Feb
        const anoActual = 2026;

        // Method A: Direct Aggregation (Target Controller Style)
        // 1. VentaActual
        const aggActual = await prisma.ventaActual.aggregate({
            _sum: { montoNeto: true },
            _count: { id: true }
        });
        const totalActual = aggActual._sum.montoNeto || 0;
        const countActual = aggActual._count.id;
        console.log(`Method A (Direct) - VentaActual: ${totalActual} (Count: ${countActual})`);

        // 2. VentaHistorica for current month (Should be 0 if sync is correct, but checking)
        const aggHist = await prisma.ventaHistorica.aggregate({
            where: { mes: mesActual, ano: anoActual },
            _sum: { montoNeto: true }
        });
        const totalHist = aggHist._sum.montoNeto || 0;
        console.log(`Method A (Direct) - VentaHistorica (Feb 2026): ${totalHist}`);

        const totalA = totalActual + totalHist;
        console.log(`Method A TOTAL: ${totalA}`);

        // Method B: Via Products (Dashboard Controller Style)
        const productos = await prisma.producto.findMany({
            include: {
                ventasActuales: true,
                ventasHistoricas: {
                    where: { mes: mesActual, ano: anoActual }
                }
            }
        });

        let totalB = 0;
        let totalRanking = 0;
        let totalExcluded = 0;
        let productsWithSales = 0;
        let productsWithPositiveSales = 0;

        productos.forEach(p => {
            let pTotal = 0;
            // Sum Actual
            p.ventasActuales.forEach(v => pTotal += v.montoNeto);
            // Sum Hist
            p.ventasHistoricas.forEach(v => pTotal += v.montoNeto);

            totalB += pTotal;

            if (pTotal > 0) {
                totalRanking += pTotal;
                productsWithPositiveSales++;
            } else {
                totalExcluded += pTotal;
            }

            if (pTotal !== 0) productsWithSales++;
        });

        console.log(`Method B (Via Products) TOTAL (Net): ${totalB}`);
        console.log(`Method B (Ranking Logic, >0 Only): ${totalRanking}`);
        console.log(`Excluded (<=0): ${totalExcluded}`);

        console.log(`Products with any sales: ${productsWithSales}`);
        console.log(`Products with POSITIVE sales: ${productsWithPositiveSales}`);

        const diff = totalA - totalB;
        console.log(`\nDIFFERENCE (A - B): ${diff}`);
        console.log(`DIFFERENCE (A - Ranking): ${totalA - totalRanking}`);

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

debug();
