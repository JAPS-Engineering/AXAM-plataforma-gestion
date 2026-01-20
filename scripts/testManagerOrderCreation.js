require('dotenv').config();
const axios = require('axios');
const { getAuthHeaders } = require('../utils/auth');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

const AXIOS_CONFIG = { timeout: 30000 };

/*
 * HELPER: Find a client from recent SALES (easier to fetch than full client list)
 */
async function findProviderFromSales() {
    console.log(`\n--- FINDING CLIENT/PROVIDER FROM RECENT SALES ---`);
    try {
        const headers = await getAuthHeaders();
        // Look back 7 days
        const date = new Date();
        const dateTo = date.toISOString().split('T')[0].replace(/-/g, '');
        date.setDate(date.getDate() - 7);
        const dateFrom = date.toISOString().split('T')[0].replace(/-/g, '');

        // Fetch Sales (Venta) - "FAVE" is standard invoice
        const url = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/FAVE/V?df=${dateFrom}&dt=${dateTo}&details=0`;

        console.log(`GET ${url}`);
        const response = await axios.get(url, { ...AXIOS_CONFIG, headers });

        const docs = response.data.data || response.data || [];
        console.log(`Found ${docs.length} recent sales.`);

        if (docs.length > 0) {
            const doc = docs[0];
            const rut = doc.RutEntity || doc.Rut_Entidad || doc.rut_cliente || doc.Rut;
            console.log('Using Client from Sales:', rut);
            return {
                rut: rut,
                razon_social: "Test Client from Sales"
            };
        }
        return null;
    } catch (error) {
        console.error('Error listing sales:', error.response?.data || error.message);
        return null;
    }
}

async function getAnyProduct() {
    try {
        const headers = await getAuthHeaders();
        const url = `${ERP_BASE_URL}/products/${RUT_EMPRESA}`;
        const response = await axios.get(url, { ...AXIOS_CONFIG, headers });
        const products = response.data.data || response.data || [];
        return products.find(p => p.cod_prod || p.codigo_prod);
    } catch (error) {
        console.error('Error getting product:', error.message);
        return null;
    }
}

async function createDocument(type, provider, product) {
    if (!provider || !product) {
        console.log(`Skipping ${type}: Missing provider or product.`);
        return;
    }

    console.log(`\n--- CREATING ${type} for ${provider.rut} ---`);

    try {
        const headers = await getAuthHeaders();
        const url = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}`;

        const sku = product.cod_prod || product.codigo_prod;

        const payload = {
            "Encabezado": {
                "Id_Tipo_Doc": type,
                "Rut_Entidad": provider.rut,
                "Fecha_Emision": new Date().toISOString().split('T')[0].replace(/-/g, ''),
                "Obs": "Test IA Creation Script",
                "Forma_Pago": "1",
            },
            "Detalles": [
                {
                    "Tpo_Codigo": "I",
                    "Codigo": sku,
                    "Cantidad": 1,
                    "Precio": type === 'OCI' ? 5 : 100,
                    "Descuento": 0
                }
            ]
        };

        if (type === 'OCI') {
            payload.Encabezado.Moneda = "USD";
            payload.Encabezado.Tasa_Cambio = 900;
        }

        console.log("Payload:", JSON.stringify(payload, null, 2));

        const response = await axios.post(url, payload, { headers });
        console.log(`✅ Success ${type}! Response Data:`, response.data);

    } catch (error) {
        console.error(`❌ Failed ${type}:`, error.response?.data || error.message);
    }
}

async function main() {
    console.log("=== STARTING ORDER CREATION TEST ===");

    const product = await getAnyProduct();
    if (!product) {
        console.error("No product found. Aborting.");
        return;
    }

    // Attempt to find ANY client to use as provider to verify structure
    const provider = await findProviderFromSales();

    if (provider) {
        await createDocument('OC', provider, product);
        await createDocument('OCI', provider, product);
    } else {
        console.log("Could not find any provider/client.");
    }
}

main();
