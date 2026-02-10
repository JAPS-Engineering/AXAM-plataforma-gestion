require('dotenv').config();
const axios = require('axios');

const ERP_BASE_URL = process.env.ERP_BASE_URL;
const ERP_USERNAME = process.env.ERP_USERNAME;
const ERP_PASSWORD = process.env.ERP_PASSWORD;
const RUT_EMPRESA = process.env.RUT_EMPRESA;

async function authenticateWithERP() {
    try {
        console.log('🔐 Authenticating with Manager+...');
        const response = await axios.post(`${ERP_BASE_URL}/auth/`, {
            username: ERP_USERNAME,
            password: ERP_PASSWORD
        }, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data.auth_token;
    } catch (error) {
        console.error('❌ Auth Error:', error.message);
        throw error;
    }
}

async function checkErpPrices() {
    try {
        const token = await authenticateWithERP();
        console.log('✅ Auth successful. Token obtained.');

        const headers = {
            'Authorization': `Token ${token}`,
            'Content-Type': 'application/json'
        };

        const TARGET_LISTS = ['89', '652', '386'];

        const url = `${ERP_BASE_URL}/pricelist/${RUT_EMPRESA}/?dets=1`;
        console.log(`Fetching from: ${url}`);

        const response = await axios.get(url, { headers });
        const data = response.data.data || response.data || [];

        console.log(`Found ${data.length} lists.`);

        // Debug: Print all list IDs found
        console.log('Available List IDs:', data.map(l => `${l.id || l.codigo} (${l.descripcion})`).join(', '));

        for (const listId of TARGET_LISTS) {
            const targetList = data.find(l =>
                String(l.codigo) === listId ||
                String(l.id) === listId ||
                String(l.cod_lista) === listId ||
                (l.listName && l.listName.includes(listId)) ||
                (l.descripcion && l.descripcion.includes(listId))
            );

            if (targetList) {
                const items = targetList.products || targetList.produtos || targetList.productos || targetList.detalles || targetList.items || [];
                console.log(`✅ List ${listId} found with ${items.length} items.`);
                if (items.length > 0) {
                    // Debug sample item structure
                    const sample = items[0];
                    console.log(`   Sample item structure keys:`, Object.keys(sample).join(', '));
                    console.log(`   Sample item:`, JSON.stringify(sample).substring(0, 150) + '...');
                }
            } else {
                console.log(`❌ List ${listId} NOT FOUND.`);
            }
        }

    } catch (e) {
        console.error('Error:', e.message);
        if (e.response) {
            console.error('Data:', e.response.data);
        }
    }
}

checkErpPrices();
