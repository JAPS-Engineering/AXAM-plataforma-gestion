const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPrices() {
    try {
        const count = await prisma.precioLista.count();
        console.log(`Total PriceList entries: ${count}`);

        if (count > 0) {
            const sample = await prisma.precioLista.findMany({
                take: 5,
                include: { producto: true }
            });
            console.log('Sample entries:', JSON.stringify(sample, null, 2));
        } else {
            console.log('No entries found in PrecioLista table.');
        }

        // Check for specific product if visible in screenshot (e.g., KC12071)
        const specificProduct = await prisma.producto.findFirst({
            where: { sku: 'KC12071' },
            include: { preciosListas: true }
        });

        if (specificProduct) {
            console.log('Specific Product (KC12071):', JSON.stringify(specificProduct, null, 2));
        } else {
            console.log('Product KC12071 not found.');
        }

    } catch (error) {
        console.error('Error checking prices:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkPrices();
