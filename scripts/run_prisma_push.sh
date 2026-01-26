#!/bin/bash
# Navegar al root del proyecto (un nivel arriba de scripts/)
cd "$(dirname "$0")/.."

echo "Iniciando Prisma DB Push via Docker (Node 20)..."
docker run --rm -v "$PWD":/app -w /app node:20 sh -c "npm install --omit=dev && npx prisma generate && npx prisma db push"
