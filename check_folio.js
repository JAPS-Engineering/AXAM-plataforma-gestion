
const { getPrismaClient } = require('./prisma/client');
const prisma = getPrismaClient();

async function checkFolio() {
    console.log('--- Checking Folio 752873 in DB ---');
    const records = await prisma.compraHistorica.findMany({
        where: {
            folio: '752873'
        },
        include: {
            producto: { select: { sku: true } }
        }
    });

    let total = 0;
    records.forEach(r => {
        const lineTotal = r.cantidad * r.precioUnitario;
        console.log(`SKU: ${r.producto.sku} | Qty: ${r.cantidad} | Price: ${r.precioUnitario} | LineTotal: ${lineTotal}`);
        total += lineTotal;
    });

    console.log(`DB Total for Folio 752873: ${total}`);
    await prisma.$disconnect();
}

checkFolio();
