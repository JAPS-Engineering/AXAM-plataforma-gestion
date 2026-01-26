/**
 * Script de prueba para verificar GUIAS DE DESPACHO (GDVE)
 * Objetivo: Obtener GDVEs recientes y analizar su estructura para ver si sirven para "Ventas no facturadas".
 */

require('dotenv').config();
const axios = require('axios');
const { format, startOfMonth, endOfMonth } = require('date-fns');
const { getAuthHeaders } = require('../../utils/auth');
const { logSection, logInfo, logError, logSuccess, logWarning } = require('../../utils/logger');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

async function main() {
    logSection('TEST GUIAS DE DESPACHO (GDVE)');

    try {
        const headers = await getAuthHeaders();

        // Fechas: Mes Actual
        const now = new Date();
        const df = format(startOfMonth(now), 'yyyyMMdd');
        const dt = format(endOfMonth(now), 'yyyyMMdd');

        // Endpoint: /documents/{rut}/GDVE/V/?df=...&dt=...
        // TIPO: GDVE (Guía Despacho Venta Electrónica) - Asumimos 'V' de Venta
        // NOTA: Probaremos GDVE. Si no funciona, probaremos GDES (Guía Despacho)

        const tipoDoc = 'GDVE';
        const url = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/${tipoDoc}/V/?df=${df}&dt=${dt}&details=1`; // details=1 para ver productos

        logInfo(`Consultando ${tipoDoc} desde ${df} hasta ${dt}...`);
        logInfo(`URL: ${url}`);

        const response = await axios.get(url, { headers });
        const data = response.data.data || response.data || [];

        if (!Array.isArray(data)) {
            logError("La respuesta no es un array obvio.");
            console.log("Raw Response keys:", Object.keys(response.data));
            if (response.data.message) console.log("Message:", response.data.message);
            return;
        }

        logSuccess(`✅ Se obtuvieron ${data.length} documentos ${tipoDoc}.`);

        if (data.length > 0) {
            // Analizar el primero
            const doc = data[0];
            logSection('ESTRUCTURA DOCUMENTO EJEMPLO');
            console.log(JSON.stringify(doc, null, 2));

            // Verificar puntos clave
            logSection('VERIFICACIÓN DE DATOS CLAVE');

            // 1. Productos/Detalles
            const items = doc.detalles || doc.items || doc.productos || [];
            if (items.length > 0) {
                logSuccess(`✅ Tiene detalles (Productos): ${items.length} items.`);
                console.log('   Ejemplo Item:', JSON.stringify(items[0], null, 2));
            } else {
                logWarning('⚠️  El documento NO tiene detalles/items (¿Falta details=1 o estructura distinta?)');
            }

            // 2. Vendedor
            if (doc.cod_vendedor || doc.vendedor || doc.usuario_vendedor) {
                logSuccess(`✅ Tiene datos de vendedor: ${doc.cod_vendedor || doc.vendedor}`);
            } else {
                logWarning('⚠️  NO se detecta campo obvio de vendedor (cod_vendedor/usuario_vendedor).');
            }

            // 3. Montos
            if (doc.total || doc.monto_neto) {
                logSuccess(`✅ Tiene montos: Total=${doc.total}, Neto=${doc.monto_neto}`);
            } else {
                logWarning('⚠️  NO se detectan montos claros.');
            }

            // 4. Referencias (¿Facturada?)
            // Buscamos si tiene referencia a alguna factura o estado
            logInfo('   Analizando Referencias (para saber si está facturada):');
            if (doc.referencias) console.log('   Referencias:', doc.referencias);
            else console.log('   (Sin campo referencias explícito)');

            // A veces el estado indica si está facturada
            console.log(`   Estado: ${doc.estado} | Situación: ${doc.situacion} | ¿Facturada?: ${doc.facturada ? 'SI' : 'NO/Indefinido'}`);

        } else {
            logWarning("⚠️  No hay documentos en este rango de fechas para analizar.");
        }

    } catch (error) {
        // Manejo robusto de errores para Node 12 (sin optional chaining)
        const status = (error.response && error.response.status) || 'Unknown';
        const data = (error.response && error.response.data);
        logError(`Error fatal (${status}): ${error.message}`);
        if (data) {
            console.log("Response data:", JSON.stringify(data, null, 2));
        }
    }
}

if (require.main === module) {
    main().catch(console.error);
}
