
const { getPrismaClient } = require('./prisma/client');
const prisma = getPrismaClient();

async function checkDuplicates() {
    try {
        console.log('Checking for duplicates in CompraHistorica...');

        // Group by fields that should define uniqueness
        // Since we don't have a unique ID, we used productoId + fecha + quantity + price + folio
        // This is a heuristic.
        const duplicates = await prisma.$queryRaw`
            SELECT producto_id, fecha, cantidad, precio_unitario, folio, COUNT(*) as count
            FROM compras_historicas
            GROUP BY producto_id, fecha, cantidad, precio_unitario, folio
            HAVING COUNT(*) > 1
            LIMIT 10
        `;

        if (duplicates.length > 0) {
            console.log('DUPLICATES FOUND!');
            console.log(duplicates);

            const totalCount = await prisma.compraHistorica.count();
            console.log('Total records:', totalCount);
        } else {
            console.log('No obvious duplicates found with this grouping.');
            const totalCount = await prisma.compraHistorica.count();
            console.log('Total records:', totalCount);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkDuplicates();
