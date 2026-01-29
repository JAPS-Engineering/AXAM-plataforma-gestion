
require('dotenv').config();
const { getPrismaClient } = require('../prisma/client');
const { logSection, logInfo, logSuccess, logError, logWarning } = require('../utils/logger');
const { getMonthlySales } = require('../services/salesService');

const prisma = getPrismaClient();

async function main() {
    logSection('SINCRONIZACIÓN DE VENTAS ACTUALES (FAVE + GDVE)');

    try {
        const fechaHoy = new Date();
        const year = fechaHoy.getFullYear();
        const month = fechaHoy.getMonth() + 1;

        logInfo(`Obteniendo ventas del mes actual (${month}/${year}) desde ERP...`);

        // 1. Usar el servicio unificado (FAVE + GDVE, Deduplicado, Vendedor Initials)
        const result = await getMonthlySales(year, month);
        const ventasMap = result.sales;

        logSuccess(`Total productos con ventas encontrados: ${ventasMap.size}`);

        if (ventasMap.size === 0) {
            logWarning('No se encontraron ventas en el mes actual.');
            return;
        }

        // 2. Limpiar tabla VentaActual antes de actualizar?
        // O mejor: Upsert/Update setting values to match current "Month to Date" total.
        // Dado que VentaActual es "Ventas del Mes en Curso", lo correcto es que refleje el total acumulado.
        // Como getMonthlySales devuelve el TOTAL acumulado del mes, debemos REEMPLAZAR el valor en DB, no incrementar.

        // Opción A: Resetear tabla completa (si solo guarda el mes actual)
        // Opción B: Iterar y actualizar.

        // Vamos a hacer Opción A para garantizar consistencia y limpiar registros obsoletos
        logInfo('Limpiando tabla VentaActual...');
        await prisma.ventaActual.deleteMany({});

        logInfo('Insertando registros actualizados...');
        let insertados = 0;
        let noEncontrados = 0;

        // Preparar operaciones masivas o secuenciales
        for (const [key, venta] of ventasMap) {
            const [sku, vendedor] = key.split('|');

            // Buscar producto
            const producto = await prisma.producto.findUnique({
                where: { sku }
            });

            if (!producto) {
                noEncontrados++;
                continue;
            }

            // Crear registro
            await prisma.ventaActual.create({
                data: {
                    productoId: producto.id,
                    vendedor: vendedor || 'Sin Vendedor',
                    cantidadVendida: venta.cantidad,
                    montoNeto: venta.montoNeto,
                    stockActual: 0 // Se actualiza con otro script
                }
            });
            insertados++;
        }

        logSuccess(`✅ VentaActual sincronizada.`);
        logSuccess(`   Insertados: ${insertados}`);
        logSuccess(`   Productos no encontrados: ${noEncontrados}`);

    } catch (error) {
        logError(`Error en syncVentasActuales: ${error.message}`);
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main();
}
