
require('dotenv').config();
const axios = require('axios');

const ERP_BASE_URL = process.env.ERP_BASE_URL;
const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_USERNAME = process.env.ERP_USERNAME;
const ERP_PASSWORD = process.env.ERP_PASSWORD;

async function test() {
    try {
        const authRes = await axios.post(`${ERP_BASE_URL}/auth/`, {
            username: ERP_USERNAME,
            password: ERP_PASSWORD
        });
        const token = authRes.data.auth_token;
        const headers = { 'Authorization': `Token ${token}` };

        const df = "20260101";
        const dt = "20260305";

        const types = ['OC', 'OCI'];

        for (const t of types) {
            const url = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/${t}/C?df=${df}&dt=${dt}`;
            console.log(`Testing: ${url}`);
            try {
                const res = await axios.get(url, { headers, timeout: 5000 });
                const docs = res.data.data || res.data || [];
                console.log(`✅ ${t}: Found ${docs.length} docs`);
                if (docs.length > 0) {
                    let maxFolio = 0;
                    docs.forEach(d => {
                        const n = parseInt(d.folio, 10);
                        if (!isNaN(n) && n > maxFolio) maxFolio = n;
                    });
                    console.log(`   Max folio: ${maxFolio}`);
                }
            } catch (e) {
                console.log(`❌ ${t} failed: ${e.response?.status}`);
            }
        }

    } catch (e) {
        console.error('Error:', e.message);
    }
}

test();
