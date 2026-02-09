
require('dotenv').config();
const axios = require('axios');
const { getAuthHeaders } = require('./utils/auth');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

async function test() {
    try {
        console.log("Fetching product BI001...");
        const headers = await getAuthHeaders();
        const url = `${ERP_BASE_URL}/products/${RUT_EMPRESA}/BI001/`;

        console.log(`URL: ${url}`);
        const response = await axios.get(url, { headers });
        const productData = response.data.data || response.data;

        // Manejar respuesta
        let result = productData;
        if (Array.isArray(productData)) {
            result = productData[0];
        }

        if (result) {
            console.log("\n--- PRODUCTO ENCONTRADO ---");
            console.log("SKU:", result.codigo_prod || result.cod_producto);

            console.log("\n--- BUSQUEDA DE PROVEEDOR ---");
            // Imprimir todas las claves para ver si hay algo oculto
            const keys = Object.keys(result);
            console.log("Total claves:", keys.length);

            const relevantFields = keys.filter(k =>
                k.toLowerCase().includes('prov') ||
                k.toLowerCase().includes('rut') ||
                k.toLowerCase().includes('cod') ||
                k.toLowerCase().includes('cta') ||
                k.toLowerCase().includes('texto') ||
                k.toLowerCase().includes('carac') ||
                k.toLowerCase().includes('concep')
            );

            relevantFields.sort().forEach(f => {
                const val = result[f];
                if (val !== null && val !== "" && val !== "N" && val !== 0) {
                    console.log(`${f}: ${val}`);
                }
            });

        } else {
            console.log("Product not found");
        }

    } catch (e) {
        console.error("ERROR:", e.message);
        if (e.response) {
            console.error("Status:", e.response.status);
            console.error("Data:", JSON.stringify(e.response.data, null, 2));
        }
    }
}

test();
