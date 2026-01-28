require('dotenv').config();
const axios = require('axios');

const GRAPHQL_URL = 'https://axam.managermas.cl/graphql/';
const AUTH_URL = 'https://axam.managermas.cl/api/auth/';

// Specific credential for this test
const TEST_AUTH = {
    username: 'tiaxam',
    password: 'BwyRHkhSX5zi44P'
};

const query = `
query GetPendingShipments($offset: Int, $first: Int, $fromDate: Date, $toDate: Date, $documentType: String!, $shipmentStatus: [String]) {
    getPendingShipments(
    offset: $offset
    first: $first
    fromDate: $fromDate
    toDate: $toDate
    documentType: $documentType
    shipmentStatus: $shipmentStatus
    ) {
    totalCount
    edges {
        node {
            # Trying documentDate which we found in introspection
            documentDate
            # Trying to access details based on introspection structure
            billingShipmentDetails {
               billingShipmentDetail {
                   pendingS
                   productCode
               }
            }
        }
    }
    }
}`;

// Helper to get dates
const getDates = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const day = today.getDate().toString().padStart(2, '0');

    const today3mAgo = new Date(today);
    today3mAgo.setMonth(today.getMonth() - 3);
    const year3mAgo = today3mAgo.getFullYear();
    const month3mAgo = (today3mAgo.getMonth() + 1).toString().padStart(2, '0');
    const day3mAgo = today3mAgo.getDate().toString().padStart(2, '0');

    // Start with strict YYYY-MM-DD format
    const fDate = `${year3mAgo}-${month3mAgo}-${day3mAgo}`;
    const tDate = `${year}-${month}-${day}`;

    return { fDate, tDate };
};

async function getSpecificAuthToken() {
    console.log(`🔐 Authenticating as ${TEST_AUTH.username}...`);
    try {
        const response = await axios.post(AUTH_URL, TEST_AUTH);
        console.log("✅ Auth Success!");
        return response.data.auth_token;
    } catch (error) {
        console.error("❌ Auth Failed:", error.response ? error.response.data : error.message);
        throw error;
    }
}

async function main() {
    console.log("🚀 Starting test-getPendingShipments (Specific Creds)...");

    try {
        const token = await getSpecificAuthToken();
        const { fDate, tDate } = getDates();
        console.log(`📅 Date Range: ${fDate} to ${tDate}`);

        const variables = {
            "offset": 0,
            "orderBy": null,
            "documentType": "NV",
            "shipmentStatus": ["Sin movimientos", "Parcial"],
            "billingStatus": [],
            "fromDate": fDate,
            "toDate": tDate,
            "customers": [],
            "products": [],
            "businessUnits": [],
            "costCenters": [],
            "probabilities": [],
            "globalFilter": "",
            "columnVisibility": {}
        };

        const headers = {
            'Authorization': `Token ${token}`,
            'Content-Type': 'application/json',
            'Origin': 'https://axam.managermas.cl',
            'Referer': 'https://axam.managermas.cl/'
        };

        console.log("🔐 Sending GraphQL request...");

        try {
            const response = await axios.post(GRAPHQL_URL, {
                query: query,
                variables: variables
            }, {
                headers: headers
            });

            console.log("✅ Response Status:", response.status);

            if (response.data.errors) {
                console.error("❌ GraphQL Errors:", JSON.stringify(response.data.errors, null, 2));
            } else if (response.data.data) {
                console.log("✅ Success! Data Received:");
                const edges = response.data.data.getPendingShipments.edges;
                console.log(`📊 Total edges found: ${edges.length}`);

                if (edges.length > 0) {
                    const firstNode = edges[0].node;
                    console.log("📄 Sample Node Structure:");
                    console.log(JSON.stringify(firstNode, null, 2));
                } else {
                    console.log("⚠️ No pending shipments found in this range.");
                }
            } else {
                console.log("⚠️ Unexpected response structure:", JSON.stringify(response.data, null, 2));
            }

        } catch (error) {
            console.error("❌ Request Failed");
            if (error.response) {
                console.error(`Status: ${error.response.status}`);
                console.error("Data:", JSON.stringify(error.response.data, null, 2));
            } else {
                console.error(error.message);
            }
        }

    } catch (e) {
        console.error("❌ Fatal Error:", e);
    }
}

main();
