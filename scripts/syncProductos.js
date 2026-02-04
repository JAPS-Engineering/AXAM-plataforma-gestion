/**
 * Script para sincronizar productos desde Manager+ a la base de datos
 * 
 * Obtiene todos los productos de Manager+ y los guarda en la base de datos
 * Filtrando por listas de precios (89, 652, 386) y guardando sus precios.
 */

require('dotenv').config();
const axios = require('axios');
const { getAuthHeaders } = require('../utils/auth');
const { getDatabase, closeDatabase } = require('../utils/database');
const { logSection, logSuccess, logError, logWarning, logInfo, logProgress } = require('../utils/logger');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

// Listas de precios a considerar
const TARGET_LISTS = ['89', '652', '386'];

/**
 * Obtener todos los productos de Manager+
 */
async function getAllProducts() {
    try {
        logInfo('Obteniendo productos de Manager+...');

        const headers = await getAuthHeaders();
        const url = `${ERP_BASE_URL}/products/${RUT_EMPRESA}?con_stock=S&con_listaprecios=S&pic=1`;

        logInfo(`URL: ${url}`);

        const response = await axios.get(url, { headers });

        const products = response.data.data || response.data || [];

        if (!Array.isArray(products)) {
            if (typeof products === 'object' && products !== null) {
                return [products];
            }
            return [];
        }

        return products;

    } catch (error) {
        const msg = (error.response && error.response.data && error.response.data.message) || error.message;
        logError(`Error al obtener productos: ${msg}`);
        if (error.response && error.response.data) {
            console.error('Detalles:', JSON.stringify(error.response.data, null, 2));
        }
        throw error;
    }
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

    const proveedor = product.proveedor ||
        product.nombre_proveedor ||
        product.cod_proveedor ||
        '';

    return {
        sku: sku.trim(),
        descripcion: descripcion.trim(),
        familia: familia.trim(),
        proveedor: proveedor.trim()
    };
}

/**
 * Guardar o actualizar producto en la base de datos y sus precios
 */
function saveProductWithPrices(db, sku, descripcion, familia, proveedor, prices) {
    if (!sku || !descripcion) {
        return false;
    }

    try {
        const transaction = db.transaction(() => {
            // 1. Guardar/Actualizar Producto
            const update = db.prepare(`
                UPDATE productos 
                SET descripcion = ?, familia = ?, proveedor = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE sku = ?
            `);
            let result = update.run(descripcion, familia, proveedor, sku);

            let productId;
            if (result.changes === 0) {
                const insert = db.prepare(`
                    INSERT INTO productos (sku, descripcion, familia, proveedor, updated_at) 
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                `);
                const info = insert.run(sku, descripcion, familia, proveedor);
                productId = info.lastInsertRowid;
            } else {
                const row = db.prepare('SELECT id FROM productos WHERE sku = ?').get(sku);
                productId = row.id;
            }

            // 2. Guardar Precios
            const insertPrice = db.prepare(`
                INSERT INTO precios_listas (producto_id, lista_id, precio_neto, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(producto_id, lista_id) DO UPDATE SET
                precio_neto = excluded.precio_neto,
                updated_at = CURRENT_TIMESTAMP
            `);

            for (const [listId, price] of Object.entries(prices)) {
                insertPrice.run(productId, parseInt(listId), price);
            }

            return result.changes === 0; // True si es nuevo
        });

        return transaction();
    } catch (error) {
        logError(`Error al guardar producto ${sku}: ${error.message}`);
        return false;
    }
}

/**
 * Función para obtener las Listas definidas y extraer SKUs y Precios
 */
async function getPriceListsData() {
    try {
        logInfo(`Obteniendo Listas de Precios (${TARGET_LISTS.join(', ')})...`);
        const headers = await getAuthHeaders();
        // Usamos dets=1 para obtener productos
        const url = `${ERP_BASE_URL}/pricelist/${RUT_EMPRESA}/?dets=1`;

        const response = await axios.get(url, { headers });
        const data = response.data.data || response.data || [];

        const skuData = new Map(); // SKU -> { prices: { listId: price } }

        for (const listId of TARGET_LISTS) {
            // Buscar la lista exacta
            const targetList = data.find(l =>
                String(l.codigo) === listId ||
                String(l.id) === listId ||
                String(l.cod_lista) === listId ||
                (l.descripcion && l.descripcion.includes(listId))
            );

            if (!targetList) {
                logWarning(`⚠️  No se encontró la Lista de Precios ${listId}`);
                continue;
            }

            const items = targetList.produtos || targetList.productos || targetList.detalles || targetList.items || targetList.products || [];

            logInfo(`  - Lista ${listId}: ${items.length} items encontrados.`);

            items.forEach(item => {
                const sku = (item.codigo || item.sku || item.cod_articulo || item.cod || '').trim();
                const precio = parseFloat(item.precio || item.valor || item.monto || 0);

                if (sku) {
                    if (!skuData.has(sku)) {
                        skuData.set(sku, { prices: {} });
                    }
                    skuData.get(sku).prices[listId] = precio;
                }
            });
        }

        logSuccess(`✅ Listas procesadas. ${skuData.size} SKUs únicos encontrados con precio.`);
        return skuData;

    } catch (error) {
        logError(`Error obteniendo Listas de Precios: ${error.message}`);
        throw error;
    }
}

/**
 * Función principal
 */
async function main() {
    logSection('SINCRONIZACIÓN DE PRODUCTOS Y PRECIOS');

    const db = getDatabase();

    try {
        // 1. Obtener Datos de Listas de Precios (Whitelist + Precios)
        const whiteListMap = await getPriceListsData();

        if (whiteListMap.size === 0) {
            logError('No se obtuvieron SKUs de las listas de precios. Abortando para evitar borrado masivo.');
            return;
        }

        // 2. Obtener TODA la base de productos de Manager+
        // (Necesario para obtener Familia, Proveedor, etc., que no vienen en la lista de precios)
        const allProducts = await getAllProducts();
        logInfo(`Total productos en ERP: ${allProducts.length}`);

        if (allProducts.length === 0) {
            logWarning('No se encontraron productos en el ERP.');
            return;
        }

        // 3. Filtrar y Procesar
        logInfo('Filtrando y procesando productos...\n');

        let nuevos = 0;
        let actualizados = 0;
        let omitidos = 0;
        let filtrados = 0;
        const familiasFound = new Map();

        // Crear Set de SKUs para búsqueda rápida
        const whiteListSKUs = new Set(whiteListMap.keys());

        for (let i = 0; i < allProducts.length; i++) {
            const product = allProducts[i];
            const { sku, descripcion, familia, proveedor } = extractProductInfo(product);

            if (!sku || !descripcion) {
                omitidos++;
                continue;
            }

            // Contar familias encontradas en el ERP (solo para log)
            if (familia) {
                familiasFound.set(familia, (familiasFound.get(familia) || 0) + 1);
            }

            // CHECK WHITE LIST (Estar en AL MENOS UNA DE LAS LISTAS)
            if (!whiteListSKUs.has(sku)) {
                filtrados++;
                continue;
            }

            // Obtener precios capturados previamente
            const prices = whiteListMap.get(sku).prices;

            const esNuevo = saveProductWithPrices(db, sku, descripcion, familia, proveedor, prices);
            if (esNuevo) {
                nuevos++;
            } else {
                actualizados++;
            }

            if (i % 50 === 0) logProgress(i + 1, allProducts.length, 'productos evaluados');
        }

        console.log('\n');
        logSection('RESUMEN');

        logSuccess(`Total productos procesados (en listas): ${nuevos + actualizados}`);
        logInfo(`  - Nuevos: ${nuevos}`);
        logInfo(`  - Actualizados: ${actualizados}`);
        logInfo(`  - Filtrados (No están en niguna lista): ${filtrados}`);

        // Mostrar estadísticas de la BD
        const totalBD = db.prepare('SELECT COUNT(*) as count FROM productos').get();
        logInfo(`Total de productos en base de datos: ${totalBD.count}`);

        logSuccess('\n✅ Sincronización completada con Éxito\n');

        // 4. LIMPIEZA DE PRODUCTOS ANTIGUOS
        logSection('LIMPIEZA DE BASE DE DATOS');
        logInfo('Verificando productos obsoletos en la base de datos...');

        // Obtener todos los SKUs de la base de datos
        const dbProducts = db.prepare('SELECT sku FROM productos').all();
        const dbSkus = new Set(dbProducts.map(p => p.sku));

        logInfo(`Total productos en DB: ${dbSkus.size}`);

        const skusToDelete = [];
        for (const sku of dbSkus) {
            if (!whiteListSKUs.has(sku)) {
                skusToDelete.push(sku);
            }
        }

        if (skusToDelete.length > 0) {
            logWarning(`⚠️  Se encontraron ${skusToDelete.length} productos en la BD que NO están en las listas permitidas.`);
            logWarning('⏳ Eliminando productos obsoletos y su historial (Cascade)...');

            const deleteStmt = db.prepare('DELETE FROM productos WHERE sku = ?');

            // Ejecutar en transacción para seguridad y velocidad
            const deleteTransaction = db.transaction((skus) => {
                let deletedCount = 0;
                for (const sku of skus) {
                    deleteStmt.run(sku);
                    deletedCount++;
                    if (deletedCount % 100 === 0) process.stdout.write(`\rEliminando: ${deletedCount}/${skus.length}`);
                }
                console.log(''); // Nueva línea
                return deletedCount;
            });

            const totalDeleted = deleteTransaction(skusToDelete);
            logSuccess(`🗑️  Eliminados ${totalDeleted} productos obsoletos correctamente.`);
        } else {
            logSuccess('✨ La base de datos está limpia. Todos los productos pertenecen a las listas permitidas.');
        }

        // Mostrar estadísticas finales
        const finalCount = db.prepare('SELECT COUNT(*) as count FROM productos').get();
        const finalPrices = db.prepare('SELECT COUNT(*) as count FROM precios_listas').get();
        logInfo(`Total productos finales en DB: ${finalCount.count}`);
        logInfo(`Total precios registrados: ${finalPrices.count}`);

    } catch (error) {
        logError(`Error en la sincronización: ${error.message}`);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    } finally {
        closeDatabase();
    }
}

// Función renombrada para ser importable y usada por otros scripts
async function syncProductsWithFilter() {
    return await main();
}

// Ejecutar si se llama directamente
if (require.main === module) {
    main().catch(error => {
        logError(`Error fatal: ${error.message}`);
        process.exit(1);
    });
}

module.exports = { main, syncProductsWithFilter };
