
const axios = require('axios');
require('dotenv').config();
const { getAuthHeaders } = require('../utils/auth');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

async function checkFaveRefs() {
    try {
        const headers = await getAuthHeaders();
        const today = new Date();
        const lastMonth = new Date();
        lastMonth.setDate(lastMonth.getDate() - 60); // Extended range

        const df = lastMonth.toISOString().slice(0, 10).replace(/-/g, '');
        const dt = today.toISOString().slice(0, 10).replace(/-/g, '');

        console.log(`\n--- Buscando referencias en FAVE ---`);
        const url = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/FAVE/V?details=1&df=${df}&dt=${dt}`;

        const response = await axios.get(url, { headers, timeout: 60000 });
        const docs = response.data.data || response.data || [];

        console.log(`Analizando ${docs.length} documentos FAVE...`);

        let foundRef = false;
        for (const doc of docs) {
            // Check for references array
            if (doc.referencias && Array.isArray(doc.referencias) && doc.referencias.length > 0) {
                console.log(`\n📄 FAVE Folio: ${doc.folio}`);
                console.log(`   Referencias encontradas:`, doc.referencias);
                foundRef = true;

                // Show raw structure of a reference
                console.log('   Estructura Ref:', JSON.stringify(doc.referencias[0], null, 2));

                // Break after finding a good example
                if (doc.referencias.some(r => r.tipo_doc && r.tipo_doc.includes('GD'))) {
                    console.log('   ✅ Encontrada referencia a Guía de Despacho!');
                    break;
                }
            } else if (doc.glosa && (doc.glosa.includes('GD') || doc.glosa.includes('Guia'))) {
                // Determine if glosa is used for referencing
                console.log(`\n📄 FAVE Folio (Glosa): ${doc.folio}`);
                console.log(`   Glosa: ${doc.glosa}`);
                foundRef = true;
                break;
            }
        }

        if (!foundRef) {
            console.log('⚠️ No se encontraron referencias a GD en la muestra analizada.');
        }

    } catch (error) {
        console.error(`Error:`, error.message);
    }
}

checkFaveRefs();
