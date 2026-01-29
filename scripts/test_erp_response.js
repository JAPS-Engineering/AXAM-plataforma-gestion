
const axios = require('axios');
require('dotenv').config();
const { getAuthHeaders } = require('../utils/auth');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

async function testDocType(docType) {
    try {
        const headers = await getAuthHeaders();
        const today = new Date();
        const lastMonth = new Date();
        lastMonth.setDate(lastMonth.getDate() - 30); // Look back 30 days to ensure we find docs

        const df = lastMonth.toISOString().slice(0, 10).replace(/-/g, '');
        const dt = today.toISOString().slice(0, 10).replace(/-/g, '');

        console.log(`\n--- Probando tipo de documento: ${docType} ---`);
        const url = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/${docType}/V?details=1&df=${df}&dt=${dt}`;
        console.log(`URL: ${url}`);

        const response = await axios.get(url, { headers, timeout: 60000 });
        const docs = response.data.data || response.data || [];

        console.log(`Encontrados: ${docs.length} documentos`);

        if (docs.length > 0) {
            const doc = docs[0];
            console.log('Estructura del primer documento (claves):', Object.keys(doc));

            // Print potential vendor fields
            const vendorFields = Object.keys(doc).filter(k => k.toLowerCase().includes('vend') || k.toLowerCase().includes('user'));
            console.log('Campos posibles de vendedor:', vendorFields);
            vendorFields.forEach(f => console.log(`  ${f}: ${doc[f]}`));

            console.log('Ejemplo completo (primeros niveles):');
            console.log(JSON.stringify(doc, null, 2));
        } else {
            console.log('No se encontraron documentos en este rango.');
        }

    } catch (error) {
        console.error(`Error probando ${docType}:`, error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        }
    }
}

async function main() {
    await testDocType('FAVE'); // Factura
    await testDocType('GDES'); // Guia de Despacho (common code)
    await testDocType('GD');   // Guia de Despacho (alternative)
}

main();
