require('dotenv').config();
const axios = require('axios');
const { getAuthHeaders } = require('../utils/auth');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

async function debugProducts() {
    try {
        console.log('Fetching Product data...');
        const headers = await getAuthHeaders();
        const url = `${ERP_BASE_URL}/products/${RUT_EMPRESA}?con_stock=S&con_listaprecios=S&pic=1`;
        console.log(`URL: ${url}`);

        const response = await axios.get(url, { headers });
        const data = response.data.data || response.data || [];

        if (Array.isArray(data) && data.length > 0) {
            console.log('Product count:', data.length);
            console.log('KEYS:', JSON.stringify(Object.keys(data[0]), null, 2));

            // Check specific potential names
            const sample = data[0];
            const potentialFields = ['proveedor', 'provider', 'supplier', 'maker', 'fabricante', 'marca', 'brand'];
            const found = {};
            potentialFields.forEach(f => {
                if (sample[f]) found[f] = sample[f];
            });
            console.log('Potential supplier values:', found);
        } else {
            console.log('No products found or invalid format.');
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

debugProducts();
