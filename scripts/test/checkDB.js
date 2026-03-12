require('dotenv').config({ path: '/home/jeanf/axam/ordenes-de-compra/version-nueva/AXAM-plataforma-gestion/.env' });
const { getPrismaClient } = require('/home/jeanf/axam/ordenes-de-compra/version-nueva/AXAM-plataforma-gestion/prisma/client');
const prisma = getPrismaClient();

async function main() {
    const prod = await prisma.producto.findUnique({ where: { sku: 'KC12071' } });
    console.log('Producto id:', prod?.id, '|', prod?.nombre);

    // Enero 2026 en ventaHistorica
    const ene = await prisma.ventaHistorica.findMany({
        where: { productoId: prod.id, ano: 2026, mes: 1 }
    });
    console.log('\nventaHistorica KC12071 - Enero 2026:');
    console.log('Registros:', ene.length);
    let totalEne = 0;
    for (const v of ene) {
        console.log(`  vendedor: '${v.vendedor || '(vacio)'}' | cant: ${v.cantidadVendida} | monto: ${v.montoNeto}`);
        totalEne += v.cantidadVendida;
    }
    console.log('TOTAL efectivo en DB para ene-2026:', totalEne, 'u');

    // Febrero 2026 en ventaHistorica
    const feb = await prisma.ventaHistorica.findMany({
        where: { productoId: prod.id, ano: 2026, mes: 2 }
    });
    console.log('\nventaHistorica KC12071 - Febrero 2026:');
    console.log('Registros:', feb.length);
    let totalFeb = 0;
    for (const v of feb) {
        console.log(`  vendedor: '${v.vendedor || '(vacio)'}' | cant: ${v.cantidadVendida} | monto: ${v.montoNeto}`);
        totalFeb += v.cantidadVendida;
    }
    console.log('TOTAL efectivo en DB para feb-2026:', totalFeb, 'u');

    await prisma.$disconnect();
}

main().catch(console.error);
