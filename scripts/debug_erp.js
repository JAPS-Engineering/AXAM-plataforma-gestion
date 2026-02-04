
require('dotenv').config();
const { getPurchaseDocuments } = require('../services/purchaseService');

async function main() {
    const start = new Date(2025, 10, 1);
    const end = new Date(2025, 11, 31);
    console.log('Querying ERP for Nov-Dec 2025 (DIN)...');

    // Pass 'DIN' as the 4th argument (attempt=1, docType='DIN')
    const docs = await getPurchaseDocuments(start, end, 1, 'DIN');
    console.log(`Found ${docs.length} DIN documents.`);

    const skuTarget = 'KC00369U';
    let found = false;

    for (const doc of docs) {
        const details = doc.detalles || doc.detalle || doc.items || [];
        for (const item of details) {
            const code = item.codigo || item.cod_prod || item.codigo_prod || item.cod_art || item.sku;
            if (code && code.includes(skuTarget)) {
                console.log('FOUND IN DOC:', {
                    folio: doc.folio,
                    tipo: doc.tipo_doc || 'FACE?',
                    fecha: doc.fecha_doc,
                    proveedor: doc.razon_social,
                    itemCode: code,
                    itemDesc: item.descripcion || item.desc,
                    qty: item.cantidad,
                    price: item.precio_unitario,
                    moneda: doc.moneda,
                    tipo_cambio: doc.tipo_cambio,
                    total_mn: doc.total_mn, // Total moneda nacional?
                    total_me: doc.total_me, // Total moneda extranjera?
                    item_precio_base: item.precio,
                    item_monto_neto: item.monto_neto
                });
                console.log('FULL DOC:', JSON.stringify(doc, null, 2)); // Print one full doc to see structure
                found = true;
                return; // Stop after first match to avoid spam
            }
        }
    }

    if (!found) {
        console.log(`SKU ${skuTarget} NOT found in any FACE document for Jan 2026.`);
    }
}

main();
