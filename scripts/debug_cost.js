
const { getPrismaClient } = require('../prisma/client');
const prisma = getPrismaClient();

async function main() {
    const targets = ['KC12071', 'KC15880', 'KC29431', 'KC41002', 'KC24771'];

    for (const base of targets) {
        const skus = [base, base + 'U'];
        for (const sku of skus) {
            const product = await prisma.producto.findUnique({
                where: { sku }
            });
            if (product) {
                console.log(`FOUND: ${sku} (ID: ${product.id}) - Cost: ${product.precioUltimaCompra}`);
            }
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
