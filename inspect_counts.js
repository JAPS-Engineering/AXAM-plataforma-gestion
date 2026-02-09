
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const products = await prisma.producto.count();
    const purchases = await prisma.compraHistorica.count();
    const productsWithProvider = await prisma.producto.count({
        where: {
            rutProveedor: { not: "" }
        }
    });

    console.log(`Products: ${products}`);
    console.log(`Historical Purchases: ${purchases}`);
    console.log(`Products with Provider RUT: ${productsWithProvider}`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
