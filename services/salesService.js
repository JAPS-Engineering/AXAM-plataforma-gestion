/**
 * Servicio para obtener ventas desde múltiples tipos de documentos del ERP Manager+
 * Tipos: FAVE (Facturas Electrónicas), BOVE (Boletas Electrónicas), NCVE (Notas de Crédito)
 * 
 * Basado en la lógica del código antiguo (gestioncompra.js)
 */

const axios = require('axios');
const { format, addDays } = require('date-fns');
const { getAuthHeaders } = require('../utils/auth');
const { logInfo, logSuccess, logError, logWarning } = require('../utils/logger');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

// Tipos de documentos de venta (del código antiguo)
// Tipos de documentos de venta
const DOCUMENT_TYPES = ["FAVE", "BOVE", "NCVE", "GDVE"];

/**
 * Obtener documentos de venta de un tipo específico para un rango de fechas
 * Usa details=1 para obtener los productos en una sola llamada (optimización clave)
 */
async function getDocumentsByType(docType, fechaInicio, fechaFin, attempt = 1) {
    try {
        const headers = await getAuthHeaders();

        const fechaInicioStr = format(fechaInicio, 'yyyyMMdd');
        const fechaFinStr = format(fechaFin, 'yyyyMMdd');

        // Usar details=1 para obtener productos en una sola llamada (como el código antiguo)
        const url = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/${docType}/V?details=1&df=${fechaInicioStr}&dt=${fechaFinStr}`;

        const response = await axios.get(url, {
            headers,
            timeout: 120000 // 2 minutos para documentos con detalles
        });

        const documents = response.data.data || response.data || [];

        if (!Array.isArray(documents)) {
            return [];
        }

        return documents;

    } catch (error) {
        const retryDelay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s...
        const maxAttempts = 5;
        const isNetworkError =
            error.code === 'EAI_AGAIN' ||
            error.code === 'ECONNRESET' ||
            error.code === 'ETIMEDOUT' ||
            (error.message && error.message.includes('socket hang up'));

        if (attempt <= maxAttempts && (isNetworkError || error.response?.status === 429)) {

            const reason = isNetworkError ? `Error de red (${error.code || error.message})` : 'Rate limit';
            logWarning(`⚠️  ${docType}: ${reason}. Reintentando intento ${attempt}/${maxAttempts} en ${retryDelay / 1000}s...`);

            await new Promise(resolve => setTimeout(resolve, retryDelay));
            return getDocumentsByType(docType, fechaInicio, fechaFin, attempt + 1);
        }

        // Algunos tipos pueden no existir o no tener docs, no es necesariamente error fatal
        if (error.response?.status === 400 || error.response?.status === 404) {
            logWarning(`No se encontraron documentos ${docType} o endpoint no válido.`);
            return [];
        }

        logError(`Error al obtener ${docType} (intento ${attempt}): ${error.message}`);
        throw error;
    }
}

/**
 * Verifica si un documento FAVE hace referencia a una Guía de Despacho (GDVE)
 * Para evitar duplicidad de ventas.
 */
function isFaveRefToGuide(doc) {
    // 1. Revisar campo referencias estructurado
    if (doc.referencias && Array.isArray(doc.referencias)) {
        const hasGuideRef = doc.referencias.some(ref =>
            ref.tipo_doc && (ref.tipo_doc.includes('GD') || ref.tipo_doc.includes('GUIA'))
        );
        if (hasGuideRef) return true;
    }

    // 2. Revisar Glosa y Glosa Encabezado (fallback común)
    // El API suele devolver "glosa_enc" en lugar de "glosa"
    const glosa = (doc.glosa || doc.glosa_enc || '').toUpperCase();

    // Patrones comunes: "SEGÚN GUÍA", "REF GD", "GDVE", "GUIA DE DESPACHO"
    if (glosa.includes('GUIA') || glosa.includes('GD') || glosa.includes('DESPACHO')) {
        return true;
    }

    return false;
}

/**
 * Obtener TODAS las ventas de FAVE, BOVE, NCVE y GDVE para un rango de fechas
 * Deduplica FAVEs que vienen de Guías.
 */
async function getAllSales(fechaInicio, fechaFin) {
    logInfo(`Obteniendo ventas de ${DOCUMENT_TYPES.join(', ')} del ${format(fechaInicio, 'dd/MM/yyyy')} al ${format(fechaFin, 'dd/MM/yyyy')}...`);

    const allDocuments = [];
    const stats = {};

    // Obtener documentos de cada tipo en paralelo
    const results = await Promise.all(DOCUMENT_TYPES.map(async (docType) => {
        try {
            const docs = await getDocumentsByType(docType, fechaInicio, fechaFin);
            logSuccess(`  ${docType}: ${docs.length} documentos`);
            return { type: docType, documents: docs };
        } catch (error) {
            logError(`  ${docType}: Error - ${error.message}`);
            return { type: docType, documents: [], error: error.message };
        }
    }));

    let favesSkipped = 0;

    for (const result of results) {
        stats[result.type] = result.documents.length;

        for (const doc of result.documents) {
            // Lógica de Deduplicación FAVE vs GDVE
            if (result.type === 'FAVE') {
                if (isFaveRefToGuide(doc)) {
                    favesSkipped++;
                    // Loguear para verificar qué se está omitiendo
                    const glosa = doc.glosa || doc.glosa_enc || 'Sin glosa';
                    logInfo(`  ⏭️  Saltando FAVE ${doc.folio} (Referencia a Guía detectada en: "${glosa.substring(0, 50)}...")`);
                    continue; // Saltar esta factura, ya contamos la GDVE
                }
            }

            doc._docType = result.type;
            allDocuments.push(doc);
        }
    }

    logSuccess(`Resumen Deduplicación:`);
    logSuccess(`  Total FAVEs procesadas: ${stats['FAVE'] || 0}`);
    logSuccess(`  FAVEs omitidas (Ref a GDVE): ${favesSkipped}`);
    logSuccess(`  Total GDVEs incluidas: ${stats['GDVE'] || 0}`);
    logSuccess(`  Total final documentos: ${allDocuments.length}`);

    return allDocuments;
}

/**
 * Extraer productos de un documento de venta
 * Retorna array de { sku, cantidad, montoNeto, vendedor }
 */
function extractProductsFromDocument(document) {
    const products = [];

    // El campo de detalles puede estar en diferentes propiedades
    const details = document.detalles || document.detalle || document.items || [];

    if (!Array.isArray(details)) {
        return products;
    }

    // Extracción de Vendedor
    // Prioridad: usuario_vendedor (initials) > cod_vendedor > vendedor (nombre/id)
    let vendedor = 'Sin Vendedor';
    if (document.usuario_vendedor) {
        vendedor = document.usuario_vendedor.toString().trim().toLowerCase(); // "ms", "hm"
    } else if (document.cod_vendedor) {
        vendedor = document.cod_vendedor.toString().trim();
    } else if (document.vendedor || document.nom_vendedor) {
        vendedor = (document.vendedor || document.nom_vendedor).toString().trim();
    }

    for (const item of details) {
        // Mapeo de campos basado en la respuesta real de la API
        const sku = item.codigo || item.cod_prod || item.codigo_prod || item.cod_art || item.sku;
        const cantidad = parseFloat(item.cantidad || item.cant || 0);

        let montoNeto = parseFloat(item.monto_neto || item.neto || item.precio_neto || 0);

        // Si no hay monto neto directo, calcularlo (precio_unitario * cantidad)
        if (montoNeto === 0 && item.precio_unitario) {
            montoNeto = parseFloat(item.precio_unitario) * cantidad;
        }

        if (sku && cantidad !== 0) {
            products.push({
                sku,
                cantidad,
                montoNeto,
                vendedor
            });
        }
    }

    return products;
}

/**
 * Agregar ventas por SKU de una lista de documentos
 * Retorna Map<sku, { cantidad, montoNeto }>
 */
function aggregateSalesByProduct(documents) {
    const salesByProduct = new Map();

    for (const doc of documents) {
        const products = extractProductsFromDocument(doc);

        for (const product of products) {
            const key = `${product.sku}|${product.vendedor}`;
            if (!salesByProduct.has(key)) {
                salesByProduct.set(key, {
                    sku: product.sku,
                    vendedor: product.vendedor,
                    cantidad: 0,
                    montoNeto: 0
                });
            }

            const existing = salesByProduct.get(key);

            // Si es Nota de Crédito, RESTAR
            if (doc._docType === 'NCVE') {
                existing.cantidad -= product.cantidad;
                existing.montoNeto -= product.montoNeto;
            } else {
                // FAVE, BOVE, GDVE -> SUMAR
                existing.cantidad += product.cantidad;
                existing.montoNeto += product.montoNeto;
            }
        }
    }

    return salesByProduct;
}

/**
 * Obtener ventas de un día específico, agrupadas por producto
 * Optimizado para sincronización incremental diaria
 */
async function getDailySales(date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const documents = await getAllSales(startOfDay, endOfDay);
    const salesByProduct = aggregateSalesByProduct(documents);

    logInfo(`  Productos distintos: ${salesByProduct.size}`);

    return {
        date: format(date, 'yyyy-MM-dd'),
        documentsCount: documents.length,
        sales: salesByProduct
    };
}

/**
 * Obtener ventas de un mes completo, agrupadas por producto
 * Para sincronización inicial o recálculo
 */
async function getMonthlySales(year, month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Último día del mes

    logInfo(`Obteniendo ventas del mes ${month}/${year}...`);

    const documents = await getAllSales(startDate, endDate);
    const salesByProduct = aggregateSalesByProduct(documents);

    return {
        year,
        month,
        documentsCount: documents.length,
        sales: salesByProduct
    };
}

/**
 * Obtener ventas de una semana específica (ISO Week)
 * @param {number} year - Año
 * @param {number} week - Semana ISO (1-53)
 */
async function getWeeklySales(year, week) {
    const { startOfWeek, endOfWeek, parseISO } = require('date-fns');

    // Calcular fechas inicio y fin de la semana
    // Simple approach: get date from year and week
    // Note: ISO weeks start on Monday
    const simpleDate = new Date(year, 0, 1 + (week - 1) * 7);
    const dayOfWeek = simpleDate.getDay();
    const ISOweekStart = simpleDate;
    if (dayOfWeek <= 4)
        ISOweekStart.setDate(simpleDate.getDate() - simpleDate.getDay() + 1);
    else
        ISOweekStart.setDate(simpleDate.getDate() + 8 - simpleDate.getDay());

    // date-fns helper might be easier if available, but let's stick to basics or use library correctly if imported
    // actually we imported date-fns at top of file but not startOfWeek/endOfWeek in top scope
    // Let's rely on a helper to get dates from ISO week

    const getDateOfISOWeek = (w, y) => {
        const simple = new Date(y, 0, 1 + (w - 1) * 7);
        const dow = simple.getDay();
        const ISOweekStart = simple;
        if (dow <= 4)
            ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
        else
            ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
        return ISOweekStart;
    }

    const startDate = getDateOfISOWeek(week, year);
    startDate.setHours(0, 0, 0, 0); // Lunes 00:00

    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999); // Domingo 23:59:59

    logInfo(`Obteniendo ventas de la Semana ${week}/${year} (${format(startDate, 'dd/MM/yyyy')} - ${format(endDate, 'dd/MM/yyyy')})...`);

    const documents = await getAllSales(startDate, endDate);
    const salesByProduct = aggregateSalesByProduct(documents);

    return {
        year,
        week,
        startDate,
        endDate,
        documentsCount: documents.length,
        sales: salesByProduct
    };
}

/**
 * Obtener stock actual de todos los productos
 */
async function getCurrentStock() {
    try {
        const headers = await getAuthHeaders();
        const today = format(new Date(), 'yyyyMMdd');

        const url = `${ERP_BASE_URL}/stock/${RUT_EMPRESA}/?dt=${today}`;

        logInfo('Obteniendo stock actual del ERP...');

        const response = await axios.get(url, {
            headers,
            timeout: 60000
        });

        const stockData = response.data.data || response.data || [];

        // Convertir a Map<sku, stock>
        const stockMap = new Map();
        for (const item of stockData) {
            const sku = item.cod_prod || item.codigo_prod;
            const stock = parseFloat(item.saldo || item.stock || 0);
            if (sku) {
                stockMap.set(sku, stock);
            }
        }

        logSuccess(`Stock obtenido para ${stockMap.size} productos`);

        return stockMap;

    } catch (error) {
        logError(`Error al obtener stock: ${error.message}`);
        throw error;
    }
}

/**
 * Obtener información de todos los productos
 */
/**
 * Obtener SKUs permitidos de la Lista Mayorista (ID 89)
 */
/**
 * Obtener SKUs permitidos de las Listas definidas (89, 652, 386)
 */
async function getWhiteListSKUs() {
    try {
        const TARGET_LISTS = ['89', '652', '386'];
        logInfo(`Obteniendo Listas de Precios (${TARGET_LISTS.join(', ')}) para filtrar productos...`);
        const headers = await getAuthHeaders();
        const url = `${ERP_BASE_URL}/pricelist/${RUT_EMPRESA}/?dets=1`;

        const response = await axios.get(url, { headers, timeout: 60000 });
        const data = response.data.data || response.data || [];

        const skus = new Set();

        for (const listId of TARGET_LISTS) {
            const targetList = data.find(l =>
                String(l.codigo) === listId ||
                String(l.id) === listId ||
                String(l.cod_lista) === listId ||
                (l.descripcion && l.descripcion.includes(listId))
            );

            if (targetList) {
                const items = targetList.produtos || targetList.productos || targetList.detalles || targetList.items || targetList.products || [];
                items.forEach(item => {
                    const sku = item.codigo || item.sku || item.cod_articulo || item.cod;
                    if (sku) skus.add(sku.trim());
                });
            }
        }

        logSuccess(`✅ Listas obtenidas. Total SKUs permitidos: ${skus.size}`);
        return skus;

    } catch (error) {
        logError(`Error obteniendo White List: ${error.message}`);
        throw error;
    }
}

async function getAllProducts() {
    try {
        const headers = await getAuthHeaders();

        const url = `${ERP_BASE_URL}/products/${RUT_EMPRESA}`;

        logInfo('Obteniendo catálogo de productos del ERP...');

        const response = await axios.get(url, {
            headers,
            timeout: 60000
        });

        const products = response.data.data || response.data || [];

        logSuccess(`Obtenidos ${products.length} productos del catálogo`);

        return products;

    } catch (error) {
        logError(`Error al obtener productos: ${error.message}`);
        throw error;
    }
}

module.exports = {
    DOCUMENT_TYPES,
    getDocumentsByType,
    getAllSales,
    extractProductsFromDocument,
    aggregateSalesByProduct,
    getDailySales,
    getMonthlySales,
    getCurrentStock,
    getAllProducts,
    getWhiteListSKUs,
    getWeeklySales
};
