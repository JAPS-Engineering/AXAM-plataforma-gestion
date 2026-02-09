
require('dotenv').config();
const axios = require('axios');
const { getAuthHeaders } = require('./utils/auth');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

async function test() {
    try {
        console.log("--- TESTING CLIENTS/PROVIDERS API ---");
        const headers = await getAuthHeaders();

        // 1. Fetch Providers
        // Documentation says "Listar clientes/proveedores". 
        // We'll fetch a valid list and check the structure.
        const url = `${ERP_BASE_URL}/clients/${RUT_EMPRESA}/?contacts=1&direcciones=1`;
        console.log(`Fetching: ${url}`);

        const response = await axios.get(url, { headers });
        const data = response.data.data || response.data;

        if (Array.isArray(data)) {
            console.log(`Total records found: ${data.length}`);

            // Filter by type 'P' (Proveedor)
            const providers = data.filter(c => c.tipo_proveedor === 'P' || c.tipo_cliente === 'P');
            // Note: Documentation example says "tipo_proveedor": "P"

            console.log(`Providers found: ${providers.length}`);

            if (providers.length > 0) {
                const sample = providers[0];
                console.log("\nSample Provider Structure:");
                console.log(JSON.stringify(sample, null, 2));

                // Check if there is any field linking to products
                console.log("\nSearching for product links in Provider...");
                const productKeys = Object.keys(sample).filter(k =>
                    k.includes('prod') || k.includes('item') || k.includes('lista')
                );
                console.log("Potential linking keys:", productKeys);
                if (productKeys.length > 0) {
                    productKeys.forEach(k => console.log(`${k}: ${JSON.stringify(sample[k])}`));
                }
            }
        }

    } catch (e) {
        console.error("ERROR:", e.message);
        if (e.response) {
            console.error("Data:", JSON.stringify(e.response.data, null, 2));
        }
    }
}

test();
