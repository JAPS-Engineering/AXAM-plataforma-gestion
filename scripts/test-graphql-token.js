const axios = require('axios');
require('dotenv').config();

// CREDS from gestioncompra.js (or .env if available, but hardcoding for immediate verification of the *concept*)
const authInfo = {
    username: process.env.ERP_USERNAME || 'ventasamurai',
    password: process.env.ERP_PASSWORD || 'Bayona25023',
};

const query = `
query GetPendingShipments($fromDate: Date, $toDate: Date, $documentType: String!, $offset: Int, $first: Int) {
  getPendingShipments(
    offset: $offset
    first: $first
    fromDate: $fromDate
    toDate: $toDate
    documentType: $documentType
  ) {
    totalCount
    edges {
      node {
        documentNumber
      }
    }
  }
}`;

const variables = {
    "offset": 0,
    "first": 5,
    "fromDate": "2024-01-01",
    "toDate": "2026-01-28",
    "documentType": "NV"
};

async function testToken() {
    console.log("1. Getting API Token...");
    try {
        const authRes = await axios.post('https://axam.managermas.cl/api/auth/', authInfo);
        const token = authRes.data.auth_token;
        console.log("✅ Got Token:", token.substring(0, 10) + "...");

        console.log("2. Testing GraphQL with 'Authorization: token ...'");
        try {
            const gqlRes = await axios.post('https://axam.managermas.cl/graphql/', {
                query, variables
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `token ${token}`
                }
            });
            console.log("✅ GraphQL Success (Token)!");
            console.log("Data:", JSON.stringify(gqlRes.data, null, 2));
        } catch (e) {
            console.log("❌ GraphQL Failed (Token):", e.response ? e.response.status : e.message);
            if (e.response && e.response.data) console.log(JSON.stringify(e.response.data, null, 2));
        }

        console.log("3. Testing GraphQL with 'Authorization: Bearer ...'");
        try {
            const gqlRes = await axios.post('https://axam.managermas.cl/graphql/', {
                query, variables
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            console.log("✅ GraphQL Success (Bearer)!");
            console.log("Data:", JSON.stringify(gqlRes.data, null, 2));
        } catch (e) {
            console.log("❌ GraphQL Failed (Bearer):", e.response ? e.response.status : e.message);
        }

    } catch (e) {
        console.error("❌ Auth Failed:", e.message);
        if (e.response) console.log(e.response.data);
    }
}

testToken();
