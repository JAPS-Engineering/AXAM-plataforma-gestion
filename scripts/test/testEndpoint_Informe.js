/**
 * Script de prueba para buscar documentos tipo INF (Informe de Existencias)
 * Objetivo: Obtener Costo de Última Compra.
 */

require('dotenv').config();
const axios = require('axios');
const { format } = require('date-fns');
const { getAuthHeaders } = require('../../utils/auth');
const { logSection, logInfo, logError, logSuccess, logWarning } = require('../../utils/logger');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

async function main() {
    logSection('TEST ENDPOINT INFORMES (Tipo INF)');

    try {
        const headers = await getAuthHeaders();
        const fechaHoy = new Date();
        const fechaInicio = new Date(fechaHoy);
        fechaInicio.setDate(fechaInicio.getDate() - 30);

        const df = format(fechaInicio, 'yyyyMMdd');
        const dt = format(fechaHoy, 'yyyyMMdd');

        // Probar tipo documento INFE (Informe Existencia Electrónico) y otros candidatos
        const tipos = ['INFE', 'INE', 'INF'];

        for (const tipo of tipos) {
            const url = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/${tipo}/V/?df=${df}&dt=${dt}`;

            logInfo(`\nConsultando documentos tipo ${tipo}...`);
            logInfo(`URL: ${url}`);

            try {
                const response = await axios.get(url, { headers });
                const docs = response.data.data || response.data || [];

                if (Array.isArray(docs) && docs.length > 0) {
                    logSuccess(`✅ Se encontraron ${docs.length} documentos tipo ${tipo}`);
                    console.log('Ejemplo:', JSON.stringify(docs[0], null, 2));

                    // Verificar costo
                    const sample = docs[0];
                    if (sample.costo || sample.precio || sample.detalle || sample.monto_afecto) {
                        logSuccess(`✅ INFO PROMETEDORA en ${tipo}: Contiene datos de valores.`);
                        break; // Éxito
                    }
                } else {
                    logWarning(`⚠️  No se encontraron documentos ${tipo}`);
                }
            } catch (error) {
                // logWarning(`❌ Error consultando ${tipo}: ${error.response?.status}`);
            }
        }

    } catch (error) {
        logError(`Error fatal: ${error.message}`);
    }
}

if (require.main === module) {
    main().catch(console.error);
}
