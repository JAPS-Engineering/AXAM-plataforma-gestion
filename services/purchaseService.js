/**
 * Servicio para obtener compras (FACE - Facturas de Compra Electrónicas) desde el ERP Manager+
 * 
 * Similar a salesService.js pero para documentos de compra
 */

const axios = require('axios');
const { format } = require('date-fns');
const { getAuthHeaders } = require('../utils/auth');
const { logInfo, logSuccess, logError, logWarning } = require('../utils/logger');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

/**
 * Obtener Facturas de Compra (FACE) para un rango de fechas
 * Usa details=1 para obtener los productos en una sola llamada
 */
async function getPurchaseDocuments(fechaInicio, fechaFin, attempt = 1, docType = 'FACE') {
    try {
        const headers = await getAuthHeaders();

        const fechaInicioStr = format(fechaInicio, 'yyyyMMdd');
        const fechaFinStr = format(fechaFin, 'yyyyMMdd');

        // FACE = Factura de Compra Electrónica, C = Compra
        // DIN = Declaración de Ingreso (Importación)
        const url = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/${docType}/C?details=1&df=${fechaInicioStr}&dt=${fechaFinStr}`;

        const response = await axios.get(url, {
            headers,
            timeout: 120000 // 2 minutos
        });

        const documents = response.data.data || response.data || [];

        if (!Array.isArray(documents)) {
            return [];
        }

        return documents;

    } catch (error) {
        const retryDelay = Math.pow(2, attempt) * 1000;
        const maxAttempts = 5;
        const isNetworkError =
            error.code === 'EAI_AGAIN' ||
            error.code === 'ECONNRESET' ||
            error.code === 'ETIMEDOUT' ||
            (error.message && error.message.includes('socket hang up'));

        if (attempt <= maxAttempts && (isNetworkError || error.response?.status === 429)) {
            const reason = isNetworkError ? `Error de red (${error.code || error.message})` : 'Rate limit';
            logWarning(`⚠️  FACE: ${reason}. Reintentando intento ${attempt}/${maxAttempts} en ${retryDelay / 1000}s...`);

            await new Promise(resolve => setTimeout(resolve, retryDelay));
            return getPurchaseDocuments(fechaInicio, fechaFin, attempt + 1);
        }

        if (error.response?.status === 400 || error.response?.status === 404) {
            logWarning(`No se encontraron documentos FACE o endpoint no válido.`);
            return [];
        }

        logError(`Error al obtener FACE (intento ${attempt}): ${error.message}`);
        throw error;
    }
}

/**
 * Extraer productos de un documento de compra
 * Retorna array de { sku, cantidad, precioUnitario, proveedor, rutProveedor, folio, fecha }
 */
function extractProductsFromPurchase(document) {
    const products = [];

    const details = document.detalles || document.detalle || document.items || [];

    if (!Array.isArray(details)) {
        return products;
    }

    // DEBUG: Log first document structure
    if (Math.random() < 0.05) { // Log 5% of docs to not spam too much but see some
        console.log("DEBUG DOCUMENT:", JSON.stringify(document, null, 2));
    }

    // Extraer información del documento
    // En Manager+ para compras, a veces el proveedor viene como 'rut_cliente' o 'razon_social'
    const proveedor = document.razon_social || document.nom_proveedor || document.proveedor || document.nombre_cliente || document.nombre || '';
    const rutProveedor = document.rut_proveedor || document.rut || document.rut_cliente || '';
    const folio = document.folio?.toString() || document.numero?.toString() || '';

    // Fecha del documento
    let fecha = new Date();
    if (document.fecha_doc) {
        fecha = new Date(document.fecha_doc);
    } else if (document.fecha_emision) {
        fecha = new Date(document.fecha_emision);
    } else if (document.fecha) {
        fecha = new Date(document.fecha);
    }

    for (const item of details) {
        const sku = item.codigo || item.cod_prod || item.codigo_prod || item.cod_art || item.sku;
        const cantidad = parseFloat(item.cantidad || item.cant || 0);

        // Precio unitario neto (sin IVA)
        let precioUnitario = parseFloat(item.precio_unitario || item.precio || item.precio_neto || 0);

        // Si no hay precio directo, calcularlo del monto neto / cantidad
        if (precioUnitario === 0 && item.monto_neto && cantidad > 0) {
            precioUnitario = parseFloat(item.monto_neto) / cantidad;
        }

        // Conversión de Moneda (CLP)
        // Algunos documentos (como DIN/Importaciones) vienen en USD u otra moneda
        const tasaCambio = parseFloat(document.tasa_cambio || 1);
        const esMonedaExtranjera = document.moneda && document.moneda !== 'CLP' && document.moneda !== '$';

        if (tasaCambio > 1 && (esMonedaExtranjera || document.tipo_doc === 'DIN')) {
            precioUnitario = precioUnitario * tasaCambio;
        }

        if (sku && cantidad > 0 && precioUnitario > 0) {
            products.push({
                sku: sku.trim(),
                cantidad,
                precioUnitario,
                proveedor: proveedor.trim(),
                rutProveedor: rutProveedor.trim(),
                folio,
                tipoDoc: document.tipo_doc || 'FACE', // Agregar tipo de documento
                fecha
            });
        }
    }

    return products;
}

/**
 * Obtener todas las compras de un rango de fechas
 * Busca tanto FACE (Facturas) como DIN (Importaciones)
 */
async function getAllPurchases(fechaInicio, fechaFin) {
    logInfo(`Obteniendo compras (FACE + DIN) del ${format(fechaInicio, 'dd/MM/yyyy')} al ${format(fechaFin, 'dd/MM/yyyy')}...`);

    // Fetch both types in parallel
    // FACE = Facturas Nacionales, FIM = Facturas Importación
    const [faceDocs, fimDocs] = await Promise.all([
        getPurchaseDocuments(fechaInicio, fechaFin, 1, 'FACE'),
        getPurchaseDocuments(fechaInicio, fechaFin, 1, 'FIM')
    ]);

    // DIN (Declaraciones de Ingreso) ya no se usan para costos, usamos FIM.

    const documents = [...faceDocs, ...fimDocs];

    logSuccess(`  FACE: ${faceDocs.length}, FIM: ${fimDocs.length} documentos`);

    const allProducts = [];

    for (const doc of documents) {
        const products = extractProductsFromPurchase(doc);
        allProducts.push(...products);
    }

    logInfo(`  Total líneas de compra: ${allProducts.length}`);

    return {
        documentsCount: documents.length,
        products: allProducts
    };
}

/**
 * Obtener compras de un día específico
 */
async function getDailyPurchases(date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return getAllPurchases(startOfDay, endOfDay);
}

/**
 * Obtener compras de un mes completo
 */
async function getMonthlyPurchases(year, month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Último día del mes

    logInfo(`Obteniendo compras del mes ${month}/${year}...`);

    return getAllPurchases(startDate, endDate);
}

/**
 * Obtener información de un producto específico desde el ERP
 */
async function getSingleProductInfo(sku) {
    try {
        const headers = await getAuthHeaders();
        // Manager+ permite filtrar por código en el endpoint de productos
        const url = `${ERP_BASE_URL}/products/${RUT_EMPRESA}/?codigo=${sku}`;

        const response = await axios.get(url, { headers, timeout: 30000 });
        const products = response.data.data || response.data || [];

        if (Array.isArray(products) && products.length > 0) {
            return products[0];
        }
        return null;
    } catch (error) {
        logWarning(`No se pudo obtener info del producto ${sku}: ${error.message}`);
        return null;
    }
}

module.exports = {
    getPurchaseDocuments,
    extractProductsFromPurchase,
    getAllPurchases,
    getDailyPurchases,
    getMonthlyPurchases,
    getSingleProductInfo
};
