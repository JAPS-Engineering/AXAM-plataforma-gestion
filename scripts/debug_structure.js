
require('dotenv').config();
const axios = require('axios');
const { getAuthHeaders } = require('../utils/auth');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

async function main() {
    try {
        const headers = await getAuthHeaders();
        // Fetch a recent FAVE
        const url = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/FAVE/V/?limit=1&details=1`;
        console.log(`Fetching: ${url}`);

        const response = await axios.get(url, { headers });
        const data = response.data.data || response.data || [];

        const doc = Array.isArray(data) ? data[0] : data;

        if (!doc) {
            console.log("No document found.");
            return;
        }

        console.log("Keys in document:", Object.keys(doc));

        console.log("\n--- Potential Vendor Fields ---");
        Object.keys(doc).forEach(k => {
            if (k.toLowerCase().includes('vend') || k.toLowerCase().includes('sell') || k.toLowerCase().includes('seller')) {
                console.log(`${k}: ${JSON.stringify(doc[k])}`);
            }
        });

        console.log("\n--- Potential Reference Fields ---");
        Object.keys(doc).forEach(k => {
            if (k.toLowerCase().includes('ref') || k.toLowerCase().includes('gd')) {
                console.log(`${k}: ${JSON.stringify(doc[k])}`);
            }
        });

    } catch (e) {
        console.error(e);
    }
}

main();
