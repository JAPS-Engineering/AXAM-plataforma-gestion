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

    // Obtener mapa de SKU -> [productos] (soporta múltiples variantes para el mismo SKU base)
    const skusToFetch = new Set();
    filteredProducts.forEach(p => {
        skusToFetch.add(p.sku);
        skusToFetch.add(p.sku + 'U'); // Agregar variante con 'U' por si acaso
    });

    // ---------------------------------------------------------
    // AGREGACIÓN PREVIA: Unificar líneas del mismo producto en el mismo folio
    // Esto evita error de Unique Constraint si una factura tiene 2 líneas del mismo SKU
    // ---------------------------------------------------------
    const aggregatedProducts = new Map(); // key: sku-folio -> { ...product, cantidad, totalMonto }

    for (const p of filteredProducts) {
        // Usar una clave única compuesta
        const key = `${p.sku}|${p.folio || 'S/F'}|${p.fecha.toISOString()}`;

        if (!aggregatedProducts.has(key)) {
            aggregatedProducts.set(key, { ...p, montoTotal: p.cantidad * p.precioUnitario });
        } else {
            const existing = aggregatedProducts.get(key);
            existing.cantidad += p.cantidad;
            existing.montoTotal += (p.cantidad * p.precioUnitario);
            // Mantener otros metadatos del primero
        }
    }

    // Recalcular precio unitario promedio y convertir a array
    const uniqueProductsList = Array.from(aggregatedProducts.values()).map(p => ({
        ...p,
        precioUnitario: p.cantidad > 0 ? p.montoTotal / p.cantidad : 0
    }));

    logInfo(`Agregación: ${filteredProducts.length} líneas unificadas en ${uniqueProductsList.length} registros únicos.`);

    const existingProducts = await prisma.producto.findMany({
        where: { sku: { in: Array.from(skusToFetch) } },
        select: { id: true, sku: true, precioUltimaCompra: true, fechaUltimaCompra: true }
    });

    // Mapear tanto el SKU exacto como la versión sin 'U' (si termina en U) al mismo producto
    const skuToProducts = new Map(); // SKU -> Array de productos
    existingProducts.forEach(p => {
        // Mapeo directo
        if (!skuToProducts.has(p.sku)) skuToProducts.set(p.sku, []);
        skuToProducts.get(p.sku).push(p);

        // Si el producto en DB termina en U, también mapearlo al SKU base (sin U)
        if (p.sku.endsWith('U')) {
            const baseSku = p.sku.slice(0, -1);
            if (!skuToProducts.has(baseSku)) skuToProducts.set(baseSku, []);
            skuToProducts.get(baseSku).push(p);
        }
    });

    let processed = 0;
    let updated = 0;
    const productsToUpdateCost = new Map(); // productId -> { precio, fecha, proveedor, rutProveedor }

    // Agrupar compras por producto para inserción batch
    // Agrupar compras por producto para inserción batch
    // Usamos la lista ya agregada/unificada
    for (const purchase of uniqueProductsList) {
        const matchingProducts = skuToProducts.get(purchase.sku) || [];
        if (matchingProducts.length === 0) {
            // Producto no existe en catálogo, skip
            continue;
        }

        // 1. Insertar Historial (SOLO UNA VEZ por línea de factura)
        // Preferimos el producto con match exacto de SKU. Si no, usamos el primero encontrado.
        let primaryProduct = matchingProducts.find(p => p.sku === purchase.sku);
        if (!primaryProduct) primaryProduct = matchingProducts[0];

        try {
            await prisma.compraHistorica.create({
                data: {
                    productoId: primaryProduct.id, // Solo al principal
                    fecha: purchase.fecha,
                    cantidad: purchase.cantidad,
                    precioUnitario: purchase.precioUnitario,
                    proveedor: purchase.proveedor || null,
                    rutProveedor: purchase.rutProveedor || null,
                    folio: purchase.folio || null,
                    tipoDoc: purchase.tipoDoc || 'FACE'
                }
            });
            processed++;
        } catch (error) {
            // Loguear error específico de constraint para debug
            if (error.code === 'P2002') {
                logWarning(`Duplicado ignorado (Constraint): SKU ${primaryProduct.sku}, Folio ${purchase.folio}`);
            } else {
                logError(`Error insertando compra SKU ${purchase.sku}: ${error.message}`);
            }
        }

        // 2. Actualizar Costos (PARA TODOS los variantes)
        // Aunque el historial quede solo en uno, el costo actualizado debe reflejarse en todos (ej: unidad y caja)
        for (const product of matchingProducts) {
            // Rastrear el precio más reciente para actualizar Producto
            const existing = productsToUpdateCost.get(product.id);
            if (!existing || purchase.fecha > existing.fecha) {
                productsToUpdateCost.set(product.id, {
                    precio: purchase.precioUnitario,
                    fecha: purchase.fecha,
                    proveedor: purchase.proveedor,
                    rutProveedor: purchase.rutProveedor
                });
            }
        }
    }

    // Actualizar precioUltimaCompra en productos
    for (const [productId, data] of productsToUpdateCost) {
        await prisma.producto.update({
            where: { id: productId },
            data: {
                precioUltimaCompra: data.precio,
                fechaUltimaCompra: data.fecha,
                proveedor: data.proveedor || undefined,
                rutProveedor: data.rutProveedor || undefined
            }
        });
        updated++;
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
        // 1. Eliminar datos existentes de ayer (Overwrite)
        const startOfDay = new Date(yesterday);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(yesterday);
        endOfDay.setHours(23, 59, 59, 999);

        await prisma.compraHistorica.deleteMany({
            where: {
                fecha: {
                    gte: startOfDay,
                    lte: endOfDay
                }
            }
        });

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

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Último día del mes
    endDate.setHours(23, 59, 59, 999);

    try {
        // 1. Eliminar datos existentes del mes (Overwrite Strategy)
        const deleted = await prisma.compraHistorica.deleteMany({
            where: {
                fecha: {
                    gte: startDate,
                    lte: endDate
                }
            }
        });
        logInfo(`🗑️  Eliminados ${deleted.count} registros antiguos de ${month}/${year}`);

        // 2. Obtener y procesar nuevos datos
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
