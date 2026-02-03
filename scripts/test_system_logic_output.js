
/**
 * Test de Verificación - Lógica SISTEMA (Deduplicación)
 * 
 * Objetivo:
 * Confirmar que salesService.js (revertido por usuario) ahora implementa la lógica:
 * (FAVE - Refs) + BOVE + GDVE - NCVE
 * 
 * Resultado esperado:
 * Totales cercanos a 388M (no 378M como el Excel).
 */

require('dotenv').config();
const { getMonthlySales } = require('../services/salesService');
const { logSection, logInfo, logSuccess, logError } = require('../utils/logger');

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

async function main() {
    logSection('VERIFICACIÓN FINAL - LÓGICA "SISTEMA" (DEDUPLICACIÓN)');

    const year = 2026;
    const month = 1;

    try {
        console.log(`Consultando data para ${month}/${year} usando salesService ACTUAL...`);
        const result = await getMonthlySales(year, month);

        const salesBySeller = {};
        let totalNetoGlobal = 0;

        result.sales.forEach((data, key) => {
            const vendedor = getNombreVendedor(data.vendedor);
            if (!salesBySeller[vendedor]) salesBySeller[vendedor] = 0;

            salesBySeller[vendedor] += data.montoNeto;
            totalNetoGlobal += data.montoNeto;
        });

        console.log('\nRESULTADOS POR VENDEDOR (Lógica Sistema)');
        console.log('=============================================================');
        console.log('VENDEDOR'.padEnd(25) + 'TOTAL NETO (CLP)'.padStart(20));
        console.log('-------------------------------------------------------------');

        const sorted = Object.entries(salesBySeller).sort((a, b) => b[1] - a[1]);

        sorted.forEach(([vendedor, total]) => {
            console.log(vendedor.padEnd(25) + Math.round(total).toLocaleString('es-CL').padStart(20));
        });

        console.log('-------------------------------------------------------------');
        console.log('TOTAL GENERAL'.padEnd(25) + Math.round(totalNetoGlobal).toLocaleString('es-CL').padStart(20));
        console.log('=============================================================');

        console.log('\nVerificación de integridad:');
        console.log(`Total documentos procesados: ${result.documentsCount} (Deben incluir GDVE)`);

    } catch (error) {
        logError(`Error en verificación: ${error.message}`);
    }
}

main().catch(console.error);
