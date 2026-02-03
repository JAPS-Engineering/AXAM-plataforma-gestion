
/**
 * Test de Comparación de Lógicas de Sincronización - Enero 2026
 * 
 * Escenario A (Actual):
 * - FAVE: Se suman SOLO si NO referencian a una Guía (GD o GDVE).
 * - GDVE: Se suman TODAS.
 * - BOVE: Se suman.
 * - NCVE: Se restan.
 * 
 * Escenario B (Propuesto/Excel):
 * - FAVE: Se suman TODAS.
 * - GDVE: NO se suman (o solo pendientes, pero asumimos 0 para igualar "Neto" contable).
 * - BOVE: Se suman.
 * - NCVE: Se restan.
 */

require('dotenv').config();
const axios = require('axios');
const { getAuthHeaders } = require('../utils/auth');
const { logSection, logInfo, logError, logSuccess, logWarning } = require('../utils/logger');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

const FECHA_INICIO = '20260102'; // Changed to Jan 2nd as per user request
const FECHA_FIN = '20260131';

const VENDEDORES_MAP = {
    'ms': 'Monica',
    'anibalcl': 'Anibal',
    'hm': 'Hector',
    'mp': 'Miguel',
    'cas': 'Carlos',
    'sc': 'Sara',
    'cvs': 'Cristián',
    'ventasamurai': 'Shopify',
    'gerenciacomercial': 'Gerencia Comercial',
    'anibalcobo': 'Francisco',
    'caac': 'Cristobal'
};

function getNombreVendedor(codigo) {
    if (!codigo) return 'Sin Vendedor';
    const cleanCode = codigo.toLowerCase().trim();
    return VENDEDORES_MAP[cleanCode] || codigo;
}

async function fetchDocuments(docType) {
    const headers = await getAuthHeaders();
    // Importante: details=1 para FAVE para ver referencias
    let url = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/${docType}/V?df=${FECHA_INICIO}&dt=${FECHA_FIN}`;
    if (docType === 'FAVE' || docType === 'GDVE') url += '&details=1';

    console.log(`📡 Consultando ${docType}...`);
    try {
        const response = await axios.get(url, { headers });
        const docs = response.data.data || response.data || [];
        return docs;
    } catch (error) {
        console.error(`❌ Error consultando ${docType}: ${error.message}`);
        return [];
    }
}

function isRefToGuide(doc) {
    // Lógica robusta de detección usada en previous scripts
    if (doc.referencias && Array.isArray(doc.referencias)) {
        const hasRef = doc.referencias.some(r =>
            (r.tipo_doc && r.tipo_doc.includes('GDVE')) ||
            (r.tipo && r.tipo.includes('GDVE'))
        );
        if (hasRef) return true;
    }
    const glosa = (doc.glosa_enc || doc.glosa || '').toUpperCase();
    if (glosa.includes('GD') || glosa.includes('GUIA')) return true;

    return false;
}

function initStats() {
    return {
        // Totales Brutos
        faveTotal: 0,
        faveUnique: 0, // Sin Ref
        faveRef: 0,    // Con Ref

        bove: 0,
        gdve: 0,
        ncve: 0,

        // Resultados Lógicas
        logicCurrent: 0,  // (FAVE Unique + BOVE + GDVE) - NCVE
        logicProposed: 0  // (FAVE Total + BOVE) - NCVE
    };
}

async function main() {
    logSection('COMPARACIÓN DE LÓGICAS - ENERO 2026');

    // 1. Obtener Data
    const faves = await fetchDocuments('FAVE');
    const boves = await fetchDocuments('BOVE');
    const gdves = await fetchDocuments('GDVE');
    const ncves = await fetchDocuments('NCVE');

    const report = {};

    // 2. Procesar Datos y Agrupar por Vendedor
    const processDoc = (doc, type) => {
        const vendedorRaw = doc.usuario_vendedor || doc.cod_vendedor || 'Desconocido';
        const vendedor = getNombreVendedor(vendedorRaw);
        if (!report[vendedor]) report[vendedor] = initStats();

        const monto = Math.round(doc.monto_afecto || doc.total || 0);

        if (type === 'FAVE') {
            report[vendedor].faveTotal += monto;
            if (isRefToGuide(doc)) {
                report[vendedor].faveRef += monto;
            } else {
                report[vendedor].faveUnique += monto;
            }
        } else if (type === 'BOVE') {
            report[vendedor].bove += monto;
        } else if (type === 'GDVE') {
            report[vendedor].gdve += monto;
        } else if (type === 'NCVE') {
            report[vendedor].ncve += monto;
        }
    };

    faves.forEach(d => processDoc(d, 'FAVE'));
    boves.forEach(d => processDoc(d, 'BOVE'));
    gdves.forEach(d => processDoc(d, 'GDVE'));
    ncves.forEach(d => processDoc(d, 'NCVE'));

    // 3. Calcular Resultados Finales por Vendedor
    Object.keys(report).forEach(v => {
        const r = report[v];

        // A) Lógica Actual: (FAVE que no son ref + BOVE + Todas las GDVE) - NC
        r.logicCurrent = (r.faveUnique + r.bove + r.gdve) - r.ncve;

        // B) Lógica Propuesta: (Todas las FAVE + BOVE) - NC
        // IGNORA GDVEs (asume que si se facturaron están en FAVE, si no, quedan fuera del "Neto Facturado")
        r.logicProposed = (r.faveTotal + r.bove) - r.ncve;
    });

    // 4. Mostrar Tabla Comparativa
    console.log('\n');
    console.log('COMPARATIVA POR VENDEDOR (Montos en CLP)');
    console.log('===========================================================================================================');
    console.log(
        'VENDEDOR'.padEnd(20) +
        'ACTUAL (Dedup)'.padStart(18) +
        'PROPUESTA (Direct)'.padStart(18) +
        'DIFERENCIA'.padStart(15) +
        ' | ' +
        'FAVE Ref (Omitidas A)'.padStart(22) +
        'GDVE (Sumadas A)'.padStart(18)
    );
    console.log('-----------------------------------------------------------------------------------------------------------');

    let totalCurrent = 0;
    let totalProposed = 0;

    // Ordenar por diferencia para ver impacto
    const sortedVendors = Object.keys(report).sort((a, b) => report[b].logicProposed - report[a].logicProposed);

    sortedVendors.forEach(v => {
        const r = report[v];
        const diff = r.logicProposed - r.logicCurrent;

        totalCurrent += r.logicCurrent;
        totalProposed += r.logicProposed;

        console.log(
            v.padEnd(20) +
            r.logicCurrent.toLocaleString('es-CL').padStart(18) +
            r.logicProposed.toLocaleString('es-CL').padStart(18) +
            diff.toLocaleString('es-CL').padStart(15) +
            ' | ' +
            r.faveRef.toLocaleString('es-CL').padStart(22) +
            r.gdve.toLocaleString('es-CL').padStart(18)
        );
    });

    console.log('-----------------------------------------------------------------------------------------------------------');
    console.log(
        'TOTAL GENERAL'.padEnd(20) +
        totalCurrent.toLocaleString('es-CL').padStart(18) +
        totalProposed.toLocaleString('es-CL').padStart(18) +
        (totalProposed - totalCurrent).toLocaleString('es-CL').padStart(15)
    );
    console.log('===========================================================================================================');

    console.log('\n');
    console.log('DETALLE POR TIPO DE DOCUMENTO (Montos Brutos en CLP)');
    console.log('====================================================================================================================================================');
    console.log(
        'VENDEDOR'.padEnd(20) +
        'Total Venta (Sis)'.padStart(18) +
        'FAVE (Total)'.padStart(18) +
        'FAVE (s/Ref)'.padStart(18) +
        'GDVE (Total)'.padStart(20) +
        'NCVE (Total)'.padStart(18) +
        'BOVE (Total)'.padStart(18)
    );
    console.log('----------------------------------------------------------------------------------------------------------------------------------------------------');

    sortedVendors.forEach(v => {
        const r = report[v];
        console.log(
            v.padEnd(20) +
            r.logicCurrent.toLocaleString('es-CL').padStart(18) +
            r.faveTotal.toLocaleString('es-CL').padStart(18) +
            r.faveUnique.toLocaleString('es-CL').padStart(18) +
            r.gdve.toLocaleString('es-CL').padStart(20) +
            r.ncve.toLocaleString('es-CL').padStart(18) +
            r.bove.toLocaleString('es-CL').padStart(18)
        );
    });
    console.log('====================================================================================================================================================');


    console.log('\nRESUMEN GLOBAL DE DOCUMENTOS:');
    const totalFave = faves.reduce((a, b) => a + (b.monto_afecto || b.total || 0), 0);
    const totalGdve = gdves.reduce((a, b) => a + (b.monto_afecto || b.total || 0), 0);
    const totalNcve = ncves.reduce((a, b) => a + (b.monto_afecto || b.total || 0), 0);

    console.log(`  Total FAVE: $${Math.round(totalFave).toLocaleString('es-CL')}`);
    console.log(`  Total GDVE: $${Math.round(totalGdve).toLocaleString('es-CL')}`);
    console.log(`  Total NCVE: $${Math.round(totalNcve).toLocaleString('es-CL')}`);
}

main().catch(console.error);
