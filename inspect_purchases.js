
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const purchases = await prisma.compraHistorica.findMany({
        take: 5,
        orderBy: { fecha: 'desc' }
    });

    console.log("Muestra de CompraHistorica (últimas 5):");
    console.log(JSON.stringify(purchases, null, 2));

    const withProvider = await prisma.compraHistorica.count({
        where: {
            OR: [
                { proveedor: { not: "" } },
                { rutProveedor: { not: "" } }
            ]
        }
    });

    console.log(`Compras con información de proveedor: ${withProvider}`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
