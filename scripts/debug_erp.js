
require('dotenv').config();
const { getPurchaseDocuments } = require('../services/purchaseService');

async function main() {
    const start = new Date(2025, 10, 1); // Nov 2025
    const end = new Date(2026, 1, 3);   // Feb 2026
    const skuTarget = 'KC24771U';
    const descTarget = 'Scott Airflex';
    console.log(`Querying ERP for ${descTarget} / ${skuTarget} (FACE) Nov 2025 - Feb 2026...`);

    const docs = await getPurchaseDocuments(start, end, 1, 'FACE');
    console.log(`Found ${docs.length} FACE documents.`);

    let found = false;

    for (const doc of docs) {
        const details = doc.detalles || doc.detalle || doc.items || [];
        for (const item of details) {
            const code = (item.codigo || item.cod_prod || item.codigo_prod || item.cod_art || item.sku || "").toLowerCase();
            const desc = (item.descripcion || item.desc || "").toLowerCase();
            if (code.includes(skuTarget.toLowerCase()) || desc.includes(descTarget.toLowerCase())) {
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
