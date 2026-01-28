const axios = require('axios');

// User Provided Session ID
const SESSION_ID = 'lk2bi4fuz5tyxzvub7r8y5hmwkrmoy9b';

// Dates (3 Months Back)
const today = new Date();
const year = today.getFullYear();
const month = (today.getMonth() + 1).toString().padStart(2, '0');
const day = today.getDate().toString().padStart(2, '0');
const todayFormatted = `${year}-${month}-${day}`;

const today3mAgo = new Date(today);
today3mAgo.setMonth(today.getMonth() - 3);
const year3mAgo = today3mAgo.getFullYear();
const month3mAgo = (today3mAgo.getMonth() + 1).toString().padStart(2, '0');
const day3mAgo = today3mAgo.getDate().toString().padStart(2, '0');
const today3mAgoFormatted = `${year3mAgo}-${month3mAgo}-${day3mAgo}`;

const query = `
query GetPendingShipments($fromDate: Date, $toDate: Date, $documentType: String!, $customers: [String], $products: [ID], $shipmentStatus: [String], $billingStatus: [String], $costCenters: [Int], $probabilities: [ID], $businessUnits: [Int], $showClosingDocs: Boolean, $globalFilter: String, $offset: Int, $first: Int, $orderBy: String) {
  getPendingShipments(
    offset: $offset
    first: $first
    globalFilter: $globalFilter
    fromDate: $fromDate
    toDate: $toDate
    documentType: $documentType
    customers: $customers
    products: $products
    shipmentStatus: $shipmentStatus
    billingStatus: $billingStatus
    costCenters: $costCenters
    probabilities: $probabilities
    businessUnits: $businessUnits
    showClosingDocs: $showClosingDocs
    orderBy: $orderBy
  ) {
    totalCount
    edges {
      node {
        fechaDoc: documentDate
        documentNumber
        billingShipmentDetails {
          billingShipmentDetail {
            productCode
            description
            amount
            currencyAmount
            pendingS
          }
        }
      }
    }
  }
}`;

const variables = {
    "offset": 0,
    "first": 500,
    "fromDate": today3mAgoFormatted,
    "toDate": todayFormatted,
    "documentType": "NV",
    "shipmentStatus": ["Sin movimientos", "Parcial"],
    "globalFilter": "",
    "columnVisibility": {}
};

async function testCookieSession() {
    console.log(`🚀 Testing Session ID: ${SESSION_ID}`);
    console.log(`📅 Date Range: ${today3mAgoFormatted} to ${todayFormatted}`);

    try {
        const response = await axios.post('https://axam.managermas.cl/graphql/', {
            query, variables
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Cookie': `sessionid=${SESSION_ID}`
            }
        });

        if (response.data.errors) {
            console.error("❌ GraphQL Error:", JSON.stringify(response.data.errors, null, 2));
        } else {
            const edges = response.data.data.getPendingShipments.edges;
            console.log(`✅ Success! Found ${edges.length} pending shipments.`);

            if (edges.length > 0) {
                console.log("---------------------------------------------------------------------------------------------------------");
                console.log(`| Código           | Unidades (Pend) | PENDIENTES (S) | amount          | currencyAmount  | Doc     |`);
                console.log("---------------------------------------------------------------------------------------------------------");

                edges.forEach(edge => {
                    const node = edge.node;
                    const docNum = node.documentNumber;
                    if (node.billingShipmentDetails && node.billingShipmentDetails.billingShipmentDetail) {
                        node.billingShipmentDetails.billingShipmentDetail.forEach(detail => {
                            if (detail.pendingS > 0) {
                                console.log(`| ${detail.productCode.padEnd(16)} | ${String(detail.pendingS).padStart(15)} | ${String(detail.pendingS).padStart(14)} | ${String(detail.amount).padStart(15)} | ${String(detail.currencyAmount).padStart(15)} | ${docNum} |`);
                            }
                        });
                    }
                });
            }
        }

    } catch (e) {
        console.error("❌ Request Failed:", e.message);
        if (e.response) {
            console.error("Status:", e.response.status);
            console.error("Data:", e.response.data);
        }
    }
}

testCookieSession();
