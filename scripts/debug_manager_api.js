require('dotenv').config();
const axios = require('axios');
const { getAuthHeaders } = require('../utils/auth');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

async function debugPriceLists() {
    try {
        console.log('Fetching Price List data...');
        const headers = await getAuthHeaders();
        const url = `${ERP_BASE_URL}/pricelist/${RUT_EMPRESA}/?dets=1`;
        console.log(`URL: ${url}`);

        const response = await axios.get(url, { headers });
        const data = response.data.data || response.data || [];

        const list89 = data.find(l => String(l.codigo) === '89' || String(l.id) === '89');

        if (list89) {
            console.log('Found List 89. Keys:', Object.keys(list89));
            // Add 'products' to the list of properties to check
            const items = list89.products || list89.produtos || list89.productos || list89.detalles || list89.items || [];

            if (items.length > 0) {
                console.log(JSON.stringify(items.slice(0, 3), null, 2));
            } else {
                console.log('List 89 has no items.');
            }
        } else {
            console.log('List 89 not found.');
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

debugPriceLists();
