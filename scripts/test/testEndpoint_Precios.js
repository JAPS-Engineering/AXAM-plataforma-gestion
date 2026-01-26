/**
 * Script de prueba para verificar PRECIOS y COSTOS
 * Busca "precio_ultima_compra" o historial de precios.
 */

require('dotenv').config();
const axios = require('axios');
const { getAuthHeaders } = require('../../utils/auth');
const { logSection, logInfo, logError, logSuccess, logWarning } = require('../../utils/logger');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

async function main() {
    logSection('TEST ENDPOINT PRECIOS Y COSTOS');

    try {
        const headers = await getAuthHeaders();

        // 1. Get a sample product
        const prodResp = await axios.get(`${ERP_BASE_URL}/products/${RUT_EMPRESA}?limit=1`, { headers });
        const prod = prodResp.data.data?.[0] || prodResp.data?.[0];

        if (!prod) {
            logError("No se encontraron productos para probar.");
            return;
        }

        const sku = prod.codigo_prod || prod.cod_producto || prod.codigo || prod.sku || 'N/A';
        const costo = prod.costo;

        if (costo !== undefined) {
            logSuccess(`✅ Campo 'costo' disponible: ${costo}`);
            logInfo(`   NOTA: Usaremos este campo como aproximación del 'Precio Última Compra'`);
        } else {
            logWarning(`❌ Campo 'costo' NO encontrado en el producto.`);
        }

        // Ya sabemos que price-lists falla, lo omitimos para limpieza del reporte

    } catch (error) {
        logError(`Error fatal: ${error.message}`);
    }
}

if (require.main === module) {
    main().catch(console.error);
}
