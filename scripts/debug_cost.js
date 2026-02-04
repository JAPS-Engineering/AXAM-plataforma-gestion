
const { getPrismaClient } = require('../prisma/client');
const prisma = getPrismaClient();

async function main() {
    const sku = 'KC00369U';
    console.log(`Checking product: ${sku}`);

    const product = await prisma.producto.findUnique({
        where: { sku },
        include: {
            comprasHistoricas: {
                orderBy: { fecha: 'desc' },
                take: 5
            },
            ventasHistoricas: {
                orderBy: [{ ano: 'desc' }, { mes: 'desc' }],
                take: 5
            }
        }
    });

    if (!product) {
        console.log('Product not found in DB');
        return;
    }

    console.log('Product Data:', {
        id: product.id,
        sku: product.sku,
        precioUltimaCompra: product.precioUltimaCompra,
        fechaUltimaCompra: product.fechaUltimaCompra
    });

    console.log(`Found ${product.comprasHistoricas.length} historical purchases.`);
    product.comprasHistoricas.forEach(c => {
        console.log(` - Purchase: ${c.fecha.toISOString()} | Qty: ${c.cantidad} | Price: ${c.precioUnitario} | Prov: ${c.proveedor}`);
    });

    console.log(`Found ${product.ventasHistoricas.length} recent sales months.`);
    product.ventasHistoricas.forEach(v => {
        console.log(` - Sale: ${v.mes}/${v.ano} | Qty: ${v.cantidadVendida}`);
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
