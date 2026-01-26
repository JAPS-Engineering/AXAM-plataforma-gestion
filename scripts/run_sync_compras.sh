#!/bin/bash
cd "$(dirname "$0")/.."

echo "Iniciando Sincronización de Compras via Docker (Node 20)..."
docker run --rm -v "$PWD":/app -w /app node:20 sh -c "node scripts/syncCompras.js"
