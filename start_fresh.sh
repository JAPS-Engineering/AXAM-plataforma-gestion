#!/bin/bash
set -e

echo "🛑 Deteniendo servicios..."
docker-compose down

echo "🧹 Limpiando base de datos y migraciones antiguas..."
rm -rf data/*
rm -rf prisma/migrations/*

echo "🛠️  Generando migración inicial y creando BD..."
# Generamos la migración
docker-compose run --rm --entrypoint "npx prisma migrate dev --name init_fresh" axam-dashboard

echo "🔓 Ajustando permisos de la base de datos..."
sudo chmod -R 777 data/

echo "🧹 Limpiando recursos de red..."
# Bajamos todo de nuevo para evitar conflictos de red al levantar
docker-compose down

echo "🏗️  Levantando servicios..."
docker-compose up -d --build

echo "✅ Listo! Base de datos reiniciada desde 0 con una única migración."
