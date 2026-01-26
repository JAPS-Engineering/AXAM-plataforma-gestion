# Gap Analysis & Implementation Plan: Commercial Proposal Alignment

## Goal Description
Technical alignment of the current `test-syncVentas` codebase with the new "Axam Commercial Proposal". This plan identifies gaps between currently implemented features and the proposal requirements, and outlines specific technical changes needed to achieve the proposed deliverables.

## Gap Analysis Summary

| Feature | Proposal Requirement | Current Implementation | Gap / Action Required |
|:--- |:--- |:--- |:--- |
| **Prediction Algo** | Growth analysis (last 3 months vs previous quarter) | Standard Linear Regression on all history | **Update Logic**: Modify `purchaseLogic.js` to implement specific comparison. **History**: Extend sync to **4 years**. |
| **Logic (Weekly)** | Weekly analysis (1, 2, 3 weeks) | Monthly aggregation only | **Schema Change**: Store weekly sales data. **Sync Update**: Handle weekly buckets. |
| **Seller Analysis** | Ranking by Seller, "Propongo" field | No seller data | **Schema Change**: Add `vendedor` to sales tables. **Sync Update**: Extract seller from FAVE. |
| **Stock History** | Graph historical stock (Tarjeta de Existencia) | Current stock only | **New Sync**: Sync "Tarjeta de Existencia" for daily stock history (graphing only). |
| **Alerts** | Email on Stock < Min & Pending Dispatch > Stock | None | **New Service**: `AlertService` for email notifications on critical stock/pending orders. |
| **Pricing/Cost** | "Last Purchase Cost" in OC, Price Evolution | No cost tracking | **Schema**: Store `precioUltimaCompra`. **UI**: Show price history. **OC**: Add cost column. |
| **Data Cleaning** | Filter "Dirty" codes, use Wholesale List | All products synced | **Sync Filter**: Implement whitelist based on "Lista Mayorista" or active status. |
| **Sales Data** | Include "Guias de Despacho" (Unbilled) | Invoices (FAVE) only | **Sync Update**: Fetch and sum `GuiaDespacho` data for sales totals. |
| **Containers** | Config params for containers & import times | Basic product fields only | **Schema/UI**: Add global/provider container config and UI. |
| **ERP Integration** | Auto-create OC/OCI in Manager+ | Mocked/Disabled | **Enable**: Verify API permissions and enable `managerIntegration.js`. |

## User Review Required
> [!IMPORTANT]
> **Data Scope**: Increasing history to **4 years** and adding "Tarjeta de Existencia" (daily stock) will significantly increase database size and sync time. We need optimizations for the initial sync.

> [!NOTE]
> **Sales Definition**: Sales logic must be updated to: `Ventas = Facturas (FAVE) + Guias de Despacho (No Facturadas)`. We must strictly avoid double counting (e.g. Guia converted to Factura).

> [!IMPORTANT]
> **User-Initiated "Automation"**: OC/OCI creation in Manager+ is **triggered manually** by the user via a "Send to ERP" button after review. It is NOT a background background process.

> [!WARNING]
> **ERP Integration**: Enabling automatic creation of OCs in Manager+ requires write-access credentials. We also need to fetch "Last Purchase Price" via API for accurate OC valuation.

## Proposed Changes

### Database Layer (`prisma/schema.prisma`)
#### [MODIFY] [schema.prisma](file:///wsl.localhost/Ubuntu/home/jeanf/axam/test-syncVentas/prisma/schema.prisma)
- Add `vendedor` to Sales tables.
- **New Models**:
    - `StockHistorico`: Relational model for daily/monthly stock snapshots (Source: Tarjeta Existencia).
    - `PrecioHistorico`: Relational model for price evolution (Source: Manager API).
- Add `parametrosContainer` to `Configuracion` or new model.

### Backend Services
#### [MODIFY] [purchaseLogic.js](file:///wsl.localhost/Ubuntu/home/jeanf/axam/test-syncVentas/services/purchaseLogic.js)
- Update Algorithm: 3-month growth vs previous quarter.

#### [NEW] `services/alertScheduler.js`
- Background job (cron) to check `Stock < Min` AND `PendingOrders > 0`.
- **Note**: Must be implemented but **DISABLED** by default. Configurable interval (e.g., 30 mins).

#### [MODIFY] [syncVentas.js](file:///wsl.localhost/Ubuntu/home/jeanf/axam/test-syncVentas/scripts/syncVentas.js)
- **Scope**: Increase sync range to 4 years.
- **Source**: Fetch `GuiasDespacho` in addition to FAVEs.
- **Seller**: Extract seller info.

#### [NEW] `scripts/syncStockPrice.js`
- Dedicated script to sync `StockHistorico` ("Tarjeta de Existencia") and `PrecioHistorico`.

#### [MODIFY] [managerIntegration.js](file:///wsl.localhost/Ubuntu/home/jeanf/axam/test-syncVentas/services/managerIntegration.js)
- **OC Generation**: Implement function triggered by User Button.
- **Valuation**: Fetch latest cost from API before generating OC.

### Frontend
#### [NEW] `src/app/analitica/page.tsx`
- New Dashboard page for Sales Analytics.
- Charts: Sales by Family, Seller Ranking, Market Share.

#### [NEW] `src/app/parametros/contenedores/page.tsx`
- UI to configure container parameters and import variables.

## Verification Plan

### Automated Endpoint Verification (Priority)
Create dedicated test scripts for EACH new data source to verify API response structure and data integrity BEFORE full implementation:
1.  `scripts/test/testEndpoint_Existencias.js`: Verify "Tarjeta de Existencia" API response structure.
2.  `scripts/test/testEndpoint_Guias.js`: Verify "Guias de Despacho" extraction and ensure no overlap with FAVEs.
3.  `scripts/test/testEndpoint_Precios.js`: Verify "Last Purchase Price" and price history data.
4.  `scripts/test/testEndpoint_Vendedores.js`: Verify extraction of seller codes from headers.

### Manual Verification
1.  **Sync**: Run `npm run sync:ventas` and check DB for `vendedor` data.
2.  **Dashboard**: Navigate to new Analytics page, verify charts load with real data.
3.  **Suggestion**: Run "Compra Sugerida" with new Algorithm and verify it matches manual calculation (Excel).
4.  **ERP Integration**:
    - Click "Generar OC" button.
    - Confirm Review Screen appears.
    - Confirm OC is created in Manager+ (or mock) only after final confirmation.
