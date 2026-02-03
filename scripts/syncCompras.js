/**
 * Script de sincronización de compras históricas (FACE)
 * 
 * Sincroniza Facturas de Compra para mantener:
 * - Historial de precios de compra por producto
 * - Costo de última compra actualizado en Producto
 * 
 * Uso: node scripts/syncCompras.js [comando] [opciones]
 * 
 * Comandos:
 *   full, 2021        - Sincronización completa desde enero 2021
 *   init [N]          - Sincronización de últimos N meses (defecto: 12)
 *   month [año] [mes] - Sincronizar un mes específico
 *   current           - Sincronizar solo el mes actual
 *   yesterday         - Sincronizar solo el día anterior (para CRON diario)
 */

require('dotenv').config();
const { format, subDays, eachDayOfInterval, startOfMonth, endOfMonth } = require('date-fns');
const { getPrismaClient } = require('../prisma/client');
const { logSection, logSuccess, logError, logWarning, logInfo } = require('../utils/logger');
const { getMonthlyPurchases, getDailyPurchases, getAllPurchases } = require('../services/purchaseService');
const { getWhiteListSKUs } = require('../services/salesService');

const prisma = getPrismaClient();

/**
 * Procesar compras y guardar en base de datos
 * @param {Array} products - Lista de productos comprados
 * @param {number} year - Año para el SyncLog
 * @param {number} month - Mes para el SyncLog
 */
async function processPurchases(products, year, month) {
    if (!products || products.length === 0) {
        logInfo('No hay compras para procesar');
        return { processed: 0, updated: 0 };
    }

    // Obtener White List para filtrar
    let whiteList = null;
    try {
        whiteList = await getWhiteListSKUs();
    } catch (error) {
        logWarning('No se pudo obtener White List, procesando todos los productos');
    }

    // Filtrar por White List si existe
    let filteredProducts = products;
    if (whiteList) {
        filteredProducts = products.filter(p => whiteList.has(p.sku));
        logInfo(`Filtrado: ${filteredProducts.length} compras de productos permitidos (de ${products.length})`);
    }

    // Obtener mapa de SKU -> productoId
    const skus = [...new Set(filteredProducts.map(p => p.sku))];
    const existingProducts = await prisma.producto.findMany({
        where: { sku: { in: skus } },
        select: { id: true, sku: true, precioUltimaCompra: true, fechaUltimaCompra: true }
    });

    const skuToProduct = new Map();
    existingProducts.forEach(p => skuToProduct.set(p.sku, p));

    let processed = 0;
    let updated = 0;
    const productsToUpdateCost = new Map(); // sku -> { precio, fecha }

    // Agrupar compras por producto para inserción batch
    for (const purchase of filteredProducts) {
        const product = skuToProduct.get(purchase.sku);
        if (!product) {
            // Producto no existe en catálogo, skip
            continue;
        }

        try {
            // Insertar en CompraHistorica
            await prisma.compraHistorica.create({
                data: {
                    productoId: product.id,
                    fecha: purchase.fecha,
                    cantidad: purchase.cantidad,
                    precioUnitario: purchase.precioUnitario,
                    proveedor: purchase.proveedor || null,
                    rutProveedor: purchase.rutProveedor || null,
                    folio: purchase.folio || null
                }
            });
            processed++;

            // Rastrear el precio más reciente para actualizar Producto
            const existing = productsToUpdateCost.get(purchase.sku);
            if (!existing || purchase.fecha > existing.fecha) {
                productsToUpdateCost.set(purchase.sku, {
                    precio: purchase.precioUnitario,
                    fecha: purchase.fecha
                });
            }

        } catch (error) {
            // Posible duplicado, ignorar
            if (!error.message.includes('Unique constraint')) {
                logWarning(`Error al guardar compra ${purchase.sku}: ${error.message}`);
            }
        }
    }

    // Actualizar precioUltimaCompra en productos
    for (const [sku, data] of productsToUpdateCost) {
        const product = skuToProduct.get(sku);
        if (!product) continue;

        // Solo actualizar si la fecha es más reciente
        const shouldUpdate = !product.fechaUltimaCompra ||
            new Date(data.fecha) > new Date(product.fechaUltimaCompra);

        if (shouldUpdate) {
            await prisma.producto.update({
                where: { id: product.id },
                data: {
                    precioUltimaCompra: data.precio,
                    fechaUltimaCompra: data.fecha
                }
            });
            updated++;
        }
    }

    // Registrar en SyncLog
    await prisma.syncLog.create({
        data: {
            tipo: 'compras_historicas',
            mesTarget: month,
            anoTarget: year,
            documentos: 0,
            productos: processed,
            productosConVentas: updated,
            mensaje: `Compras procesadas: ${processed}, Costos actualizados: ${updated}`
        }
    });

    logSuccess(`✅ Compras procesadas: ${processed}, Costos actualizados: ${updated}`);

    return { processed, updated };
}

/**
 * Sincronizar compras del día anterior (para CRON diario)
 */
async function syncYesterday() {
    logSection('SINCRONIZANDO COMPRAS DEL DÍA ANTERIOR');

    const yesterday = subDays(new Date(), 1);
    const year = yesterday.getFullYear();
    const month = yesterday.getMonth() + 1;

    try {
        const { products } = await getDailyPurchases(yesterday);
        return await processPurchases(products, year, month);
    } catch (error) {
        logError(`Error sincronizando compras de ayer: ${error.message}`);
        throw error;
    }
}

/**
 * Sincronizar compras del mes actual
 */
async function syncCurrentMonth() {
    logSection('SINCRONIZANDO COMPRAS DEL MES ACTUAL');

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    try {
        const { products } = await getMonthlyPurchases(year, month);
        return await processPurchases(products, year, month);
    } catch (error) {
        logError(`Error sincronizando compras del mes actual: ${error.message}`);
        throw error;
    }
}

/**
 * Sincronizar compras de un mes específico
 */
async function syncMonth(year, month) {
    logSection(`SINCRONIZANDO COMPRAS DE ${month}/${year}`);

    try {
        const { products } = await getMonthlyPurchases(year, month);
        return await processPurchases(products, year, month);
    } catch (error) {
        logError(`Error sincronizando compras de ${month}/${year}: ${error.message}`);
        throw error;
    }
}

/**
 * Sincronización inicial de N meses hacia atrás
 */
async function syncInitial(months = 12) {
    logSection(`SINCRONIZACIÓN INICIAL DE COMPRAS (${months} MESES)`);

    const now = new Date();
    let totalProcessed = 0;
    let totalUpdated = 0;

    for (let i = 0; i < months; i++) {
        const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = targetDate.getFullYear();
        const month = targetDate.getMonth() + 1;

        logInfo(`\n📅 Procesando ${month}/${year}...`);

        try {
            const { processed, updated } = await syncMonth(year, month);
            totalProcessed += processed;
            totalUpdated += updated;
        } catch (error) {
            logError(`Error en ${month}/${year}: ${error.message}`);
        }

        // Pequeña pausa entre meses para no saturar API
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logSuccess(`\n📊 RESUMEN: ${totalProcessed} compras procesadas, ${totalUpdated} costos actualizados`);
    return { processed: totalProcessed, updated: totalUpdated };
}

/**
 * Sincronización completa desde enero 2021
 */
async function syncFull2021() {
    logSection('SINCRONIZACIÓN COMPLETA DE COMPRAS DESDE 2021');

    const startYear = 2021;
    const startMonth = 1;
    const now = new Date();
    const endYear = now.getFullYear();
    const endMonth = now.getMonth() + 1;

    let totalProcessed = 0;
    let totalUpdated = 0;

    for (let year = startYear; year <= endYear; year++) {
        const monthStart = (year === startYear) ? startMonth : 1;
        const monthEnd = (year === endYear) ? endMonth : 12;

        for (let month = monthStart; month <= monthEnd; month++) {
            logInfo(`\n📅 Procesando ${month}/${year}...`);

            try {
                const { processed, updated } = await syncMonth(year, month);
                totalProcessed += processed;
                totalUpdated += updated;
            } catch (error) {
                logError(`Error en ${month}/${year}: ${error.message}`);
            }

            // Pausa entre meses
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    logSuccess(`\n📊 RESUMEN FINAL: ${totalProcessed} compras procesadas, ${totalUpdated} costos actualizados`);
    return { processed: totalProcessed, updated: totalUpdated };
    logSuccess(`\n📊 RESUMEN FINAL: ${totalProcessed} compras procesadas, ${totalUpdated} costos actualizados`);
    return { processed: totalProcessed, updated: totalUpdated };
}

/**
 * Resetear historial de compras (Borrar todo)
 * Útil cuando hay errores de sincronización masivos
 */
async function resetHistory() {
    logSection('⚠️  RESETEANDO HISTORIAL DE COMPRAS  ⚠️');

    const count = await prisma.compraHistorica.count();
    logWarning(`Se eliminarán ${count} registros de compras históricas.`);

    // Confirmación visual (delay)
    logInfo('Iniciando en 3 segundos...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    await prisma.compraHistorica.deleteMany({});

    logSuccess('✅ Historial de compras eliminado correctamente.');
}

// CLI
async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'yesterday';

    switch (command) {
        case 'yesterday':
        case 'daily':
            await syncYesterday();
            break;

        case 'current':
            await syncCurrentMonth();
            break;

        case 'init':
        case 'initial':
            const months = parseInt(args[1]) || 12;
            await syncInitial(months);
            break;

        case 'full':
        case '2021':
            await syncFull2021();
            break;

        case 'month':
            const year = parseInt(args[1]) || new Date().getFullYear();
            const month = parseInt(args[2]) || new Date().getMonth() + 1;
            await syncMonth(year, month);
            await syncMonth(year, month);
            break;

        case 'reset':
            await resetHistory();
            break;

        default:
            console.log(`
Uso: node scripts/syncCompras.js [comando] [opciones]

Comandos:
  yesterday, daily    - Sincroniza el día anterior (defecto, para CRON)
  current             - Sincroniza el mes actual
  init, initial [N]   - Sincronización inicial de N meses (defecto: 12)
  full, 2021          - Sincronización completa desde enero 2021
  month [año] [mes]   - Sincronizar un mes específico
  reset               - Borrar todo el historial de compras (CUIDADO)
            `);
    }

    await prisma.$disconnect();
}

if (require.main === module) {
    main().catch(error => {
        logError(`Error fatal: ${error.message}`);
        process.exit(1);
    });
}

module.exports = {
    syncYesterday,
    syncCurrentMonth,
    syncMonth,
    syncInitial,
    syncFull2021,
    resetHistory,
    processPurchases
};
