/**
 * Servicio para obtener ventas desde múltiples tipos de documentos del ERP Manager+
 * Tipos: FAVE (Facturas Electrónicas), BOVE (Boletas Electrónicas), NCVE (Notas de Crédito)
 * 
 * Basado en la lógica del código antiguo (gestioncompra.js)
 */

const axios = require('axios');
const { format, addDays, differenceInDays } = require('date-fns');
const { getAuthHeaders } = require('../utils/auth');
const { logInfo, logSuccess, logError, logWarning } = require('../utils/logger');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

// Tipos de documentos de venta
const DOCUMENT_TYPES = ["FAVE", "BOVE", "NCVE", "GDVE"];

// ==========================================
// MUTEX: Evita que múltiples llamadas a getAllSales
// saturen la API del ERP con peticiones concurrentes.
// Si una llamada está en curso, las siguientes esperan.
// ==========================================
class Mutex {
    constructor() {
        this._queue = [];
        this._locked = false;
    }

    async runExclusive(fn) {
        // Esperar si hay otra ejecución en curso
        await new Promise(resolve => {
            if (!this._locked) {
                this._locked = true;
                resolve();
            } else {
                this._queue.push(resolve);
            }
        });

        try {
            return await fn();
        } finally {
            // Liberar y ejecutar la siguiente en la cola
            if (this._queue.length > 0) {
                const next = this._queue.shift();
                next();
            } else {
                this._locked = false;
            }
        }
    }
}

const erpMutex = new Mutex();

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

        // Fallback Strategy: Si es error 500 o Timeout en un rango grande (> 5 días), dividir y conquistar
        const daysDiff = differenceInDays(fechaFin, fechaInicio);
        if (daysDiff > 5 && (error.response?.status === 500 || isNetworkError || error.code === 'ECONNABORTED')) {
            logWarning(`⚠️  ${docType}: Error ${error.response?.status || error.code} en rango de ${daysDiff} días. Dividiendo consulta...`);

            // Calcular punto medio
            const midDate = addDays(fechaInicio, Math.floor(daysDiff / 2));

            // Primera mitad: Inicio -> Mid
            const part1 = await getDocumentsByType(docType, fechaInicio, midDate, 1);

            // Segunda mitad: Mid+1 -> Fin
            const part2 = await getDocumentsByType(docType, addDays(midDate, 1), fechaFin, 1);

            return [...part1, ...part2];
        }

        if (attempt <= maxAttempts && (isNetworkError || error.response?.status === 429 || error.response?.status >= 500)) {

            const reason = isNetworkError ? `Error de red (${error.code || error.message})` : `HTTP ${error.response?.status}`;
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
 * Intenta obtener el folio de una Guía de Despacho (GDVE) referenciada en un documento
 */
function getReferencedGuideFolio(doc) {
    // 1. Revisar campo referencias estructurado
    if (doc.referencias && Array.isArray(doc.referencias)) {
        for (const ref of doc.referencias) {
            if (ref.tipo_doc && (ref.tipo_doc.includes('GD') || ref.tipo_doc.includes('GUIA'))) {
                return ref.folio_ref || ref.folio || null;
            }
        }
    }

    // 2. Revisar Glosa y Glosa Encabezado (fallback común)
    const glosa = (doc.glosa || doc.glosa_enc || '').toUpperCase();

    // Patrones comunes: "SEGÚN GUÍA 18208", "GD 18208", "REF GDVE 18208"
    const match = glosa.match(/(?:GD|GUIA|GDVE|GDV)\s*[-:]?\s*(\d+)/);
    if (match) return match[1];

    return null;
}

/**
 * Obtener TODAS las ventas de FAVE, BOVE, NCVE y GDVE para un rango de fechas
 * Deduplica FAVEs que vienen de Guías.
 */
async function getAllSales(fechaInicio, fechaFin) {
    // Definir si el periodo es histórico (termina antes del inicio del mes actual)
    const hoy = new Date();
    const inicioMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const esHistorico = fechaFin < inicioMesActual;

    // Usar mutex para evitar que múltiples llamadas concurrentes saturen la API del ERP
    return erpMutex.runExclusive(async () => {
        const typesToFetch = esHistorico 
            ? DOCUMENT_TYPES.filter(t => t !== 'GDVE')
            : DOCUMENT_TYPES;

        logInfo(`Obteniendo ventas (${esHistorico ? 'HISTÓRICO' : 'ACTUAL'}) de ${typesToFetch.join(', ')} del ${format(fechaInicio, 'dd/MM/yyyy')} al ${format(fechaFin, 'dd/MM/yyyy')}...`);

        const allDocuments = [];
        const stats = {};

        // Obtener documentos de cada tipo SECUENCIALMENTE
        const results = [];
        for (const docType of typesToFetch) {
            try {
                if (results.length > 0) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                const docs = await getDocumentsByType(docType, fechaInicio, fechaFin);
                logSuccess(`  ${docType}: ${docs.length} documentos`);
                results.push({ type: docType, documents: docs });
            } catch (error) {
                logError(`  ${docType}: Error - ${error.message}`);
                results.push({ type: docType, documents: [], error: error.message });
            }
        }

        // --- LÓGICA DE DEDUPLICACIÓN / FILTRADO ---
        
        const guideFoliosInvoiced = new Set();
        if (!esHistorico) {
            // En el periodo ACTUAL, identificamos qué Facturas vienen de Guías
            // para PRIORIZAR LA GUÍA y OMITIR LA FACTURA.
            const faves = results.find(r => r.type === 'FAVE')?.documents || [];
            for (const doc of faves) {
                const guideFolio = getReferencedGuideFolio(doc);
                if (guideFolio) {
                    guideFoliosInvoiced.add(guideFolio.toString());
                }
            }
        }

        let skippedCount = 0;

        for (const result of results) {
            stats[result.type] = result.documents.length;

            for (const doc of result.documents) {
                if (!esHistorico) {
                    // Lógica para periodo ACTUAL: Prioridad Guías
                    // Si es una Factura (FAVE) que ya tiene Guía, OMITIR LA FACTURA
                    if (result.type === 'FAVE') {
                        const guideFolio = getReferencedGuideFolio(doc);
                        if (guideFolio) {
                            skippedCount++;
                            continue;
                        }
                    }
                } 
                // En periodo HISTÓRICO no hay GDVEs y se procesan todas las FAVEs sin filtro.

                doc._docType = result.type;
                allDocuments.push(doc);
            }
        }

        if (esHistorico) {
            logSuccess(`Resumen Sincronización Histórica:`);
            logSuccess(`  FAVEs: ${stats['FAVE'] || 0} (Todas procesadas)`);
            logSuccess(`  GDVEs: 0 (Ignoradas por ser histórico)`);
        } else {
            logSuccess(`Resumen Deduplicación (Prioridad Guías):`);
            logSuccess(`  GDVEs procesadas: ${stats['GDVE'] || 0}`);
            logSuccess(`  FAVEs omitidas (Ya tienen guía): ${skippedCount}`);
        }
        logSuccess(`  Total final documentos: ${allDocuments.length}`);

        return allDocuments;
    });
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

        // Priorizar el neto calculado por el ERP que ya incluye descuentos por línea
        let montoNeto = parseFloat(item.neto_por_producto || item.v_netoporproducto || item.monto_neto || item.neto || item.precio_neto || 0);

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
