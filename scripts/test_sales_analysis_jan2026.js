
/**
 * Test de Análisis de Ventas - Enero 2026
 * 
 * Objetivo:
 * - Consultar FAVE, BOVE, GDVE, NCVE
 * - Separar FAVE en "Con GDVE" y "Sin GDVE"
 * - Agrupar por Vendedor
 * - Comparar con Excel de usuario
 */

require('dotenv').config();
const axios = require('axios');
const { getAuthHeaders } = require('../utils/auth');
const { logSection, logInfo, logError, logSuccess, logWarning } = require('../utils/logger');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

// Configuración Fechas Enero 2026
const FECHA_INICIO = '20260101';
const FECHA_FIN = '20260131';

// Mapeo manual de usuarios a nombres (Basado en la imagen del Excel del usuario)
// Ajustaremos esto dinámicamente si es necesario, pero esto ayuda a la legibilidad
const VENDEDORES_MAP = {
    'ms': 'Monica',
    'anibalcl': 'Anibal',
    'hm': 'Hector',
    'mp': 'Miguel',
    'cas': 'Carlos',
    'sc': 'Sara',
    'cvs': 'Cristián',
    'ventasamurai': 'Shopify', // Asumiendo que ventasamurai es Shopify/Web
    'gerenciacomercial': 'Gerencia Comercial',
    'anibalcobo': 'Francisco', // Verificar si este mapeo es correcto
    'caac': 'Cristobal'
};

function getNombreVendedor(codigo) {
    if (!codigo) return 'Sin Vendedor';
    const cleanCode = codigo.toLowerCase().trim();
    return VENDEDORES_MAP[cleanCode] || codigo; // Retorna el nombre mapeado o el código si no existe
}

async function fetchDocuments(docType, withDetails = false) {
    const headers = await getAuthHeaders();
    // Remove trailing slash after V
    let url = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/${docType}/V?df=${FECHA_INICIO}&dt=${FECHA_FIN}`;
    if (withDetails) {
        url += '&details=1';
    } else {
        if (docType === 'FAVE') url += '&details=1';
    }

    logInfo(`Consultando ${docType} (URL: ${url})...`);
    try {
        const response = await axios.get(url, { headers });
        const docs = response.data.data || response.data || [];
        logSuccess(`  -> ${docs.length} documentos encontrados.`);
        return docs;
    } catch (error) {
        logError(`Error consultando ${docType}: ${error.message}`);
        return [];
    }
}

function hasGDVEReference(doc) {
    // 1. Revisar campo 'referencias' explicito
    if (doc.referencias && Array.isArray(doc.referencias)) {
        return doc.referencias.some(r =>
            (r.tipo_doc && r.tipo_doc.includes('GDVE')) ||
            (r.tipo && r.tipo.includes('GDVE'))
        );
    }

    // 2. Revisar glosa (fallback común)
    if (doc.glosa_enc && (doc.glosa_enc.includes('GD') || doc.glosa_enc.includes('Guia'))) {
        return true;
    }

    return false;
}

function initVendedorStats() {
    return {
        faveSinGdve: 0,
        faveConGdve: 0,
        bove: 0,
        gdve: 0,
        ncve: 0,

        countFaveSin: 0,
        countFaveCon: 0,
        countBove: 0,
        countGdve: 0,
        countNcve: 0
    };
}

async function main() {
    logSection('ANÁLISIS DE VENTAS DETALLADO - ENERO 2026');

    try {
        // 1. Obtener documentos
        const faves = await fetchDocuments('FAVE');
        const boves = await fetchDocuments('BOVE');
        const gdves = await fetchDocuments('GDVE');
        const ncves = await fetchDocuments('NCVE'); // Notas de Crédito restan

        // 2. Procesar Datos
        const report = {};

        // --- Procesar FAVES ---
        faves.forEach(doc => {
            const vendedorRaw = doc.usuario_vendedor || doc.cod_vendedor || 'Desconocido';
            const vendedor = getNombreVendedor(vendedorRaw);

            if (!report[vendedor]) report[vendedor] = initVendedorStats();

            const monto = Math.round(doc.monto_afecto || doc.total || 0); // Asumimos Neto (monto_afecto)

            if (hasGDVEReference(doc)) {
                report[vendedor].faveConGdve += monto;
                report[vendedor].countFaveCon++;
            } else {
                report[vendedor].faveSinGdve += monto;
                report[vendedor].countFaveSin++;

                // DEBUG: Inspect why we might be missing references for Monica
                if (vendedor === 'Monica' && report[vendedor].countFaveSin <= 3) {
                    console.log(`\n[DEBUG] FAVE (Ms) sin GDVE detected: Folio ${doc.folio}`);
                    console.log(`   Referencias: ${JSON.stringify(doc.referencias)}`);
                    console.log(`   Glosa: ${doc.glosa_enc}`);
                    console.log(`   Detalles (sample): ${JSON.stringify(doc.detalles ? doc.detalles.slice(0, 1) : 'No details')}`);
                }
            }
        });

        // --- Procesar BOVEs (Boletas) ---
        boves.forEach(doc => {
            const vendedorRaw = doc.usuario_vendedor || doc.cod_vendedor || 'Desconocido';
            const vendedor = getNombreVendedor(vendedorRaw);

            if (!report[vendedor]) report[vendedor] = initVendedorStats();

            const monto = Math.round(doc.monto_afecto || doc.total || 0);
            report[vendedor].bove += monto;
            report[vendedor].countBove++;
        });

        // --- Procesar GDVEs (Guías Venta) ---
        // Estas suman "Lo que está en Guías" en el Excel
        gdves.forEach(doc => {
            const vendedorRaw = doc.usuario_vendedor || doc.cod_vendedor || 'Desconocido';
            const vendedor = getNombreVendedor(vendedorRaw);

            if (!report[vendedor]) report[vendedor] = initVendedorStats();

            const monto = Math.round(doc.monto_afecto || doc.total || 0);
            report[vendedor].gdve += monto;
            report[vendedor].countGdve++;
        });

        // --- Procesar NCVEs (Notas Crédito) ---
        // Estas restan al total
        ncves.forEach(doc => {
            const vendedorRaw = doc.usuario_vendedor || doc.cod_vendedor || 'Desconocido';
            const vendedor = getNombreVendedor(vendedorRaw);

            if (!report[vendedor]) report[vendedor] = initVendedorStats();

            const monto = Math.round(doc.monto_afecto || doc.total || 0);
            report[vendedor].ncve += monto; // Sumaremos positivo aquí y restaremos al final, o restamos directo.
            // En reportes contables NC se resta.
            report[vendedor].countNcve++;
        });


        // 3. Generar Salida Tabla
        console.log('\n');
        console.log('REPORTE POR VENDEDOR');
        console.log('===================================================================================================================================================');
        console.log(
            'VENDEDOR'.padEnd(20) +
            'FAVE (s/Ref)'.padStart(15) +
            'FAVE (c/Ref)'.padStart(15) +
            'BOLETA'.padStart(12) +
            'NC'.padStart(12) +
            'NETO REAL'.padStart(18) + // (FAVE + BOVE - NC)
            ' | ' +
            'GDVE (Total)'.padStart(15) +
            'TOTAL + GDVE'.padStart(18)
        );
        console.log('---------------------------------------------------------------------------------------------------------------------------------------------------');

        let grandNetoReal = 0;
        let grandTotalWithGdve = 0;

        // Ordenar por total descendente para parecerse al ranking
        const sortedVendors = Object.keys(report).sort((a, b) => {
            const totalA = (report[a].faveSinGdve + report[a].faveConGdve + report[a].bove) - report[a].ncve;
            const totalB = (report[b].faveSinGdve + report[b].faveConGdve + report[b].bove) - report[b].ncve;
            return totalB - totalA;
        });

        sortedVendors.forEach(v => {
            const stats = report[v];

            // Neto Real = (All FAVE + BOVE) - NC
            // User Excel "Suma de Neto por producto" seems to be this.
            const netoReal = (stats.faveSinGdve + stats.faveConGdve + stats.bove) - stats.ncve;

            // Total with GDVE (My previous total, likely incorrect but shown for comparison)
            // Or maybe "Potential Total" if we include all guides?
            const totalWithGdve = netoReal + stats.gdve;

            grandNetoReal += netoReal;
            grandTotalWithGdve += totalWithGdve;

            console.log(
                v.padEnd(20) +
                stats.faveSinGdve.toLocaleString('es-CL').padStart(15) +
                stats.faveConGdve.toLocaleString('es-CL').padStart(15) +
                stats.bove.toLocaleString('es-CL').padStart(12) +
                stats.ncve.toLocaleString('es-CL').padStart(12) +
                netoReal.toLocaleString('es-CL').padStart(18) +
                ' | ' +
                stats.gdve.toLocaleString('es-CL').padStart(15) +
                totalWithGdve.toLocaleString('es-CL').padStart(18)
            );
        });

        console.log('---------------------------------------------------------------------------------------------------------------------------------------------------');
        console.log(
            'TOTAL GENERAL'.padEnd(20) +
            ' '.repeat(15) +
            ' '.repeat(15) +
            ' '.repeat(12) +
            ' '.repeat(12) +
            grandNetoReal.toLocaleString('es-CL').padStart(18) +
            ' | ' +
            ' '.repeat(15) +
            grandTotalWithGdve.toLocaleString('es-CL').padStart(18)
        );
        console.log('===================================================================================================================================================');

    } catch (error) {
        logError(`Error General: ${error.message}`);
        console.error(error);
    }
}

if (require.main === module) {
    main().catch(console.error);
}
