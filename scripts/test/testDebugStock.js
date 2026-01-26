/**
 * comparacionStock.js
 * 
 * 1. Ejecuta la lógica ACTUAL (stockService) para ver qué devuelve para KC12071.
 * 2. Prueba variantes exactas de URL para intentar 'romper' el 404 del endpoint de historia.
 */

require('dotenv').config();
const axios = require('axios');
const { format, subDays } = require('date-fns');
const { getAuthHeaders } = require('../../utils/auth');
const { logSection, logInfo, logError, logSuccess, logWarning } = require('../../utils/logger');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

async function main() {
    logSection('DEBUG: STOCK ACTUAL vs HISTORICO');

    const sku = 'KC12071';

    // 1. PROBAR LOGICA ACTUAL (BASELINE) - Replicada de stockService.js para evitar error de Prisma
    logInfo(`1. Consultando Stock ACTUAL (Simulación stockService) para ${sku}...`);
    try {
        const headers = await getAuthHeaders();
        // Lógica exacta de stockService.js: getManagerProductBySKU
        // const url = `${ERP_BASE_URL}/products/${RUT_EMPRESA}/${sku}/`;
        const url = `${ERP_BASE_URL}/products/${RUT_EMPRESA}/${sku}/`;

        console.log(`   Baseline URL: ${url}`);

        const response = await axios.get(url, {
            headers,
            params: {
                con_stock: 'S'  // Clave: Esto es lo que usa la APP
            }
        });

        const productData = response.data.data || response.data;
        const product = Array.isArray(productData) ? productData[0] : productData;

        if (product && product.stock) {
            console.log(`✅ Stock Actual Raw:`, JSON.stringify(product.stock).substring(0, 200));
        } else {
            console.log(`❌ No se encontró stock en Baseline.`);
        }

    } catch (e) {
        logError(`❌ Error en Baseline: ${e.message}`);
    }

    // 2. PROBAR ENDPOINT SUGERIDO (/api/stock) CON VARIANTES
    logInfo('\n2. Buscando endpoint /stock/ con variantes de URL...');
    const headers = await getAuthHeaders();

    // Lista de URLs candidatas
    // ERP_BASE_URL suele ser .../api
    const cleanBase = ERP_BASE_URL.replace(/\/$/, ''); // Quitar slash final si existe

    const variants = [
        // Si base es .../api, esto es .../api/stock/...
        `${cleanBase}/stock/${RUT_EMPRESA}/${sku}`,
        `${cleanBase}/stock/${RUT_EMPRESA}/${sku}/`,
        // Si base es .../api, probamos quitar /api para ver si es raiz/stock
        `${cleanBase.replace('/api', '')}/stock/${RUT_EMPRESA}/${sku}`,
        // Variantes con "stocks" (plural) que a veces se usa
        `${cleanBase}/stocks/${RUT_EMPRESA}/${sku}`,
        `${cleanBase}/products/${RUT_EMPRESA}/${sku}/stock` // A veces es subrecurso
    ];

    for (const url of variants) {
        process.stdout.write(`Probando: ${url} ... `);
        try {
            const resp = await axios.get(url, {
                headers,
                params: { dt: '20260126', con_stock: '0', dets: '1' },
                validateStatus: () => true // No lanzar excepción
            });

            if (resp.status === 200) {
                console.log(`✅ 200 OK`);
                console.log('   Data:', JSON.stringify(resp.data).substring(0, 300));
            } else {
                console.log(`❌ ${resp.status}`);
            }
        } catch (e) {
            console.log(`❌ Error ${e.message}`);
        }
    }

    // 3. PROBAR HISTORIA REAL CON PARAMETROS VERIFICADOS
    logInfo('\n3. Verificando Variación Histórica (30 días)...');

    // URL verificada
    const targetUrl = `${cleanBase}/stock/${RUT_EMPRESA}/${sku}/`;

    const historico = [];

    for (let i = 0; i <= 30; i++) {
        const date = subDays(new Date(), i);
        const dateStr = format(date, 'yyyyMMdd');
        const displayDate = format(date, 'yyyy-MM-dd');

        process.stdout.write(`  📅 ${displayDate} (dt=${dateStr}) ... `);

        try {
            const resp = await axios.get(targetUrl, {
                headers,
                params: {
                    dt: dateStr,
                    con_stock: '0',
                    dets: '1'
                    // No enviamos resv por si acaso
                }
            });

            if (resp.data && resp.data.data) {
                const item = Array.isArray(resp.data.data) ? resp.data.data[0] : resp.data.data;
                const saldo = item ? item.saldo_total : 0;
                console.log(`✅ Saldo: ${saldo}`);
                historico.push(saldo);
            } else {
                console.log(`⚠️  Empty Data`);
                historico.push(null);
            }
        } catch (e) {
            console.log(`❌ Error: ${e.response?.status || e.message}`);
            historico.push(null);
        }
    }

    // Análisis Final
    const values = historico.filter(v => v !== null);
    const unique = new Set(values);
    logInfo(`\nResumen: ${unique.size} valores únicos encontrados: [${Array.from(unique).join(', ')}]`);

    if (unique.size > 1) {
        logSuccess(`✅ EXITOSO: EL SISTEMA PERMITE VIAJAR EN EL TIEMPO.`);
    } else {
        logWarning(`⚠️  FRACASO: El stock es constante. La API ignora la fecha.`);
    }
}

if (require.main === module) {
    main().catch(console.error);
}
