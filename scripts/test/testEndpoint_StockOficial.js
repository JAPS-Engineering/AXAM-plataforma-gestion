/**
 * Script de prueba para el endpoint de STOCK OFICIAL (Proporcionado por usuario)
 * URL: /api/stock/{{rut}}/{{sku}}/?dets=1&resv=0&dt=YYYYMMDD&con_stock=1
 */

require('dotenv').config();
const axios = require('axios');
const { format, subDays } = require('date-fns');
const { getAuthHeaders } = require('../../utils/auth');
const { logSection, logInfo, logError, logSuccess, logWarning } = require('../../utils/logger');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

async function getStockOficial(sku, date) {
    const headers = await getAuthHeaders();
    const dateStr = format(date, 'yyyyMMdd');

    // Construir URL exacta según documentación del usuario
    // Nota: ERP_BASE_URL suele ser 'https://axam.managermas.cl/api' o similar.
    // El usuario dijo: {{url}}/api/stock/...
    // Si ERP_BASE_URL ya incluye /api, debemos tener cuidado de no duplicarlo o ajustar.

    // Vamos a asumir que ERP_BASE_URL apunta a la raiz de la api, e.g. https://domain.managermas.cl/api
    // Entonces el endpoint es /stock/...

    const url = `${ERP_BASE_URL}/stock/${RUT_EMPRESA}/${sku}/`;

    try {
        const response = await axios.get(url, {
            headers,
            params: {
                dets: 1,
                resv: 0,
                dt: dateStr,
                con_stock: 0 // Cambiamos a 0 para ver si devuelve algo aunque sea 0, o 1 si queremos solo positivos
            }
        });

        // Analizar respuesta
        const data = response.data.data || response.data;

        // Loguear estructura de respuesta para la primera llamada
        if (global.logFirstResponse) {
            console.log(`Respuesta Raw para ${dateStr}:`, JSON.stringify(data, null, 2).substring(0, 500));
            global.logFirstResponse = false;
        }

        if (!data) return null;

        // Sumar stock
        // La estructura de respuesta de este endpoint específico puede ser diferente.
        // Asumimos array de bodegas/lotes o un objeto con campos.

        let total = 0;
        const items = Array.isArray(data) ? data : [data];

        items.forEach(item => {
            if (item.saldo_total !== undefined) {
                total += parseFloat(item.saldo_total || 0);
            } else if (item.saldo !== undefined) {
                total += parseFloat(item.saldo || 0);
            } else if (item.stock && Array.isArray(item.stock)) {
                // Sumar stock de sub-items o bodegas
                item.stock.forEach(sub => {
                    total += parseFloat(sub.saldo || sub.cantidad || 0);
                });
            }
        });

        return total;

    } catch (error) {
        if (error.response?.status !== 404) {
            // logWarning(`Error ${error.response?.status} en ${url}`);
        }
        return null;
    }
}

async function main() {
    logSection('TEST STOCK OFICIAL (Endpoint Documentación)');
    global.logFirstResponse = true;

    try {
        const headers = await getAuthHeaders();

        // 1. Usar SKU específico solicitado por usuario
        const sku = 'KC12071';
        logInfo(`Producto Objetivo: ${sku}`);

        // 2. Probar endpoint específico últimos 30 días
        logInfo(`\nProbando endpoint /api/stock/${RUT_EMPRESA}/${sku}/ para últimos 30 días...`);

        const historico = [];

        for (let i = 0; i <= 30; i++) {
            const date = subDays(new Date(), i);
            const stock = await getStockOficial(sku, date);
            const dateStr = format(date, 'yyyy-MM-dd');

            console.log(`  📅 ${dateStr} (dt=${format(date, 'yyyyMMdd')}): ${stock !== null ? stock : 'Error/404'}`);
            historico.push(stock);
        }

        // Verificación de variación
        const validStocks = historico.filter(s => s !== null);
        const unique = new Set(validStocks);

        if (unique.size > 1) {
            logSuccess(`✅ ¡VARIACIÓN DETECTADA! El endpoint retorna stocks distintos por fecha.`);
        } else if (validStocks.length > 0) {
            logWarning(`⚠️  Valores obtenidos pero constantes. Verificaremos manualmente si es correcto.`);
        } else {
            logError(`❌ No se pudieron obtener datos (todos Error/404). Verifica la URL.`);
        }

    } catch (error) {
        logError(`Error fatal: ${error.message}`);
    }
}

if (require.main === module) {
    main().catch(console.error);
}
