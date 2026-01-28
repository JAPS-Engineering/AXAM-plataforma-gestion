
require('dotenv').config();
const axios = require('axios');
const { format } = require('date-fns');
const { getAuthHeaders } = require('../utils/auth');
const { logInfo, logSuccess, logError } = require('../utils/logger');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

async function testEndpoint(type = 'V') {
    try {
        const headers = await getAuthHeaders();
        const fechaHoy = new Date();
        const fechaInicio = new Date(fechaHoy);
        fechaInicio.setDate(fechaInicio.getDate() - 30); // Últimos 30 días

        const fechaInicioStr = format(fechaInicio, 'yyyyMMdd');
        const fechaFinStr = format(fechaHoy, 'yyyyMMdd');

        // Endpoint variants: V (Venta), C (Compra)
        const url = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/FACE/${type}/?df=${fechaInicioStr}&dt=${fechaFinStr}`;

        logInfo(`Probando endpoint tipo ${type}: ${url}`);

        const response = await axios.get(url, { headers });
        const docs = response.data.data || response.data || [];

        logSuccess(`✅ ÉXITO con tipo ${type}. Encontrados: ${Array.isArray(docs) ? docs.length : 'Objeto'}`);
        return true;

    } catch (error) {
        logError(`❌ FALLO con tipo ${type}: ${error.response?.status} - ${error.response?.statusText}`);
        if (error.response?.data) console.log(JSON.stringify(error.response.data));
        return false;
    }
}

async function main() {
    logInfo('Test de Endpoint FACE (Compras)');

    // Probar primero V (el actual que falla)
    await testEndpoint('V');

    // Probar C (Compra)
    await testEndpoint('C');
}

main();
