
const axios = require('axios');
const fs = require('fs');
require('dotenv').config();
const { getAuthHeaders } = require('../utils/auth');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

async function testDocType(docType) {
    try {
        const headers = await getAuthHeaders();
        const today = new Date();
        const lastMonth = new Date();
        lastMonth.setDate(lastMonth.getDate() - 30);

        const df = lastMonth.toISOString().slice(0, 10).replace(/-/g, '');
        const dt = today.toISOString().slice(0, 10).replace(/-/g, '');

        console.log(`\n--- Probando: ${docType} ---`);
        const url = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/${docType}/V?details=1&df=${df}&dt=${dt}`;

        const response = await axios.get(url, { headers, timeout: 60000 });
        const docs = response.data.data || response.data || [];

        if (docs.length > 0) {
            console.log(`✅ ${docType}: Encontrados ${docs.length}`);
            const doc = docs[0];

            // Search for vendor related fields
            const allKeys = Object.keys(doc);
            const vendorKeys = allKeys.filter(k => k.toLowerCase().includes('vend') || k.toLowerCase().includes('user') || k.toLowerCase().includes('vendedor'));

            console.log(`🔍 Campos de Vendedor en ${docType}:`);
            if (vendorKeys.length > 0) {
                vendorKeys.forEach(k => console.log(`   ${k}: "${doc[k]}"`));
            } else {
                console.log("   ⚠️ No se encontraron campos con 'vend' o 'user'");
            }

            // Also check details for vendor
            if (doc.detalles && doc.detalles.length > 0) {
                const detail = doc.detalles[0];
                const detailKeys = Object.keys(detail).filter(k => k.toLowerCase().includes('vend'));
                if (detailKeys.length > 0) {
                    console.log(`🔍 Campos de Vendedor en DETALLES de ${docType}:`);
                    detailKeys.forEach(k => console.log(`   ${k}: "${detail[k]}"`));
                }
            }

        } else {
            console.log(`⚠️ ${docType}: Sin documentos en el rango.`);
        }

    } catch (error) {
        // console.error(`❌ Error ${docType}:`, error.message);
        if (error.response && error.response.status === 400) {
            console.log(`❌ ${docType}: No existe o error 400.`);
        } else {
            console.log(`❌ ${docType}: Error ${error.message}`);
        }
    }
}

async function main() {
    await testDocType('FAVE');
    // Check specific Dispatch Guide type mentioned by user
    await testDocType('GDVE');
}

main();
