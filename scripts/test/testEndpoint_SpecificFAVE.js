/**
 * Script para inspeccionar una FAVE específica (Folio 129497)
 * Objetivo: Ver la estructura exacta del campo 'referencias'.
 * 
 * Versión optimizada: Rango corto
 */

require('dotenv').config();
const axios = require('axios');
const { format, subMonths, addDays } = require('date-fns');
const { getAuthHeaders } = require('../../utils/auth');
const { logInfo, logError, logSuccess, logWarning } = require('../../utils/logger');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

async function main() {
    const TARGET_FOLIO = 129527;
    console.log(`\n🔍 BUSCANDO FAVE FOLIO: ${TARGET_FOLIO} (Corrección según imagen)\n`);

    try {
        const headers = await getAuthHeaders();

        // Rango optimizado: 2 meses (Dic-Ene)
        const end = new Date();
        const start = subMonths(end, 2);

        const df = format(start, 'yyyyMMdd');
        const dt = format(end, 'yyyyMMdd');

        const url = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/FAVE/V/?df=${df}&dt=${dt}&details=1`;

        logInfo(`Consultando rango corto ${df} - ${dt}...`);

        const response = await axios.get(url, { headers });
        const data = response.data.data || response.data || [];

        if (!Array.isArray(data)) {
            logError("Respuesta no es un array");
            return;
        }

        // Buscar conversión string/number segura
        const found = data.find(d =>
            String(d.folio) === String(TARGET_FOLIO) ||
            String(d.numero) === String(TARGET_FOLIO)
        );

        if (found) {
            logSuccess(`✅ DOCUMENTO ENCONTRADO:`);
            console.log(JSON.stringify(found, null, 2));

            console.log('\n------------------------------------------------');
            console.log('🔎 ANÁLISIS DE REFERENCIAS:');

            // Chequear todas las ubicaciones posibles
            if (found.referencias) console.log('RAIZ.referencias:', JSON.stringify(found.referencias));
            if (found.detalles && found.detalles.referencias) console.log('DETALLES.referencias:', JSON.stringify(found.detalles.referencias));
            if (found.encabezado && found.encabezado.referencias) console.log('ENCABEZADO.referencias:', JSON.stringify(found.encabezado.referencias));

        } else {
            logError(`❌ No se encontró la FAVE ${TARGET_FOLIO} en el rango ${df}-${dt}.`);
            console.log(`(Total documentos descargados: ${data.length})`);
        }

    } catch (error) {
        console.error("Error:", error.message);
        if (error.response) console.log(error.response.data);
    }
}

if (require.main === module) {
    main().catch(console.error);
}
