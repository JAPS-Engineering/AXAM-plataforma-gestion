
const axios = require('axios');
require('dotenv').config();
const { getAuthHeaders } = require('../utils/auth');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

async function testSpecificFave() {
    try {
        const headers = await getAuthHeaders();
        // Fecha 30/01/2026
        const df = '20260130';
        const dt = '20260130';

        console.log(`Buscando FAVE 129717 del 30/01/2026...`);
        // Usamos details=1 porque eso hace el script principal
        const url = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/FAVE/V?details=1&df=${df}&dt=${dt}`;

        const response = await axios.get(url, { headers });
        const docs = response.data.data || response.data || [];

        const targetDoc = docs.find(d => d.folio && d.folio.toString() === '129717');

        if (targetDoc) {
            console.log('✅ FAVE 129717 Encontrada:');
            console.log(JSON.stringify(targetDoc, null, 2));

            // Check keys specifically
            console.log('\n--- Análisis de Campos ---');
            console.log('Tiene "referencias"?', !!targetDoc.referencias);
            console.log('Tiene "glosa"?', targetDoc.glosa);
            console.log('Tiene "glosa_enc"?', targetDoc.glosa_enc);

            // Check if there is anything looking like GDVE
            const str = JSON.stringify(targetDoc);
            if (str.includes('GDVE') || str.includes('18174')) {
                console.log('\n✅ "GDVE" o "18174" encontrado en el raw JSON.');
            } else {
                console.log('\n❌ "GDVE" o "18174" NO encontrado en el raw JSON.');
            }

        } else {
            console.log('❌ FAVE 129717 no encontrada en esa fecha.');
            console.log('Folios encontrados:', docs.map(d => d.folio).join(', '));
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

testSpecificFave();
