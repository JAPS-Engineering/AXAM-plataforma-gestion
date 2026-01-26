/**
 * Script de prueba para verificar REFERENCIAS en FAVE
 * Objetivo: Ver si podemos detectar "GDVE" en las referencias de una factura.
 */

require('dotenv').config();
const axios = require('axios');
const { format, startOfMonth, endOfMonth, subMonths } = require('date-fns');
const { getAuthHeaders } = require('../../utils/auth');
const { logSection, logInfo, logError, logSuccess, logWarning } = require('../../utils/logger');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

async function main() {
    logSection('TEST REFERENCIAS EN FAVE (Lógica de Exclusión)');

    try {
        const headers = await getAuthHeaders();

        // Buscamos 2 meses atrás para tener más probabilidad de encontrar facturas con referencias
        const now = new Date();
        const df = format(subMonths(now, 2), 'yyyyMMdd');
        const dt = format(endOfMonth(now), 'yyyyMMdd');

        const url = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/FAVE/V/?df=${df}&dt=${dt}&details=1`; // details=1 por si acaso referencias vienen ahí

        logInfo(`Consultando FAVE desde ${df} hasta ${dt}...`);

        const response = await axios.get(url, { headers });
        const data = response.data.data || response.data || [];

        if (!Array.isArray(data) || data.length === 0) {
            logWarning("No se encontraron FAVEs.");
            return;
        }

        logSuccess(`Analizando ${data.length} FAVEs...`);

        let favesConReferencias = 0;
        let favesConGDVE = 0;

        for (const doc of data) {
            // Verificar campo referencias
            // La API puede devolverlo como array en 'referencias' o dentro de 'detalles' (raro) o 'encabezado'

            const refs = doc.referencias || [];

            if (Array.isArray(refs) && refs.length > 0) {
                favesConReferencias++;

                // Mostrar ejemplo
                if (favesConReferencias <= 3) {
                    console.log(`\n📄 FAVE Folio: ${doc.folio}`);
                    console.log(`   Referencias encontradas:`, JSON.stringify(refs));
                }

                // Buscar GDVE
                // Estructura esperada: { tipo_doc: "GDVE", folio: "..." } o string
                const tieneGDVE = refs.some(r =>
                    (r.tipo_doc && r.tipo_doc.includes('GDVE')) ||
                    (r.tipo && r.tipo.includes('GDVE')) ||
                    (JSON.stringify(r).includes('GDVE')) // Fallback sucio
                );

                if (tieneGDVE) {
                    favesConGDVE++;
                    if (favesConGDVE <= 3) {
                        console.log(`   🚨 DETECTADA GDVE! -> Esta factura SE DEBERÍA EXCLUIR según nueva lógica.`);
                    }
                }
            }
        }

        console.log('\n================ RESUMEN ================');
        console.log(`Total FAVEs analizadas: ${data.length}`);
        console.log(`FAVEs con Referencias: ${favesConReferencias}`);
        console.log(`FAVEs que refieren a GDVE: ${favesConGDVE}`);

        if (favesConGDVE > 0) {
            logSuccess("✅ Confirmado: Podemos identificar referencias a GDVE.");
        } else {
            logWarning("⚠️ No encontré referencias a GDVE en la muestra. Verificar si el campo referencias tiene otro nnombre o formato.");
            // Imprimir estructura completa de la primera FAVE para debug
            if (data.length > 0) {
                console.log("\nEstructura RAW de una FAVE:");
                console.log(JSON.stringify(data[0], null, 2));
            }
        }

    } catch (error) {
        console.error(error.message);
    }
}

if (require.main === module) {
    main().catch(console.error);
}
