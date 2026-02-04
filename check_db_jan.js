
const { getPrismaClient } = require('./prisma/client');
const prisma = getPrismaClient();

async function checkDbTotal() {
    const startDate = new Date(2026, 0, 1);
    const endDate = new Date(2026, 0, 31);
    endDate.setHours(23, 59, 59, 999);

    const aggregations = await prisma.compraHistorica.aggregate({
        _sum: {
            cantidad: true,
        },
        where: {
            fecha: {
                gte: startDate,
                lte: endDate
            }
        }
    });

    // Prisma doesn't support sum(qty * price) directly easily without raw query
    // Let's do raw query for accuracy
    const result = await prisma.$queryRaw`
        SELECT SUM(cantidad * precio_unitario) as total
        FROM compras_historicas
        WHERE fecha >= ${startDate} AND fecha <= ${endDate}
    `;

    console.log('DB Total Jan 2026:', result[0].total);
    await prisma.$disconnect();
}

checkDbTotal();
