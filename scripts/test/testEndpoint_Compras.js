/**
 * Script de prueba para verificar FACTURAS DE COMPRA (FACE)
 * Objetivo: Analizar estructura para Dashboard de Compras y Costos.
 */

require('dotenv').config();
const axios = require('axios');
const { format, startOfMonth, endOfMonth, subMonths } = require('date-fns');
const { getAuthHeaders } = require('../../utils/auth');
const { logSection, logInfo, logError, logSuccess, logWarning } = require('../../utils/logger');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

async function main() {
    logSection('TEST FACTURAS DE COMPRA (FACE)');

    try {
        const headers = await getAuthHeaders();

        // Consultar últimos 2 meses para asegurar datos
        const now = new Date();
        const start = subMonths(now, 2);
        const df = format(start, 'yyyyMMdd');
        const dt = format(now, 'yyyyMMdd');

        // TIPO: FACE (Factura Compra Electrónica) 
        // Endpoint: /documents/{rut}/FACE/C/?df=...&dt=... (C = Compra)
        const tipoDoc = 'FACE';
        const url = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/${tipoDoc}/C/?df=${df}&dt=${dt}&details=1`;

        logInfo(`Consultando ${tipoDoc} (Compras) desde ${df} hasta ${dt}...`);

        const response = await axios.get(url, { headers });
        const data = response.data.data || response.data || [];

        if (!Array.isArray(data)) {
            logError("La respuesta no es un array.");
            return;
        }

        logSuccess(`✅ Se obtuvieron ${data.length} documentos ${tipoDoc}.`);

        if (data.length > 0) {
            // Analizar el primero con detalles
            const doc = data[0]; // O buscar uno con detalles si el primero no tiene

            logSection('ESTRUCTURA DOCUMENTO COMPRA (Ejemplo)');
            console.log(JSON.stringify(doc, null, 2));

            logSection('ANÁLISIS DE DATOS PARA DASHBOARD');

            // 1. Proveedor
            const rutProv = doc.rut_cliente || doc.rut_proveedor; // A veces en compras se usa rut_cliente como la contraparte
            const nombreProv = doc.razon_social || doc.nombre_cliente || doc.cliente_proveedor;

            if (rutProv) logSuccess(`✅ Proveedor Detectado: ${nombreProv} (${rutProv})`);
            else logWarning(`⚠️  No se ve claro el RUT Proveedor en: rut_cliente/rut_proveedor`);

            // 2. Fecha
            if (doc.fecha_doc) logSuccess(`✅ Fecha Documento: ${doc.fecha_doc}`);
            else logWarning(`⚠️  Falta fecha_doc`);

            // 3. Detalles / Costos
            const items = doc.detalles || doc.items || doc.productos || [];
            if (items.length > 0) {
                logSuccess(`✅ Tiene detalles: ${items.length} items.`);
                const item = items[0];
                console.log('   Ejemplo Item:', JSON.stringify(item, null, 2));

                if (item.precio_unitario !== undefined) {
                    logSuccess(`   💰 Precio Unitario (Costo): ${item.precio_unitario}`);
                } else {
                    logWarning(`   ⚠️  No se ve 'precio_unitario' en el detalle.`);
                }

                if (item.codigo) {
                    logSuccess(`   📦 SKU Producto: ${item.codigo}`);
                }
            } else {
                logWarning('⚠️  Documento sin detalles (¿Falta details=1?).');
            }

        } else {
            logWarning("⚠️  No hay documentos de compra en este rango.");
        }

    } catch (error) {
        const msg = (error.response && error.response.data && error.response.data.message) || error.message;
        logError(`Error: ${msg}`);
        if (error.response?.status === 404) {
            logWarning("Nota: 404 puede significar que no hay documentos, o que la URL es incorrecta (¿FACE/C? ¿FACE/V?)");
        }
    }
}

if (require.main === module) {
    main().catch(console.error);
}
