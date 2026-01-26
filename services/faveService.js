/**
 * Servicio para obtener FAVEs desde Manager+
 */

const axios = require('axios');
const { format, addDays } = require('date-fns');
const { getAuthHeaders } = require('../utils/auth');
const { logInfo, logSuccess, logError } = require('../utils/logger');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

/**
 * Obtener Documentos (FAVE, GDVE, etc) de un rango de fechas
 */
async function getDocuments(docType = 'FAVE', fechaInicio, fechaFin, maxRetries = 3) {
    const headers = await getAuthHeaders();

    const fechaInicioStr = format(fechaInicio, 'yyyyMMdd');
    const fechaFinStr = format(fechaFin, 'yyyyMMdd');

    // Endpoint genérico para documentos: /documents/{rut}/{TIPO}/V/
    const url = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/${docType}/V/?df=${fechaInicioStr}&dt=${fechaFinStr}`;

    logInfo(`Obteniendo ${docType} del ${format(fechaInicio, 'dd/MM/yyyy')} al ${format(fechaFin, 'dd/MM/yyyy')}...`);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await axios.get(url, { headers });
            const docs = response.data.data || response.data || [];

            if (!Array.isArray(docs)) {
                return [];
            }
            return docs;

        } catch (error) {
            // Si es error 429 (Too Many Requests)
            if (error.response && error.response.status === 429) {
                const retryAfter = (error.response && error.response.data && error.response.data.retry) || 10;
                logInfo(`  ⏳ Rate limit detectado. Esperando ${retryAfter}s...`);

                if (attempt === maxRetries) throw error;
                await new Promise(resolve => setTimeout(resolve, (retryAfter + 1) * 1000));
                continue;
            }

            if (attempt === maxRetries) {
                const msg = (error.response && error.response.data && error.response.data.message) || error.message;
                logError(`Error al obtener ${docType}: ${msg}`);
                throw error;
            }

            const waitTime = 2000 * (attempt + 1);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
}

// Wrapper para retro-compatibilidad (aunque deberíamos migrar)
async function getFAVEs(fechaInicio, fechaFin, maxRetries = 3) {
    return getDocuments('FAVE', fechaInicio, fechaFin, maxRetries);
}

/**
 * Obtener todos los documentos dividiendo en períodos
 */
async function getAllDocuments(docType = 'FAVE', fechaInicio, fechaFin) {
    const todosLosDocs = [];
    let fechaActual = new Date(fechaInicio);

    while (fechaActual < fechaFin) {
        let fechaFinPeriodo = new Date(fechaActual);
        fechaFinPeriodo = addDays(fechaFinPeriodo, 364); // Max 1 año por query

        if (fechaFinPeriodo > fechaFin) {
            fechaFinPeriodo = new Date(fechaFin);
        }

        const docsPeriodo = await getDocuments(docType, fechaActual, fechaFinPeriodo);
        todosLosDocs.push(...docsPeriodo);

        logSuccess(`    Encontrados ${docsPeriodo.length} ${docType} en periodo ${format(fechaActual, 'dd/MM/yyyy')} - ${format(fechaFinPeriodo, 'dd/MM/yyyy')}`);

        fechaActual = addDays(fechaFinPeriodo, 1);
    }
    return todosLosDocs;
}

// Wrapper para retro-compatibilidad
async function getAllFAVEs(fechaInicio, fechaFin) {
    return getAllDocuments('FAVE', fechaInicio, fechaFin);
}

/**
 * Obtener detalles de un documento específico
 */
async function getDocumentDetails(docType, doc, maxRetries = 2, returnErrorInfo = false) {
    const headers = await getAuthHeaders();
    const docnumreg = doc.docnumreg;
    const endpointConDetalles = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/${docType}/V/?docnumreg=${docnumreg}&details=1`;

    let lastError = null;
    let lastResponse = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await axios.get(endpointConDetalles, {
                headers,
                timeout: 60000
            });

            lastResponse = response.data;
            let data = response.data;
            if (data && data.data !== undefined) data = data.data;

            if (!data) return returnErrorInfo ? { success: false, error: 'Empty', response: lastResponse } : null;

            if (Array.isArray(data)) {
                const documento = data.find(d => d && d.docnumreg === docnumreg);
                if (documento) return returnErrorInfo ? { success: true, data: documento } : documento;
                return returnErrorInfo ? { success: true, data: data[0], warning: 'Position match' } : data[0];
            } else if (typeof data === 'object') {
                return returnErrorInfo ? { success: true, data: data } : data;
            }

            return null;

        } catch (error) {
            lastError = error;
            lastResponse = (error.response && error.response.data) || null;

            if (error.response && error.response.status === 429) {
                const retry = (error.response && error.response.data && error.response.data.retry) || 5;
                await new Promise(r => setTimeout(r, (retry + 1) * 1000));
                continue;
            }

            if (attempt === maxRetries) {
                if (returnErrorInfo) return { success: false, error: error.message, response: lastResponse };
                return null;
            }
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
    }
    return null;
}

// Wrapper
async function getFAVEDetails(fave, maxRetries = 2, returnErrorInfo = false) {
    return getDocumentDetails('FAVE', fave, maxRetries, returnErrorInfo);
}

module.exports = {
    getDocuments,
    getAllDocuments,
    getDocumentDetails,
    getFAVEs,
    getAllFAVEs,
    getFAVEDetails
};
