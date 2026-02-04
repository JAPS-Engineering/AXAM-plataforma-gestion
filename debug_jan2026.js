require('dotenv').config();
const { getPurchaseDocuments, extractProductsFromPurchase } = require('./services/purchaseService');
const { format } = require('date-fns');

async function analyzeJanuary() {
    console.log('--- Analyzing Purchases Jan 2026 ---');

    // Rango Enero 2026
    const startDate = new Date(2026, 0, 1);
    const endDate = new Date(2026, 0, 31);
    endDate.setHours(23, 59, 59, 999);

    console.log(`Fetching from ${startDate} to ${endDate}...`);

    try {
        // Obtenemos docs crudos (FACE y DIN)
        // Nota: purchaseService exporta getAllPurchases pero queremos ver los docs crudos
        // para debuggear la extraccion.
        const [faceDocs, dinDocs] = await Promise.all([
            getPurchaseDocuments(startDate, endDate, 1, 'FACE'),
            getPurchaseDocuments(startDate, endDate, 1, 'DIN')
        ]);

        const allDocs = [...faceDocs, ...dinDocs];
        console.log(`Total Documents: ${allDocs.length} (FACE: ${faceDocs.length}, DIN: ${dinDocs.length})`);

        let totalSuma = 0;
        let products = [];

        // Analizar doc por doc
        for (const doc of allDocs) {
            const extracted = extractProductsFromPurchase(doc);

            // Sumar al total
            const docTotal = extracted.reduce((acc, p) => acc + (p.cantidad * p.precioUnitario), 0);
            totalSuma += docTotal;

            // Guardar para ranking
            products.push(...extracted.map(p => ({
                ...p,
                total: p.cantidad * p.precioUnitario,
                moneda: doc.moneda || 'CLP',
                tasa: doc.tasa_cambio
            })));

            // Debuggear documentos gigantes (posible error)
            if (docTotal > 10000000) { // > 10 Millones
                console.log(`[HIGH VALUE DOC] Folio: ${doc.folio || doc.numero} | Tipo: ${doc.tipo_doc || 'FACE'} | Total: ${Math.round(docTotal).toLocaleString()} | Moneda: ${doc.moneda}`);
            }
        }

        console.log(`\nTOTAL CALCULATED (Script): $${Math.round(totalSuma).toLocaleString()}`);

        // Top 10 Productos más caros
        console.log('\n--- TOP 10 Purchased Products (By Total Amount) ---');
        products.sort((a, b) => b.total - a.total);
        products.slice(0, 10).forEach((p, i) => {
            console.log(`#${i + 1} SKU: ${p.sku} | Qty: ${p.cantidad} | Unit Price: $${Math.round(p.precioUnitario).toLocaleString()} | Total: $${Math.round(p.total).toLocaleString()} | Folio: ${p.folio}`);
        });

    } catch (e) {
        console.error(e);
    }
}

analyzeJanuary();
