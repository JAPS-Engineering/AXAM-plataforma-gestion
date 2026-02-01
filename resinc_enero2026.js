// Script para resincronizar enero 2026
require('dotenv').config();
const { getMonthlySales } = require('./services/salesService');
const { getPrismaClient } = require('./prisma/client');
const { logSuccess, logError, logInfo } = require('./utils/logger');

const prisma = getPrismaClient();

async function resincEnero2026() {
    console.log('=== RESINCRONIZACIÓN DE ENERO 2026 ===\n');

    // 1. Eliminar datos existentes de enero 2026
    console.log('👉 Paso 1: Eliminando datos existentes de enero 2026...');
    const deleted = await prisma.ventaHistorica.deleteMany({
        where: { ano: 2026, mes: 1 }
    });
    console.log(`✅ Eliminados ${deleted.count} registros\n`);

    // 2. Obtener ventas de enero 2026 desde Manager+
    console.log('👉 Paso 2: Obteniendo ventas de enero 2026 desde Manager+...');
    const result = await getMonthlySales(2026, 1);
    console.log(`✅ Obtenidos ${result.sales.size} productos con ventas\n`);

    // 3. Guardar en VentaHistorica
    console.log('👉 Paso 3: Guardando en VentaHistorica...');
    let guardados = 0;
    let errores = 0;

    for (const [sku, ventasData] of result.sales.entries()) {
        try {
            // Buscar producto
            const producto = await prisma.producto.findUnique({
                where: { sku }
            });

            if (!producto) {
                console.log(`⚠️  Producto ${sku} no encontrado en BD`);
                continue;
            }

            // Guardar por vendedor
            for (const [vendedor, data] of Object.entries(ventasData.porVendedor || {})) {
                await prisma.ventaHistorica.upsert({
                    where: {
                        productoId_ano_mes_vendedor: {
                            productoId: producto.id,
                            ano: 2026,
                            mes: 1,
                            vendedor: vendedor
                        }
                    },
                    create: {
                        productoId: producto.id,
                        ano: 2026,
                        mes: 1,
                        vendedor: vendedor,
                        cantidadVendida: data.cantidad || 0,
                        montoNeto: data.monto || 0
                    },
                    update: {
                        cantidadVendida: data.cantidad || 0,
                        montoNeto: data.monto || 0
                    }
                });
                guardados++;
            }
        } catch (error) {
            errores++;
            console.log(`❌ Error con producto ${sku}: ${error.message}`);
        }
    }

    console.log(`\n✅ Guardados: ${guardados}, Errores: ${errores}\n`);

    // 4. Verificar resultado
    console.log('👉 Paso 4: Verificando resultado...');
    const verificacion = await prisma.ventaHistorica.aggregate({
        where: { ano: 2026, mes: 1 },
        _count: { _all: true },
        _sum: { montoNeto: true }
    });

    console.log(`\n=== RESULTADO FINAL ===`);
    console.log(`Enero 2026: ${verificacion._count._all} registros`);
    console.log(`Total Monto: $${(verificacion._sum.montoNeto || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })}`);

    await prisma.$disconnect();
}

resincEnero2026().catch(console.error);
