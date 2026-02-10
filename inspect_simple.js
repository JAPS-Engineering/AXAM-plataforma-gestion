const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        console.log('Connecting...');
        const productCount = await prisma.producto.count();
        console.log(`Products: ${productCount}`);

        console.log('Checking PrecioLista...');
        const precioCount = await prisma.precioLista.count();
        console.log(`Precios: ${precioCount}`);

        if (precioCount > 0) {
            const first = await prisma.precioLista.findFirst();
            console.log('First price:', first);
        }

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}

check();
