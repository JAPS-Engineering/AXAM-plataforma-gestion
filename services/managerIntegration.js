/**
 * Servicio de integración con Manager+
 * NOTA: Funcionalidad DESACTIVADA hasta obtener permisos de escritura en la API
 * Por ahora solo loguea el payload que se enviaría
 */

const { logInfo, logWarning, logError } = require('../utils/logger');

// Flag para habilitar/deshabilitar integración real
const INTEGRATION_ENABLED = false;

/**
 * Crea una Orden de Compra en Manager+ (DESACTIVADO)
 * @param {Object} data - Datos de la OC
 * @returns {Object} - Resultado mock
 */
async function createPurchaseOrder(data) {
    const {
        proveedor,
        items,
        observaciones = '',
        fechaEntrega
    } = data;

    // Log del payload que se enviaría
    logInfo('[OC-MOCK] Simulando creación de Orden de Compra Nacional:');
    logInfo(`  Proveedor: ${proveedor}`);
    logInfo(`  Items: ${items.length}`);
    logInfo(`  Total unidades: ${items.reduce((sum, i) => sum + i.cantidad, 0)}`);

    if (INTEGRATION_ENABLED) {
        // TODO: Implementar llamada real a Manager+
        // const response = await axios.post(`${ERP_BASE_URL}/ordenes-compra`, payload);
        logWarning('[OC] Integración habilitada pero no implementada');
    } else {
        logWarning('[OC-MOCK] Integración DESACTIVADA - Orden no enviada a Manager+');
    }

    // Retornar respuesta mock
    return {
        success: true,
        mock: true,
        message: 'Orden de Compra simulada (integración desactivada)',
        data: {
            codigo: `OC-MOCK-${Date.now()}`,
            proveedor,
            itemsCount: items.length,
            totalUnidades: items.reduce((sum, i) => sum + i.cantidad, 0),
            timestamp: new Date().toISOString()
        }
    };
}

/**
 * Crea una Orden de Compra de Importación en Manager+ (DESACTIVADO)
 * @param {Object} data - Datos de la OCI
 * @returns {Object} - Resultado mock
 */
async function createImportOrder(data) {
    const {
        proveedor,
        items,
        moneda = 'USD',
        tipoCambio,
        observaciones = '',
        fechaEmbarque,
        diasImportacion
    } = data;

    // Calcular monto en USD si es necesario
    const montoUSD = items.reduce((sum, i) => sum + (i.precioUnit * i.cantidad), 0);
    const montoCLP = tipoCambio ? montoUSD * tipoCambio : null;

    // Log del payload que se enviaría
    logInfo('[OCI-MOCK] Simulando creación de Orden de Compra de Importación:');
    logInfo(`  Proveedor: ${proveedor}`);
    logInfo(`  Moneda: ${moneda}`);
    logInfo(`  Items: ${items.length}`);
    logInfo(`  Monto ${moneda}: ${montoUSD.toFixed(2)}`);
    if (montoCLP) {
        logInfo(`  Monto CLP (aprox): ${montoCLP.toLocaleString('es-CL')}`);
    }
    logInfo(`  Días importación: ${diasImportacion || 'No especificado'}`);

    if (INTEGRATION_ENABLED) {
        // TODO: Implementar llamada real a Manager+
        // const response = await axios.post(`${ERP_BASE_URL}/ordenes-compra-importacion`, payload);
        logWarning('[OCI] Integración habilitada pero no implementada');
    } else {
        logWarning('[OCI-MOCK] Integración DESACTIVADA - Orden no enviada a Manager+');
    }

    // Retornar respuesta mock
    return {
        success: true,
        mock: true,
        message: 'Orden de Compra de Importación simulada (integración desactivada)',
        data: {
            codigo: `OCI-MOCK-${Date.now()}`,
            proveedor,
            moneda,
            itemsCount: items.length,
            montoTotal: montoUSD,
            montoCLP: montoCLP,
            timestamp: new Date().toISOString()
        }
    };
}

/**
 * Verifica el estado de la integración
 * @returns {Object} - Estado de la integración
 */
function getIntegrationStatus() {
    return {
        enabled: INTEGRATION_ENABLED,
        message: INTEGRATION_ENABLED
            ? 'Integración con Manager+ habilitada'
            : 'Integración con Manager+ DESACTIVADA - Requiere permisos de escritura en API',
        features: {
            createPurchaseOrder: INTEGRATION_ENABLED,
            createImportOrder: INTEGRATION_ENABLED,
            syncOrders: false
        }
    };
}

module.exports = {
    createPurchaseOrder,
    createImportOrder,
    getIntegrationStatus,
    INTEGRATION_ENABLED
};
