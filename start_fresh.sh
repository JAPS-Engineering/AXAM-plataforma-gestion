#!/bin/bash
set -e

echo "========================================="
echo "🚀 AXAM Dashboard - Start Fresh"
echo "========================================="
echo ""

# ============================================
# Paso 1: Detener servicios
# ============================================
echo "🛑 [1/6] Deteniendo servicios..."
docker-compose down 2>/dev/null || true

# ============================================
# Paso 2: Limpiar base de datos y migraciones
# ============================================
echo "🧹 [2/6] Limpiando base de datos y migraciones antiguas..."
rm -rf data/*
rm -rf prisma/migrations/*

# ============================================
# Paso 3: Generar migración y crear BD
# ============================================
echo "🛠️  [3/6] Generando migración inicial y creando BD..."
docker-compose run --rm --entrypoint "npx prisma migrate dev --name init_fresh" axam-dashboard

echo "🔓 Ajustando permisos de la base de datos..."
sudo chmod -R 777 data/

# ============================================
# Paso 4: Limpiar y levantar servicios
# ============================================
echo "🧹 Limpiando recursos de red..."
docker-compose down

echo "🏗️  [4/6] Construyendo y levantando servicios..."
docker-compose up -d --build

# Esperar a que el servidor esté listo
echo "⏳ Esperando a que el servidor esté listo..."
sleep 10

# Verificar que el servidor esté corriendo
until curl -s http://localhost:3001/health > /dev/null; do
    echo "   Esperando servidor..."
    sleep 5
done
echo "✅ Servidor activo"

# ============================================
# Paso 5: Sincronización histórica
# ============================================
echo ""
echo "📊 [5/6] Ejecutando sincronización histórica..."
echo "   Esto puede tomar varios minutos..."
echo ""

# Sincronizar productos
echo "   📦 Sincronizando productos..."
docker-compose exec -T axam-dashboard node scripts/syncDaily.js products
echo "   ✅ Productos sincronizados"

# Sincronizar ventas históricas (desde 2021)
echo "   📈 Sincronizando ventas históricas (desde 2021)..."
docker-compose exec -T axam-dashboard node scripts/syncDaily.js full
echo "   ✅ Ventas históricas sincronizadas"

# Sincronizar datos del mes actual (stock y ventas actuales)
echo "   📊 Sincronizando datos del mes actual..."
docker-compose exec -T axam-dashboard node scripts/syncDaily.js current
echo "   ✅ Datos del mes actual sincronizados"

# Sincronizar compras históricas (desde 2021)
echo "   💰 Sincronizando compras históricas (desde 2021)..."
docker-compose exec -T axam-dashboard node scripts/syncCompras.js full
echo "   ✅ Compras históricas sincronizadas"

# ============================================
# Paso 6: Verificación final
# ============================================
echo ""
echo "🔍 [6/6] Verificación final..."

# Mostrar estado de la base de datos
docker-compose exec -T axam-dashboard node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function check() {
    const productos = await prisma.producto.count();
    const ventasHistoricas = await prisma.ventaHistorica.count();
    const ventasActuales = await prisma.ventaActual.count();
    const comprasHistoricas = await prisma.compraHistorica.count();
    const productosConCosto = await prisma.producto.count({ where: { precioUltimaCompra: { not: null } } });
    const emails = await prisma.emailNotificacion.count();
    console.log('   📊 Productos: ' + productos);
    console.log('   📈 Ventas históricas: ' + ventasHistoricas);
    console.log('   📉 Ventas actuales: ' + ventasActuales);
    console.log('   💰 Compras históricas: ' + comprasHistoricas);
    console.log('   💵 Productos con costo: ' + productosConCosto);
    console.log('   📧 Emails configurados: ' + emails);
    await prisma.\$disconnect();
}
check();
"

echo ""
echo "========================================="
echo "✅ ¡Sistema listo!"
echo "========================================="
echo ""
echo "📍 Dashboard: http://localhost:3001"
echo ""
echo "⏰ Tareas CRON programadas automáticamente:"
echo "   - 01:00 AM (Chile): Sincronización diaria"
echo "   - 17:00 PM (Chile): Alerta de stock bajo"
echo ""
echo "📧 Configura emails de alerta en:"
echo "   http://localhost:3001/minimos"
echo ""
echo "📋 Ver logs:"
echo "   docker logs -f axam-dashboard"
echo ""
