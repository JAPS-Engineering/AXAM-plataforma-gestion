
const { getPrismaClient } = require('../prisma/client');
const prisma = getPrismaClient();

async function debug() {
    console.log('=== DEBUG CHART DISCREPANCY ===');

    try {
        // 1. Raw sum of VentaActual
        const rawSum = await prisma.ventaActual.aggregate({
            _sum: { montoNeto: true }
        });
        console.log(`Raw VentaActual Sum: ${rawSum._sum.montoNeto}`);

        // 2. Group by Vendedor in VentaActual
        const byVendor = await prisma.ventaActual.groupBy({
            by: ['vendedor'],
            _sum: { montoNeto: true },
            orderBy: { _sum: { montoNeto: 'desc' } }
        });
        console.log('\nVentaActual by Vendor (Top 10):');
        byVendor.slice(0, 10).forEach(v => {
            console.log(` - ${v.vendedor}: ${v._sum.montoNeto}`);
        });

        // 3. Simulate the Chart Query (Raw SQL)
        const mesActual = 2; // Feb
        const anoActual = 2026;

        const ventasTableSql = `
            (
                SELECT producto_id, ano, mes, vendedor, cantidad_vendida, monto_neto 
                FROM ventas_mensuales
                UNION ALL
                SELECT producto_id, ${anoActual} as ano, ${mesActual} as mes, vendedor, cantidad_vendida, monto_neto 
                FROM ventas_actuales 
                WHERE monto_neto > 0
            )
        `;

        // Query with JOIN products
        const chartQuery = await prisma.$queryRawUnsafe(`
            SELECT 
                v.vendedor,
                SUM(v.monto_neto) as value
            FROM ${ventasTableSql} v
            JOIN productos p ON v.producto_id = p.id
            WHERE v.ano = ${anoActual} AND v.mes = ${mesActual}
            GROUP BY v.vendedor
            ORDER BY value DESC
        `);

        console.log('\nChart Query Results (Feb 2026):');
        chartQuery.slice(0, 15).forEach(v => {
            console.log(` - ${v.vendedor}: ${v.value}`);
        });

        // 4. Check for 'cas' specifically
        const cas = byVendor.find(v => v.vendedor === 'cas');
        if (cas) {
            console.log(`\n'cas' in VentaActual: ${cas._sum.montoNeto}`);

            const casInChart = chartQuery.find(v => v.vendedor === 'cas');
            if (casInChart) {
                console.log(`'cas' in Chart Query: ${casInChart.value}`);
            } else {
                console.log(`'cas' MISSING in Chart Query!`);

                // Debug why: Get 'cas' products
                console.log("Checking 'cas' products in VentaActual...");
                const casSales = await prisma.ventaActual.findMany({
                    where: { vendedor: 'cas' },
                    select: { productoId: true, montoNeto: true }
                });

                const prodIds = casSales.map(s => s.productoId);
                console.log(`'cas' sold ${casSales.length} items. Product IDs: ${prodIds.slice(0, 5)}...`);

                // Check if these products exist in table
                const existingProds = await prisma.producto.findMany({
                    where: { id: { in: prodIds } },
                    select: { id: true, sku: true }
                });
                console.log(`Found ${existingProds.length} of ${prodIds.length} products in DB.`);
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

debug();
