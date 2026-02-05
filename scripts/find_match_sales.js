
const { getPrismaClient } = require('../prisma/client');
const prisma = getPrismaClient();

async function findMatch() {
    console.log('=== FINDING MATCH FOR 163,479 ===');

    try {
        const target = 163479;
        const tolerance = 100; // allow small rounding diff

        // 1. Group by Product in VentaActual
        const byProduct = await prisma.ventaActual.groupBy({
            by: ['productoId'],
            _sum: { montoNeto: true }
        });

        const matchProd = byProduct.find(p => Math.abs(p._sum.montoNeto - target) < tolerance);
        if (matchProd) {
            console.log(`FOUND Product Match! ID: ${matchProd.productoId}, Amount: ${matchProd._sum.montoNeto}`);
            // Get product details
            const prod = await prisma.producto.findUnique({ where: { id: matchProd.productoId } });
            console.log(prod);
        } else {
            console.log('No exact product match found.');
        }

        // 2. Group by Vendor in VentaActual
        const byVendor = await prisma.ventaActual.groupBy({
            by: ['vendedor'],
            _sum: { montoNeto: true }
        });
        const matchVend = byVendor.find(v => Math.abs(v._sum.montoNeto - target) < tolerance);
        if (matchVend) {
            console.log(`FOUND Vendor Match! Vendor: ${matchVend.vendedor}, Amount: ${matchVend._sum.montoNeto}`);
        } else {
            console.log('No exact vendor match found.');
        }

        // 3. Search individual records
        const records = await prisma.ventaActual.findMany({
            where: {
                montoNeto: {
                    gte: target - tolerance,
                    lte: target + tolerance
                }
            }
        });

        if (records.length > 0) {
            console.log(`Found ${records.length} individual records matching ~${target}:`);
            records.forEach(r => console.log(r));
        } else {
            console.log('No individual record match found.');
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

findMatch();
