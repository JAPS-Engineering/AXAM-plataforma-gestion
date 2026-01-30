const { getPrismaClient } = require('../prisma/client');
const prisma = getPrismaClient();

async function main() {
    try {
        const count = await prisma.producto.count();
        console.log('Product count:', count);
        const vendedorCount = await prisma.vendedor.count();
        console.log('Vendedor count:', vendedorCount);

        const defaultVendor = await prisma.vendedor.findUnique({ where: { codigo: "" } });
        console.log('Default vendor (codigo=""):', defaultVendor);

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
