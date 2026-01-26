/**
 * Script de prueba para verificar LISTAS DE PRECIOS
 * Objetivo: Obtener la Lista 652 y extraer sus SKUs para usarlos como filtro maestro.
 */

require('dotenv').config();
const axios = require('axios');
const { getAuthHeaders } = require('../../utils/auth');
const { logSection, logInfo, logError, logSuccess, logWarning } = require('../../utils/logger');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

async function main() {
    logSection('TEST LISTA DE PRECIOS (Filtro Maestro)');

    try {
        const headers = await getAuthHeaders();
        const LISTA_ID = '652'; // ID objetivo proporcionado por usuario

        // Endpoint: /api/pricelist/{{rut_empresa}}/?dets=1
        // URL base: ERP_BASE_URL suele incluir /api, así que chequear duplicidad
        // El usuario dijo: {{url}}/api/pricelist/...

        // Ajuste de URL seguro
        const baseUrl = ERP_BASE_URL.replace('/api', ''); // Limpiamos para construir según doc usuario si fuera necesario, o usamos la estándar
        // Pero normalmente ERP_BASE_URL ya es .../api. Probaremos concatenacion directa primero si es estandar.

        const url = `${ERP_BASE_URL}/pricelist/${RUT_EMPRESA}/?dets=1`;

        logInfo(`Consultando todas las listas de precios (con detalle)...`);
        logInfo(`URL: ${url}`);

        const response = await axios.get(url, { headers });
        const data = response.data.data || response.data || [];

        if (!Array.isArray(data)) {
            logError("La respuesta no es un array.");
            console.log(JSON.stringify(data).substring(0, 200));
            return;
        }

        logSuccess(`✅ Se obtuvieron ${data.length} listas de precios.`);

        // Buscar la lista 652
        // Nota: El campo ID puede ser 'codigo', 'id', 'lista', etc. Validaremos la estructura.

        if (data.length > 0) {
            console.log('Estructura Ejemplo (Header Lista):', JSON.stringify(data[0], null, 2).split('detalles')[0]); // Solo header
        }

        const targetList = data.find(l =>
            String(l.codigo) === LISTA_ID ||
            String(l.id) === LISTA_ID ||
            String(l.cod_lista) === LISTA_ID ||
            (l.descripcion && l.descripcion.includes(LISTA_ID))
        );

        if (targetList) {
            logSuccess(`✅ Lista Objetivo ${LISTA_ID} ENCONTRADA.`);
            console.log('  Objeto RAW:', JSON.stringify(targetList, null, 2));

            const detalles = targetList.detalles || targetList.productos || targetList.items || targetList.products || [];
            if (Array.isArray(detalles) && detalles.length > 0) {
                logSuccess(`  ✅ Contiene ${detalles.length} productos.`);
            } else {
                logWarning(`  ⚠️ La lista existe pero no tiene productos. (Length: ${detalles.length})`);
            }
        } else {
            logError(`❌ La lista ${LISTA_ID} NO fue encontrada.`);
        }

        // Check if ANY list has products
        const listWithProducts = data.find(l => (l.products && l.products.length > 0) || (l.detalles && l.detalles.length > 0));
        if (listWithProducts) {
            const key = listWithProducts.products ? "products" : "detalles";
            logInfo(`ℹ️ Nota: Encontré otra lista (ID: ${listWithProducts.id || listWithProducts.codigo}) que SÍ tiene productos en la propiedad '${key}'. Cantidad: ${listWithProducts[key].length}`);
        } else {
            logWarning("⚠️ NINGUNA lista en la respuesta parece tener productos.");
        }

    } catch (error) {
        logError(`Error fatal: ${error.message}`);
        if (error.response) {
            console.log("Response data:", JSON.stringify(error.response.data, null, 2));
        }
    }
}

if (require.main === module) {
    main().catch(console.error);
}
