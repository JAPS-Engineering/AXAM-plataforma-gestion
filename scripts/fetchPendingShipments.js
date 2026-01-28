const axios = require('axios');

// Get arguments: [node, script, sessionId]
const SESSION_ID = process.argv[2];

if (!SESSION_ID) {
    console.error(JSON.stringify({ error: "No Session ID provided" }));
    process.exit(1);
}

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
        documentNumber
        billingShipmentDetails {
          billingShipmentDetail {
            productCode
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

async function fetchPending() {
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
            console.log(JSON.stringify({ error: "GraphQL Error", details: response.data.errors }));
        } else {
            const edges = response.data.data.getPendingShipments.edges;
            const items = [];

            // Flat Map of Product Code -> Total Pending
            edges.forEach(edge => {
                const node = edge.node;
                if (node.billingShipmentDetails && node.billingShipmentDetails.billingShipmentDetail) {
                    node.billingShipmentDetails.billingShipmentDetail.forEach(detail => {
                        if (detail.pendingS > 0) {
                            items.push({
                                productCode: detail.productCode,
                                pendingS: detail.pendingS
                            });
                        }
                    });
                }
            });

            console.log(JSON.stringify({ success: true, count: items.length, data: items }));
        }

    } catch (e) {
        console.log(JSON.stringify({ error: "Request Failed", message: e.message }));
    }
}

fetchPending();
