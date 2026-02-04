const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSuppliers() {
    try {
        const total = await prisma.producto.count();
        const withSupplier = await prisma.producto.count({
            where: {
                proveedor: {
                    not: ""
                }
            }
        });

        console.log(`Total Products: ${total}`);
        console.log(`With Supplier: ${withSupplier}`);
        console.log(`Empty Supplier: ${total - withSupplier}`);

        // Sample of empty supplier products
        const sample = await prisma.producto.findMany({
            where: { proveedor: "" },
            take: 5,
            select: { sku: true, descripcion: true, proveedor: true }
        });

        if (sample.length > 0) {
            console.log('Sample with empty supplier:', JSON.stringify(sample, null, 2));
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkSuppliers();
