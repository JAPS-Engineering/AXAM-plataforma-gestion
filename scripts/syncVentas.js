/**
 * Script para sincronizar ventas (FAVE + GDVE)
 * 
 * LÓGICA DE NEGOCIO (Verified 2026-01-26):
 * 1. FAVE (Facturas): Se procesan, pero se EXCLUYEN si la glosa indica "guia" o "gdve" (para evitar duplicidad).
 * 2. GDVE (Guías Despacho): Se procesan TODAS (Unbilled Sales).
 * 3. Total Ventas = (FAVEs Filtradas) + (Todas las GDVEs).
 * 4. Filtro Productos: Solo se guardan ventas de productos que existan en la BD (que ya fue filtrada por Lista 652).
 */

require('dotenv').config();
const { format, startOfMonth, endOfMonth, getYear, getMonth, endOfDay, subYears, isValid, addMonths, isAfter } = require('date-fns');
const { getDatabase, closeDatabase } = require('../utils/database');
const { logSection, logSuccess, logError, logWarning, logInfo } = require('../utils/logger');
// Usamos getAllDocuments para traer FAVE y GDVE
const { getAllDocuments, getDocumentDetails } = require('../services/faveService');
const { extractProductosFromFAVE } = require('../services/productExtractor');
const { saveVentasMensuales } = require('../services/ventaService');

// Fecha de inicio: 1 de enero de 2024 (Extendemos historial a 2 años por seguridad, usuario pidió 2025 pero plan dice 4 años)
// Ajustamos a 2025 para pruebas rápidas, o lo que pida el usuario. El script original decía 2025.
const FECHA_INICIO = new Date(2025, 0, 1);

/**
 * Normaliza claves de fecha para agrupación
 */
function getMonthKey(date) {
    return `${getYear(date)}-${String(getMonth(date) + 1).padStart(2, '0')}`;
}

/**
 * Verifica si una FAVE debe ser excluida porque viene de una Guía
 */
function shouldExcludeFAVE(fave) {
    const terminosExclusion = ['guia', 'gdve', 'asoc a guia'];

    // Revisar Glosa Encabezado
    const glosa = (fave.glosa_enc || fave.glosa || '').toLowerCase();

    // Revisar Referencias (si existen en el futuro)
    const referencias = fave.referencias || [];
    const refString = JSON.stringify(referencias).toLowerCase();

    for (const termino of terminosExclusion) {
        if (glosa.includes(termino) || refString.includes(termino)) {
            return true; // Excluir
        }
    }
    return false;
}

/**
 * Procesar un lote de documentos y acumular ventas por producto
 */
async function processDocumentBatch(docs, tipoDoc) {
    const ventasPorProducto = {}; // "SKU|Vendedor" -> { cantidad, montoNeto }
    let procesados = 0;
    let excluidos = 0;
    let conVentas = 0;
    let errores = 0;

    // Procesamos en serie o lotes pequeños para no saturar
    // Para simplificar lógica y depuración, lo hacemos secuencial con promesas
    // pero agrupado por detalles para no llamar a API detalles si ya vienen.
    // NOTA: El endpoint /documents/.../V/?details=1 ya trae detalles?
    // En el test script usamos details=1 y venían.
    // Asumiremos que 'docs' ya trae detalles si getAllDocuments lo pide (lo agregaremos).
    // Si getAllDocuments NO trae details=1, tendremos que pedirlos.
    // Revisión: getDocuments usa /documents/{...}/V/?df=...&dt=...
    // NO TIENE details=1 por defecto en faveService actual.
    // MODIFICARÉ la llamada aquí para iterar y pedir detalles si faltan.

    for (const doc of docs) {
        try {
            // Con details=1, los productos vienen en doc.detalles o doc.detalle (depende del ERP)
            // Normalizar detalles para extractProductosFromFAVE
            if (!doc.detalles && doc.detalle) doc.detalles = doc.detalle;

            // Validación rápida de exclusión para FAVE antes de procesar productos
            if (tipoDoc === 'FAVE' && shouldExcludeFAVE(doc)) {
                excluidos++;
                continue;
            }

            const productosExtraidos = extractProductosFromFAVE(doc);
            const vendedor = (doc.vendedor || doc.nom_vendedor || doc.vendedor_nombre || 'Sin Vendedor').toString().trim();

            if (productosExtraidos.length > 0) {
                conVentas++;
                productosExtraidos.forEach(p => {
                    const key = `${p.sku}|${vendedor}`;
                    if (!ventasPorProducto[key]) {
                        ventasPorProducto[key] = { cantidad: 0, montoNeto: 0 };
                    }
                    ventasPorProducto[key].cantidad += p.cantidad;
                    ventasPorProducto[key].montoNeto += p.montoNeto;
                });
            }

            procesados++;
            // Loguear progreso cada 100 docs
            if (procesados % 100 === 0) logInfo(`    ... ${procesados} documentos procesados`);

        } catch (e) {
            errores++;
        }
    }
    return { ventasPorProducto, stats: { procesados, excluidos, conVentas, errores } };
}


/**
 * Sincronizar Mes Específico
 */
async function syncMonth(db, dateDate) {
    const year = getYear(dateDate);
    const month = getMonth(dateDate) + 1;
    const start = startOfMonth(dateDate);
    const end = endOfMonth(dateDate);

    logSection(`📅 PROCESANDO MES ${month}/${year}`);

    // 1. Obtener documentos CON DETALLES (Optimización Clave)
    const includeDetails = true;
    const faves = await getAllDocuments('FAVE', start, end, includeDetails) || [];
    const gdves = await getAllDocuments('GDVE', start, end, includeDetails) || [];

    logInfo(`  📄 Documentos encontrados: ${faves.length} FAVEs, ${gdves.length} GDVEs`);

    // 2. Procesar FAVEs
    logInfo('  🔄 Procesando FAVEs (filtrando glosas)...');
    const favesResult = await processDocumentBatch(faves, 'FAVE');
    logInfo(`     ✅ FAVEs: ${favesResult.stats.procesados} proc, ${favesResult.stats.excluidos} excluidas (Guía), ${favesResult.stats.errores} errores.`);

    // 3. Procesar GDVEs
    logInfo('  🔄 Procesando GDVEs (sumando todas)...');
    const gdvesResult = await processDocumentBatch(gdves, 'GDVE');
    logInfo(`     ✅ GDVEs: ${gdvesResult.stats.procesados} proc, ${gdvesResult.stats.errores} errores.`);

    // 4. Unificar Ventas
    const totalVentas = {};
    const merge = (source) => {
        for (const [key, data] of Object.entries(source)) {
            if (!totalVentas[key]) totalVentas[key] = { cantidad: 0, montoNeto: 0 };
            totalVentas[key].cantidad += data.cantidad;
            totalVentas[key].montoNeto += data.montoNeto;
        }
    };

    merge(favesResult.ventasPorProducto);
    merge(gdvesResult.ventasPorProducto);

    // 5. Guardar (El servicio saveVentasMensuales filtra por lo que hay en DB)
    const skuCount = Object.keys(totalVentas).length;
    if (skuCount > 0) {
        logInfo(`  💾 Guardando ventas de ${skuCount} productos acumulados...`);
        const saveResult = saveVentasMensuales(db, totalVentas, year, month);
        logSuccess(`  ✅ Mes ${month}/${year} completado. Guardados: ${saveResult.guardadas}, Ignorados (No en DB): ${saveResult.noEncontrados}`);
    } else {
        logWarning(`  ⚠️ Mes ${month}/${year} sin ventas válidas.`);
    }
}

async function main() {
    logSection('🔄 INICIANDO SINCRONIZACIÓN DE VENTAS (FAVE + GDVE)');
    const db = getDatabase();

    try {
        let currentDate = FECHA_INICIO;
        const now = new Date();

        while (!isAfter(startOfMonth(currentDate), startOfMonth(now))) {
            await syncMonth(db, currentDate);
            currentDate = addMonths(currentDate, 1);
        }

        logSuccess('\n🏁 Sincronización Completa Exitosamente.');

    } catch (error) {
        logError(`Error Global: ${error.message}`);
    } finally {
        closeDatabase();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { main };
