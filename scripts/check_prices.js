
const { getPrismaClient } = require('../prisma/client');
const prisma = getPrismaClient();

async function main() {
    console.log('Checking Precios Listas...');

    // Check total count
    const count = await prisma.precioLista.count();
    console.log(`Total registros en precios_listas: ${count}`);

    // Check unique list IDs
    const lists = await prisma.precioLista.groupBy({
        by: ['listaId'],
        _count: {
            id: true
        }
    });

    console.log('Listas encontradas:', lists);

    // Check a sample product
    const sample = await prisma.precioLista.findFirst({
        include: { producto: true }
    });

    if (sample) {
        console.log('Ejemplo de registro:', sample);
    } else {
        console.log('No hay registros de precios.');
    }
}

main().finally(() => prisma.$disconnect());
