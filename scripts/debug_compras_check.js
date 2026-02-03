
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const compras = await prisma.compraHistorica.findMany({
        select: { fecha: true }
    });

    console.log(`Total compras: ${compras.length}`);

    const porMes = {};
    compras.forEach(c => {
        const d = new Date(c.fecha);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        porMes[key] = (porMes[key] || 0) + 1;
    });

    console.log("Distribución por mes:");
    console.table(porMes);
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
