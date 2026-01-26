/**
 * Script de prueba: "Time Travel" en Stock
 * Intenta obtener el stock de un producto en fechas pasadas pasando parámetros de fecha al endpoint actual.
 */

require('dotenv').config();
const axios = require('axios');
const { format, subDays } = require('date-fns');
const { getAuthHeaders } = require('../../utils/auth');
const { logSection, logInfo, logError, logSuccess, logWarning } = require('../../utils/logger');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

async function getStockForDate(sku, date) {
    const headers = await getAuthHeaders();
    const dateStr = format(date, 'yyyyMMdd'); // Formato común Manager+
    const dateISO = format(date, 'yyyy-MM-dd');

    // Probamos varios parámetros de fecha comunes
    const paramsList = [
        { fecha: dateStr },
        { date: dateStr },
        { dt: dateStr },
        { to_date: dateStr },
        { until: dateStr },
        { fecha: dateISO }, // Try ISO format too
        { at: dateStr }
    ];

    // Intentamos solo el primero o iteramos?
    // Para no hacer flood, probaremos concatenando params o uno específico si el usuario sugirió.
    // El usuario dijo "cambiemos la fecha de la consulta".

    // Vamos a probar con 'fecha' y 'df/dt' simulando un rango de 1 día
    const url = `${ERP_BASE_URL}/products/${RUT_EMPRESA}/${sku}/`;

    try {
        // Opción A: Pasar fecha como query param simple
        const response = await axios.get(url, {
            headers,
            params: {
                con_stock: 'S',
                fecha: dateStr  // Hipótesis principal
            }
        });

        const prod = response.data.data?.[0] || response.data;
        if (!prod || !prod.stock) return null;

        // Sumar stock (logica simplificada)
        let total = 0;
        const processItem = (item) => {
            const saldo = parseFloat(item.saldo || 0);
            if (saldo > 0) total += saldo;
        };

        if (Array.isArray(prod.stock)) {
            prod.stock.forEach(entry => Array.isArray(entry) ? entry.forEach(processItem) : processItem(entry));
        }

        return total;

    } catch (error) {
        return null; // Error o no soportado
    }
}

async function main() {
    logSection('TEST STOCK TIME-TRAVEL (5 Productos, 14 Días)');

    try {
        const headers = await getAuthHeaders();

        // 1. Obtener SKUs con MOVIMIENTOS/STOCK REAL
        logInfo("Buscando productos con stock...");
        const prodResp = await axios.get(`${ERP_BASE_URL}/products/${RUT_EMPRESA}?limit=100&con_stock=S`, { headers });
        const products = prodResp.data.data || prodResp.data || [];

        // Filtrar productos que tengan algo de stock
        const targetProducts = products.filter(p => {
            if (!p.stock || !Array.isArray(p.stock)) return false;
            let total = 0;
            const check = (item) => { if (item?.saldo > 0) total += parseFloat(item.saldo); };
            p.stock.forEach(entry => Array.isArray(entry) ? entry.forEach(check) : check(entry));
            return total > 0;
        }).slice(0, 5); // Tomar los primeros 5

        if (targetProducts.length === 0) {
            logError("No se encontraron productos con stock positivo para el test.");
            return;
        }

        logSuccess(`Se encontraron ${targetProducts.length} productos para probar.`);

        // 2. Iterar por cada producto
        for (const prod of targetProducts) {
            const sku = prod.codigo_prod || prod.sku || prod.codigo;
            logSection(`Analizando Producto: ${sku} (${prod.nombre})`);

            const historico = [];
            let constantStock = true;
            let firstValue = null;

            // Probar últimos 14 días con saltos (hoy, hace 7 días, hace 14 días para ser rápido, o día a día)
            // El usuario pidió "últimos 14 días", haremos saltos de 2 días para no saturar: 0, 2, 4, ... 14
            for (let i = 0; i <= 14; i += 2) {
                const date = subDays(new Date(), i);
                const stock = await getStockForDate(sku, date);
                const dateStr = format(date, 'yyyy-MM-dd');

                historico.push({ date: dateStr, stock });
                console.log(`  📅 ${dateStr}: ${stock !== null ? stock : 'Error'}`);

                if (stock !== null) {
                    if (firstValue === null) firstValue = stock;
                    if (stock !== firstValue) constantStock = false;
                }
            }

            if (!constantStock) {
                logSuccess(`  ✅ ¡VARIACIÓN DETECTADA en ${sku}!`);
                logInfo(`  El stock cambia según la fecha consultada. ES POSIBLE OBTENER HISTÓRICO.`);
            } else {
                logWarning(`  ⚠️  Stock constante en ${sku}.`);
                logInfo(`  Valores idénticos (${firstValue}) en todo el rango.`);
            }
        }

    } catch (error) {
        logError(`Error fatal: ${error.message}`);
    }
}

if (require.main === module) {
    main().catch(console.error);
}
