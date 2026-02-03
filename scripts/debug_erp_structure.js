
require('dotenv').config();
const axios = require('axios');
const { getAuthHeaders } = require('../utils/auth');

async function main() {
    try {
        const headers = await getAuthHeaders();
        const RUT_EMPRESA = process.env.RUT_EMPRESA;
        const ERP_BASE_URL = process.env.ERP_BASE_URL;

        // Fetch from a date definitely in the past (e.g., 2025-01-01)
        const date = '20250101';

        const url = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/FACE/C?details=1&df=${date}&dt=${date}`;
        console.log(`Fetching from: ${url}`);

        const response = await axios.get(url, { headers });
        const docs = response.data.data || response.data || [];

        console.log(`Docs found: ${docs.length}`);

        if (docs.length > 0) {
            console.log('First document structure keys:', Object.keys(docs[0]));
            console.log('First document sample:', JSON.stringify(docs[0], null, 2));
        } else {
            console.log('No docs found for this date. Trying a wider range...');
            // Try wider range
            const url2 = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/FACE/C?details=1&df=20240101&dt=20250101`;
            const response2 = await axios.get(url2, { headers });
            const docs2 = response2.data.data || response2.data || [];
            if (docs2.length > 0) {
                console.log('First document sample (from wider range):', JSON.stringify(docs2[0], null, 2));
            } else {
                console.log('Still no docs found.');
            }
        }

    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
}

main();
