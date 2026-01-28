/**
 * Script para sincronizar productos desde Manager+ a la base de datos
 * 
 * Obtiene todos los productos de Manager+ y los guarda en la base de datos
 * con su SKU y descripción
 */

require('dotenv').config();
const axios = require('axios');
const { getAuthHeaders } = require('../utils/auth');
const { getDatabase, closeDatabase } = require('../utils/database');
const { logSection, logSuccess, logError, logWarning, logInfo, logProgress } = require('../utils/logger');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

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
 * Guardar o actualizar producto en la base de datos
 */
function saveProduct(db, sku, descripcion, familia = '', proveedor = '') {
    if (!sku || !descripcion) {
        return false;
    }

    try {
        // Intentar actualizar primero
        const update = db.prepare(`
            UPDATE productos 
            SET descripcion = ?, familia = ?, proveedor = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE sku = ?
        `);

        const result = update.run(descripcion, familia, proveedor, sku);

        // Si no se actualizó nada, insertar
        if (result.changes === 0) {
            const insert = db.prepare(`
                INSERT INTO productos (sku, descripcion, familia, proveedor, updated_at) 
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);
            insert.run(sku, descripcion, familia, proveedor);
            return true; // Nuevo producto
        }

        return false; // Producto actualizado
    } catch (error) {
        logError(`Error al guardar producto ${sku}: ${error.message}`);
        return false;
    }
}

/**
 * Función principal
 */
/**
 * Función para obtener la Lista Mayorista (ID 652) y extraer SKUs permitidos
 */
async function getWhiteListSKUs() {
    try {
        logInfo('Obteniendo Lista Mayorista (ID 652) para filtrar productos...');
        const headers = await getAuthHeaders();
        // Nota: Usamos dets=1 para obtener productos
        const url = `${ERP_BASE_URL}/pricelist/${RUT_EMPRESA}/?dets=1`;

        const response = await axios.get(url, { headers });
        const data = response.data.data || response.data || [];

        // Buscar lista 652 (o la que coincida)
        const targetList = data.find(l =>
            String(l.codigo) === '652' ||
            String(l.id) === '652' ||
            String(l.cod_lista) === '652' ||
            (l.descripcion && l.descripcion.includes('652'))
        );

        if (!targetList) {
            throw new Error('No se encontró la Lista de Precios 652');
        }

        const items = targetList.produtos || targetList.productos || targetList.detalles || targetList.items || targetList.products || [];
        const skus = new Set();

        items.forEach(item => {
            const sku = item.codigo || item.sku || item.cod_articulo || item.cod;
            if (sku) skus.add(sku.trim());
        });

        logSuccess(`✅ Lista Mayorista obtenida: ${skus.size} SKUs permitidos.`);
        return skus;

    } catch (error) {
        logError(`Error obteniendo White List: ${error.message}`);
        throw error;
    }
}

/**
 * Función principal
 */
async function main() {
    logSection('SINCRONIZACIÓN DE PRODUCTOS (FILTRADO POR LISTA 652)');

    const db = getDatabase();

    try {
        // 1. Obtener White List
        const whiteList = await getWhiteListSKUs();

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
        let filtrarados = 0; // Fuera de la lista

        // Usamos una transacción para integridad si fuera necesario, pero la librería sqlite3 sync es simple.

        // Opcional: Marcar productos que ya no están en la lista como inactivos? 
        // Por ahora, el requerimiento es "solo guardar los de la lista".
        // Si ya existen en DB y salen de la lista, no los tocamos (quedan históricos) o los borramos?
        // Asumiremos que solo actualizamos los de la lista para no borrar historial inadvertidamente.

        for (let i = 0; i < allProducts.length; i++) {
            const product = allProducts[i];
            const { sku, descripcion } = extractProductInfo(product);

            if (!sku || !descripcion) {
                omitidos++;
                continue;
            }

            // CHECK WHITE LIST
            if (!whiteList.has(sku)) {
                filtrarados++;
                continue;
            }

            const esNuevo = saveProduct(db, sku, descripcion, product.familia || '', product.proveedor || '');
            if (esNuevo) {
                nuevos++;
            } else {
                actualizados++;
            }

            if (i % 50 === 0) logProgress(i + 1, allProducts.length, 'productos evaluados');
        }

        console.log('\n');
        logSection('RESUMEN');
        logSuccess(`Total en White List (Lista 652): ${whiteList.size}`);
        logInfo(`Total en ERP: ${allProducts.length}`);
        logInfo(`Procesados (Coincidencia): ${nuevos + actualizados}`);
        logInfo(`  - Nuevos: ${nuevos}`);
        logInfo(`  - Actualizados: ${actualizados}`);
        logInfo(`  - Filtrados (Fuera de lista): ${filtrarados}`);

        // Mostrar estadísticas de la BD
        const totalBD = db.prepare('SELECT COUNT(*) as count FROM productos').get();
        logInfo(`Total de productos en base de datos: ${totalBD.count}`);

        logSuccess('\n✅ Sincronización completada con Éxito\n');

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
