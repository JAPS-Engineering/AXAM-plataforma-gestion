/**
 * Script para sincronizar productos desde Manager+ a la base de datos
 * 
 * Obtiene todos los productos de Manager+ y los guarda en la base de datos
 * Filtrando por listas de precios (89, 652, 386) y guardando sus precios.
 * 
 * NOTA: Este script usa Prisma para todas las operaciones de base de datos
 * OPTIMIZADO: Usa transacciones batch para evitar timeouts
 */

require('dotenv').config();
const axios = require('axios');
const { getAuthHeaders } = require('../utils/auth');
const { getPrismaClient } = require('../prisma/client');
const { logSection, logSuccess, logError, logWarning, logInfo, logProgress } = require('../utils/logger');

const prisma = getPrismaClient();

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

// Listas de precios a considerar
const TARGET_LISTS = ['89', '652', '386'];

/**
 * Obtener todos los productos de Manager+
 */
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Obtener todos los productos de Manager+ (con reintentos)
 */
async function getAllProducts() {
    let lastError;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            if (attempt > 1) logInfo(`🔄 Intento ${attempt}/${MAX_RETRIES} obteniendo productos...`);

            const headers = await getAuthHeaders();
            const url = `${ERP_BASE_URL}/products/${RUT_EMPRESA}?con_stock=S&con_listaprecios=S&pic=1`;

            const response = await axios.get(url, { headers });
            const products = response.data.data || response.data || [];

            if (!Array.isArray(products)) {
                if (typeof products === 'object' && products !== null) return [products];
                return [];
            }

            return products;

        } catch (error) {
            lastError = error;
            const status = error.response ? error.response.status : 'unknown';
            logWarning(`⚠️ Error intento ${attempt} (Status: ${status}): ${error.message}`);

            if (attempt < MAX_RETRIES) await wait(RETRY_DELAY);
        }
    }

    const msg = (lastError.response && lastError.response.data && lastError.response.data.message) || lastError.message;
    logError(`❌ Error fatal tras ${MAX_RETRIES} intentos: ${msg}`);
    throw lastError;
}

/**
 * Extraer SKU y descripción de un producto
 */
function extractProductInfo(product) {
    const sku = product.codigo_prod ||
        product.cod_producto ||
        product.codigo ||
        product.cod ||
        product.sku ||
        '';

    const descripcion = product.nombre ||
        product.descripcion ||
        product.descrip ||
        product.desc ||
        '';

    const familia = product.familia ||
        product.cod_familia ||
        product.tipo ||
        '';

    const proveedor = product.marca ||
        product.proveedor ||
        product.nombre_proveedor ||
        product.cod_proveedor ||
        '';

    const unidad = product.unidadstock ||
        product.unidad ||
        product.unidad_medida ||
        product.uom ||
        'U';

    return {
        sku: sku.trim(),
        descripcion: descripcion.trim(),
        familia: familia.trim(),
        proveedor: proveedor.trim(),
        unidad: unidad.toString().trim()
    };
}

/**
 * Función para obtener las Listas definidas y extraer SKUs y Precios
 */
async function getPriceListsData() {
    try {
        logInfo(`Obteniendo Listas de Precios (${TARGET_LISTS.join(', ')})...`);
        const headers = await getAuthHeaders();
        const url = `${ERP_BASE_URL}/pricelist/${RUT_EMPRESA}/?dets=1`;

        const response = await axios.get(url, { headers });
        const data = response.data.data || response.data || [];

        const skuData = new Map();

        for (const listId of TARGET_LISTS) {
            const targetList = data.find(l =>
                String(l.codigo) === listId ||
                String(l.id) === listId ||
                String(l.cod_lista) === listId ||
                (l.listName && l.listName.includes(listId)) ||
                (l.descripcion && l.descripcion.includes(listId))
            );

            if (!targetList) {
                logWarning(`⚠️  No se encontró la Lista de Precios ${listId}`);
                continue;
            }

            const items = targetList.products || targetList.produtos || targetList.productos || targetList.detalles || targetList.items || [];



            items.forEach(item => {
                const sku = (item.cod || item.codigo || item.sku || item.cod_articulo || '').trim();
                const precio = parseFloat(item.price || item.precio || item.valor || item.monto || 0);

                if (sku) {
                    if (!skuData.has(sku)) {
                        skuData.set(sku, { prices: {} });
                    }
                    skuData.get(sku).prices[listId] = precio;
                }
            });
        }

        logInfo(`✅ Listas obtenidas: ${skuData.size} SKUs`);
        return skuData;

    } catch (error) {
        logError(`Error obteniendo Listas de Precios: ${error.message}`);
        throw error;
    }
}

/**
 * Función principal - OPTIMIZADA con batch operations
 */
async function main() {
    logInfo('🔄 Sincronizando productos y precios...');

    try {
        // 1. Obtener Datos de Listas de Precios (Whitelist + Precios)
        const whiteListMap = await getPriceListsData();

        if (whiteListMap.size === 0) {
            logError('No se obtuvieron SKUs de las listas de precios. Abortando.');
            return;
        }

        // 2. Obtener TODA la base de productos de Manager+
        const allProducts = await getAllProducts();


        if (allProducts.length === 0) {
            logWarning('No se encontraron productos en el ERP.');
            return;
        }

        // 3. Obtener productos existentes en DB para comparar
        const existingProducts = await prisma.producto.findMany({
            select: { id: true, sku: true }
        });
        const existingMap = new Map(existingProducts.map(p => [p.sku, p.id]));


        // 4. Preparar datos para batch operations
        const whiteListSKUs = new Set(whiteListMap.keys());
        const productsToCreate = [];
        const productsToUpdate = [];
        const pricesData = new Map(); // sku -> prices
        const processedSKUs = new Set(); // Para evitar duplicados en el mismo batch del ERP

        for (const product of allProducts) {
            const { sku, descripcion, familia, proveedor, unidad } = extractProductInfo(product);

            if (!sku || !descripcion) continue;
            if (!whiteListSKUs.has(sku)) continue;

            // Si ya procesamos este SKU en este ciclo, lo ignoramos (deduplicación del ERP)
            if (processedSKUs.has(sku)) continue;
            processedSKUs.add(sku);

            const prices = whiteListMap.get(sku).prices;
            pricesData.set(sku, prices);

            if (existingMap.has(sku)) {
                productsToUpdate.push({ sku, descripcion, familia, proveedor, unidad });
            } else {
                productsToCreate.push({ sku, descripcion, familia, proveedor, unidad });
            }
        }



        // 5. Batch CREATE new products
        if (productsToCreate.length > 0) {
            logInfo(`Creando ${productsToCreate.length} nuevos productos...`);

            // createMany sin skipDuplicates (no soportado en SQLite)
            // Los duplicados ya están filtrados por existingMap más arriba
            await prisma.producto.createMany({
                data: productsToCreate
            });
        }

        // 6. Batch UPDATE existing products (in chunks to avoid timeout)
        if (productsToUpdate.length > 0) {
            logInfo(`Actualizando ${productsToUpdate.length} productos existentes...`);

            const BATCH_SIZE = 100;
            for (let i = 0; i < productsToUpdate.length; i += BATCH_SIZE) {
                const batch = productsToUpdate.slice(i, i + BATCH_SIZE);
                await prisma.$transaction(
                    batch.map(p => prisma.producto.update({
                        where: { sku: p.sku },
                        data: { descripcion: p.descripcion, familia: p.familia, proveedor: p.proveedor, unidad: p.unidad }
                    }))
                );
                logProgress(Math.min(i + BATCH_SIZE, productsToUpdate.length), productsToUpdate.length, 'productos actualizados');
            }
        }

        // 7. Refresh product IDs after creation
        const allDbProducts = await prisma.producto.findMany({ select: { id: true, sku: true } });
        const productIdMap = new Map(allDbProducts.map(p => [p.sku, p.id]));

        // 8. Batch INSERT/UPDATE prices

        const allPriceData = [];

        for (const [sku, prices] of pricesData) {
            const productId = productIdMap.get(sku);
            if (!productId) continue;

            for (const [listId, price] of Object.entries(prices)) {
                allPriceData.push({
                    productoId: productId,
                    listaId: parseInt(listId),
                    precioNeto: price
                });
            }
        }

        // Upsert prices in batches
        const PRICE_BATCH_SIZE = 200;
        for (let i = 0; i < allPriceData.length; i += PRICE_BATCH_SIZE) {
            const batch = allPriceData.slice(i, i + PRICE_BATCH_SIZE);
            await prisma.$transaction(
                batch.map(p => prisma.precioLista.upsert({
                    where: { productoId_listaId: { productoId: p.productoId, listaId: p.listaId } },
                    update: { precioNeto: p.precioNeto },
                    create: p
                }))
            );
        }

        // 9. CLEANUP: Delete products not in whitelist

        const skusToDelete = [];
        for (const [sku, id] of productIdMap) {
            if (!whiteListSKUs.has(sku)) {
                skusToDelete.push(sku);
            }
        }

        if (skusToDelete.length > 0) {
            logWarning(`Eliminando ${skusToDelete.length} productos obsoletos...`);
            await prisma.producto.deleteMany({
                where: { sku: { in: skusToDelete } }
            });
            logSuccess(`🗑️  Eliminados ${skusToDelete.length} productos obsoletos.`);
        } else {
            logSuccess('✨ Base de datos limpia.');
        }

        // 10. Final stats
        const finalCount = await prisma.producto.count();
        const finalPrices = await prisma.precioLista.count();
        logSuccess(`\u2705 Sincronizaci\u00f3n completada: ${finalCount} productos, ${finalPrices} precios`);

    } catch (error) {
        logError(`Error en la sincronización: ${error.message}`);
        if (error.stack) console.error(error.stack);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    main().catch(error => {
        logError(`Error fatal: ${error.message}`);
        process.exit(1);
    });
}

module.exports = { main };
