/**
 * Script de prueba para verificar extracción de VENDEDORES
 * Revisa headers de FAVEs para encontrar códigos de vendedor.
 */

require('dotenv').config();
const axios = require('axios');
const { format } = require('date-fns');
const { getAuthHeaders } = require('../../utils/auth');
const { logSection, logInfo, logError, logSuccess, logWarning } = require('../../utils/logger');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

async function main() {
    logSection('TEST DATA VENDEDORES');

    try {
        const headers = await getAuthHeaders();
        const fechaHoy = new Date();
        const fechaInicio = new Date(fechaHoy);
        fechaInicio.setDate(fechaInicio.getDate() - 7);
        const df = format(fechaInicio, 'yyyyMMdd');
        const dt = format(fechaHoy, 'yyyyMMdd');

        const url = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/FAVE/V/?df=${df}&dt=${dt}&limit=5`;
        logInfo(`Obteniendo FAVEs recientes...`);

        const response = await axios.get(url, { headers });
        const faves = response.data.data || response.data || [];

        if (faves.length === 0) {
            logWarning("No se encontraron FAVEs recientes.");
            return;
        }

        logSuccess(`Analizando ${faves.length} FAVEs de muestra para campos de vendedor...`);

        // Contadores
        const vendedoresEncontrados = new Set();
        let sinVendedor = 0;

        faves.forEach(fave => {
            const vendedor = fave.cod_vendedor || fave.usuario_vendedor;
            if (vendedor) {
                vendedoresEncontrados.add(vendedor);
            } else {
                sinVendedor++;
            }
        });

        logSuccess(`✅ Análisis de Vendedores:`);
        logInfo(`  - Total Documentos analizados: ${faves.length}`);
        logInfo(`  - Vendedores Únicos detectados: ${vendedoresEncontrados.size} ([${Array.from(vendedoresEncontrados).join(', ')}])`);

        if (sinVendedor > 0) {
            logWarning(`  - Documentos SIN vendedor: ${sinVendedor}`);
        } else {
            logSuccess(`  - Todos los documentos tienen asignado vendedor.`);
        }

        // Mostrar ejemplo detallado
        if (faves.length > 0) {
            const f = faves[0];
            logInfo(`\nEjemplo FAVE ${f.folio}:`);
            console.log(`  cod_vendedor: ${f.cod_vendedor}`);
            console.log(`  usuario_vendedor: ${f.usuario_vendedor}`);
        }

    } catch (error) {
        logError(`Error fatal: ${error.message}`);
    }
}

if (require.main === module) {
    main().catch(console.error);
}
