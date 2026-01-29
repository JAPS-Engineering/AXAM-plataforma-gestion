# README_API.md

> [!Note]
> This file is a secondary documentation specifically for the API endpoints and services. Please refer to [README.md](README.md) for general setup and Docker instructions.

## API Overview
This project provides a set of endpoints for analyzing sales and stock data synchronized from the Manager+ ERP.

### Core Endpoints

#### Dashboard
- **GET** `/api/dashboard`
  - Main endpoint for the purchasing dashboard.
  - Combines historical sales, current month sales, and stock.
  - Query params: `meses` (3, 6, 12), `marca` (SKU prefix).

#### Synchronization
- **GET** `/api/dashboard/sync-stream`
  - Server-Sent Events (SSE) stream for real-time synchronization progress.
  - Triggers `syncNewProducts()` and `syncCurrentMonthData()`.

### Database Files
- `data/dev.db`: The unified SQLite database used by Prisma and all Node.js scripts.

### Recent Optimizations
- **Batch Detail Fetching**: Now used in all sales sync scripts to minimize ERP API requests.
- **Unified Database Path**: Solved the discrepancy between Prisma and sync scripts by using a consistent relative path in `.env`.
