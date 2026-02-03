
/**
 * Debug: Match GDVEs to FAVEs by Amount (Heuristic Check) for Miguel
 * 
 * Context: Miguel has $9.8M in Guides but only $1.6M linked to Faves.
 * Goal: Check if the "Unlinked" Guides match "Unlinked" Faves by Amount.
 * If they match, we can improve Deduplication by adding an "Amount Match" strategy.
 */

require('dotenv').config();
const axios = require('axios');
const { getAuthHeaders } = require('../utils/auth');
const { logSection, logInfo, logError, logSuccess } = require('../utils/logger');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;
const VENDEDOR_CODE = 'mp'; // Miguel
const FECHA_INICIO = '20260101';
const FECHA_FIN = '20260131';

async function fetchDocs(type) {
    const headers = await getAuthHeaders();
    // Fetch details to ensure we are seeing everything
    const url = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/${type}/V?df=${FECHA_INICIO}&dt=${FECHA_FIN}&details=1`;
    const res = await axios.get(url, { headers });
    const all = res.data.data || [];

    // Filter for Miguel
    return all.filter(d => {
        const v = (d.usuario_vendedor || d.cod_vendedor || '').toLowerCase().trim();
        return v === VENDEDOR_CODE || v === 'miguel';
    });
}

function hasRef(doc) {
    if (doc.referencias && doc.referencias.some(r => r.tipo_doc && r.tipo_doc.includes('GD'))) return true;
    const glosa = (doc.glosa_enc || doc.glosa || '').toUpperCase();
    return glosa.includes('GUIA') || glosa.includes('GD');
}

async function main() {
    logSection('INVESTIGACIÓN DE MATCHING POR MONTO (MIGUEL)');

    const faves = await fetchDocs('FAVE');
    const gdves = await fetchDocs('GDVE');

    console.log(`Total FAVES Miguel: ${faves.length}`);
    console.log(`Total GDVES Miguel: ${gdves.length}`);

    // separa FAVES con y sin ref detectada
    const favesLinked = faves.filter(hasRef);
    const favesUnlinked = faves.filter(f => !hasRef(f));

    console.log(`FAVES Linkeadas (System): ${favesLinked.length} ($${Math.round(favesLinked.reduce((a, b) => a + (b.monto_afecto || 0), 0) / 1e6)}M)`);
    console.log(`FAVES Huerfanas (System): ${favesUnlinked.length} ($${Math.round(favesUnlinked.reduce((a, b) => a + (b.monto_afecto || 0), 0) / 1e6)}M)`);

    // Intentar match por monto
    let matchesFound = 0;
    let amountMatched = 0;

    const unlinkedFavesMap = new Map(); // Monto -> [Folios]
    favesUnlinked.forEach(f => {
        const m = Math.round(f.monto_afecto || f.total);
        if (!unlinkedFavesMap.has(m)) unlinkedFavesMap.set(m, []);
        unlinkedFavesMap.get(m).push(f.folio);
    });

    console.log('\n--- Buscando Coincidencias x Monto Exacto ---');

    gdves.forEach(gd => {
        const m = Math.round(gd.monto_afecto || gd.total);
        if (unlinkedFavesMap.has(m)) {
            const candidates = unlinkedFavesMap.get(m);
            if (candidates.length > 0) {
                // Match Found!
                const matchFolio = candidates.shift(); // Take one
                matchesFound++;
                amountMatched += m;
                // console.log(`  ✅ GDVE ${gd.folio} ($${m}) matches FAVE ${matchFolio}`);
            }
        }
    });

    console.log('\nRESULTADOS HEURISTICA:');
    console.log(`GDVES que coinciden exactamente en monto con una FAVE sin referencia: ${matchesFound}`);
    console.log(`Monto recuperable por matching de monto: $${Math.round(amountMatched).toLocaleString('es-CL')}`);

    const gdveTotal = gdves.reduce((a, b) => a + (b.monto_afecto || 0), 0);
    const pctRecovered = (amountMatched / gdveTotal) * 100;

    console.log(`Este metodo explicaria el ${pctRecovered.toFixed(1)}% de las Guias.`);
}

main().catch(console.error);
