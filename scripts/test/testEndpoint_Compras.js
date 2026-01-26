/**
 * Script de prueba para verificar acceso a FACTURAS DE COMPRA (FACE)
 * Objetivo: Obtener historial de compras y Costo de Última Compra.
 */

require('dotenv').config();
const axios = require('axios');
const { format } = require('date-fns');
const { getAuthHeaders } = require('../../utils/auth');
const { logSection, logInfo, logError, logSuccess, logWarning } = require('../../utils/logger');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

async function main() {
    logSection('TEST DOCUMENTOS DE COMPRA (FACE)');

    try {
        const headers = await getAuthHeaders();
        const fechaHoy = new Date();
        const fechaInicio = new Date(fechaHoy);
        fechaInicio.setDate(fechaInicio.getDate() - 60); // Últimos 60 días para asegurar encontrar algo

        const df = format(fechaInicio, 'yyyyMMdd');
        const dt = format(fechaHoy, 'yyyyMMdd');

        // Tipo: FACE (Factura Compra Electrónica)
        // Nota: A veces las compras están en /documents/C/FACE o simplemente /documents/.../FACE/C (Compras)
        // En ventas era /documents/.../FAVE/V (Ventas). Probaremos sufijo /C

        const tipos = ['FACE'];
        const suffixes = ['/C', '/V', '']; // Probamos variantes por si acaso

        for (const tipo of tipos) {
            for (const suffix of suffixes) {
                const url = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/${tipo}${suffix}/?df=${df}&dt=${dt}`;
                logInfo(`\nProbando URL: ${url}`);

                try {
                    const response = await axios.get(url, { headers });
                    const docs = response.data.data || response.data || [];

                    if (Array.isArray(docs) && docs.length > 0) {
                        logSuccess(`✅ EXITOSO: Se encontraron ${docs.length} documentos ${tipo} en ${suffix}`);
                        const sample = docs[0];
                        console.log('Ejemplo Header:', JSON.stringify(sample, null, 2));

                        // Verificamos si podemos sacar detalle para ver PRECIOS
                        if (sample.details === 1 || sample.detalles || sample.items) {
                            // Ya viene con detalle?
                            console.log('  Tiene detalles embebidos.');
                        } else {
                            // Intentamos buscar detalle individual
                            const docNum = sample.docnumreg || sample.id;
                            logInfo(`  Consultando detalle para doc # ${docNum}...`);
                            const detailUrl = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/${tipo}${suffix}/?docnumreg=${docNum}&details=1`;
                            try {
                                const detResp = await axios.get(detailUrl, { headers });
                                const detData = detResp.data.data || detResp.data;
                                const item = Array.isArray(detData) ? detData[0] : detData;

                                if (item && (item.detalles || item.items)) {
                                    const lines = item.detalles || item.items;
                                    logSuccess(`  ✅ Detalle obtenido. ${lines.length} items.`);
                                    console.log('  Primer Item:', JSON.stringify(lines[0], null, 2));

                                    // Validar campos de costo
                                    const first = lines[0];
                                    if (first.precio || first.monto || first.valor) {
                                        logSuccess(`  ✅ Precio/Costo encontrado en detalle.`);
                                    }
                                }
                            } catch (e) {
                                logWarning(`  ⚠️ Error al traer detalle: ${e.message}`);
                            }
                        }
                        return; // Terminamos si encontramos uno válido
                    } else {
                        logInfo(`  ℹ️  Sin resultados (o formato vacío)`);
                    }
                } catch (error) {
                    if (error.response?.status !== 404) {
                        // logWarning(`  ❌ Error ${error.response?.status}`);
                    }
                }
            }
        }

        logWarning("⚠️  No se encontraron documentos FACE en ninguna variante probada.");

    } catch (error) {
        logError(`Error fatal: ${error.message}`);
    }
}

if (require.main === module) {
    main().catch(console.error);
}
