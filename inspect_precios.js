const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPrices() {
    try {
        const count = await prisma.precioLista.count();
        console.log(`Total PrecioLista records: ${count}`);

        if (count > 0) {
            const byList = await prisma.precioLista.groupBy({
                by: ['listaId'],
                _count: {
                    id: true
                }
            });
            console.log('Counts by List ID:', byList);

            const samples = await prisma.precioLista.findMany({
                take: 5
            });
            console.log('Samples:', samples);
        } else {
            console.log('No records found in PrecioLista.');
        }

        // Check if there are products without prices
        const productCount = await prisma.producto.count();
        console.log(`Total Products: ${productCount}`);

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkPrices();
