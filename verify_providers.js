
const { syncAllProviders, inferFromHistory } = require('./services/providerService');
const { getPrismaClient } = require('./prisma/client');
const prisma = getPrismaClient();

async function verify() {
    console.log("--- VERIFICACIÓN DE PROVEEDORES ---");

    // 1. Probar inferencia individual
    const sampleProduct = await prisma.producto.findFirst();
    if (sampleProduct) {
        console.log(`Producto: ${sampleProduct.sku} (ID: ${sampleProduct.id})`);
        const inferred = await inferFromHistory(sampleProduct.id);
        console.log("Inferencia:", inferred);
    }

    // 2. Probar sincronización masiva
    console.log("\nEjecutando syncAllProviders()...");
    const result = await syncAllProviders();
    console.log("Resultado Sync:", result);

    // 3. Verificar si hay productos con RUT ahora
    const withRut = await prisma.producto.count({
        where: { rutProveedor: { not: "" } }
    });
    console.log(`Productos con RUT de proveedor: ${withRut}`);

    await prisma.$disconnect();
}

verify().catch(console.error);
