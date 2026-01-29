
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function main() {
    console.log('--- Verificación de Vendedores en BD ---');

    // 1. Verificar VentaHistorica
    console.log('\nAnalizando VentaHistorica...');
    const ventasHistoricas = await prisma.ventaHistorica.groupBy({
        by: ['vendedor'],
        _count: {
            id: true
        },
        _sum: {
            montoNeto: true
        },
        orderBy: {
            _sum: {
                montoNeto: 'desc'
            }
        }
    });

    if (ventasHistoricas.length === 0) {
        console.log('⚠️ No hay registros en VentaHistorica.');
    } else {
        console.table(ventasHistoricas.map(v => ({
            vendedor: v.vendedor || '<VACIO>',
            registros: v._count.id,
            monto: Math.round(v._sum.montoNeto).toLocaleString()
        })));
    }

    // 2. Verificar VentaActual
    console.log('\nAnalizando VentaActual...');
    const ventasActuales = await prisma.ventaActual.groupBy({
        by: ['vendedor'],
        _count: {
            id: true
        },
        _sum: {
            montoNeto: true
        },
        orderBy: {
            _sum: {
                montoNeto: 'desc'
            }
        }
    });

    if (ventasActuales.length === 0) {
        console.log('⚠️ No hay registros en VentaActual.');
    } else {
        console.table(ventasActuales.map(v => ({
            vendedor: v.vendedor || '<VACIO>',
            registros: v._count.id,
            monto: Math.round(v._sum.montoNeto).toLocaleString()
        })));
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
