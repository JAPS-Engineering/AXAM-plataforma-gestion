const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL
        }
    },
    // log: ['query']
});

async function main() {
    console.log('DATABASE_URL:', process.env.DATABASE_URL);
    try {
        console.log('Connecting...');
        await prisma.$connect();

        console.log('Querying Productos...');
        try {
            const p = await prisma.producto.findFirst();
            console.log('Product Found:', p ? p.sku : 'None');
        } catch (e) {
            console.error('Product Query Failed:', e.message);
        }

        console.log('Querying VentaHistorica...');
        const vh = await prisma.ventaHistorica.findFirst();
        console.log('Result:', vh);

    } catch (e) {
        console.error('ERROR:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
