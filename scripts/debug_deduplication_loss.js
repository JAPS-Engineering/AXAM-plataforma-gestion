
require('dotenv').config();
const axios = require('axios');
const { getAuthHeaders } = require('../utils/auth');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;
const FECHA_INICIO = '20260101';
const FECHA_FIN = '20260131';

async function main() {
    console.log("DEBUG: Comprobando FAVEs omitidas por deduplicación en Enero 2026");

    const headers = await getAuthHeaders();
    const url = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/FAVE/V/?df=${FECHA_INICIO}&dt=${FECHA_FIN}&details=1`;

    console.log(`Consultando: ${url}`);
    const response = await axios.get(url, { headers });
    const docs = response.data.data || response.data || [];

    console.log(`Total FAVEs encontradas: ${docs.length}`);

    let skippedCount = 0;
    let skippedAmount = 0;
    const skippedDetails = [];

    docs.forEach(doc => {
        let isRef = false;

        // Logic from salesService.js
        if (doc.referencias && Array.isArray(doc.referencias)) {
            const hasGuideRef = doc.referencias.some(ref =>
                ref.tipo_doc && (ref.tipo_doc.includes('GD') || ref.tipo_doc.includes('GUIA'))
            );
            if (hasGuideRef) isRef = true;
        }

        const glosa = (doc.glosa || doc.glosa_enc || '').toUpperCase();
        if (glosa.includes('GUIA') || glosa.includes('GD') || glosa.includes('DESPACHO')) {
            isRef = true;
        }

        if (isRef) {
            skippedCount++;
            const monto = Math.round(doc.monto_afecto || doc.total || 0);
            skippedAmount += monto;
            skippedDetails.push({ folio: doc.folio, monto, glosa });
        }
    });

    console.log(`\nRESUMEN DE DEDUPLICACIÓN (Lo que se está OMITIENDO en la Sync actual):`);
    console.log(`FAVEs Omitidas: ${skippedCount}`);
    console.log(`Monto Total Omitido: $${skippedAmount.toLocaleString('es-CL')}`);

    console.log("\nTop 10 FAVEs omitidas:");
    skippedDetails.sort((a, b) => b.monto - a.monto).slice(0, 10).forEach(d => {
        console.log(`Folio: ${d.folio} | Monto: $${d.monto.toLocaleString('es-CL')} | Glosa: ${d.glosa}`);
    });

}

main().catch(console.error);
