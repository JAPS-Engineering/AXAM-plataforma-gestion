/**
 * Script para Sincronización Histórica de Stock
 * 
 * Recorre un rango de fechas hacia atrás (o adelante) y consulta el stock
 * de CADA producto para CADA día usando el parámetro ?fecha=YYYYMMDD
 * confirmado en pruebas.
 * 
 * Uso: node scripts/syncHistoricoStock.js [dias_atras]
 * Ejemplo: node scripts/syncHistoricoStock.js 30  (Sincroniza los últimos 30 días)
 */

require('dotenv').config();
const axios = require('axios');
const { format, subDays, isBefore, parseISO, addDays } = require('date-fns');
const { getPrismaClient } = require('../prisma/client');
const { getAuthHeaders } = require('../utils/auth');
const { logSection, logInfo, logError, logSuccess, logWarning } = require('../utils/logger');
const { extractStockFromProduct } = require('../services/stockService');

const prisma = getPrismaClient();
const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

// Configuración
const CONCURRENCY_PRODUCTS = 5; // Productos simultáneos por día (bajo para evitar timeout)
const DELAY_BETWEEN_DAYS = 1000; // Ms de espera entre días

async function getStockForDate(sku, date) {
    try {
        const headers = await getAuthHeaders();
        const dateStr = format(date, 'yyyyMMdd');

        const url = `${ERP_BASE_URL}/products/${RUT_EMPRESA}/${sku}/`;
        const response = await axios.get(url, {
            headers,
            params: {
                con_stock: 'S',
                fecha: dateStr
            },
            timeout: 10000 // 10s timeout
        });

        const productData = response.data.data || response.data;
        if (!productData) return null;

        const product = Array.isArray(productData) ? productData[0] : productData;

        // Usamos la misma lógica de extracción que el servicio regular
        return extractStockFromProduct(product);

    } catch (error) {
        if (error.response?.status === 404) return 0; // Si no existe en esa fecha, asumimos 0? O null?
        // logWarning(`Error obteniendo stock ${sku} para ${format(date, 'yyyy-MM-dd')}: ${error.message}`);
        return null;
    }
}

async function processDay(date, productos) {
    const dateStr = format(date, 'yyyy-MM-dd');
    logSection(`Procesando Stock para: ${dateStr}`);

    let updated = 0;
    let errors = 0;

    // Procesar en lotes
    for (let i = 0; i < productos.length; i += CONCURRENCY_PRODUCTS) {
        const batch = productos.slice(i, i + CONCURRENCY_PRODUCTS);

        const promises = batch.map(async (p) => {
            const stock = await getStockForDate(p.sku, date);

            if (stock !== null) {
                // Guardar en StockHistorico
                // Upsert para no duplicar si corremos el script 2 veces
                // Buscamos primero si existe para esa fecha (sin hora)

                // Prisma no tiene unique constraint en (productoId, fecha) por defecto si fecha tiene hora
                // Así que borramos y creamos o buscamos y updateamos.
                // Mejor estrategia: deleteMany para ese día + create.

                // Opción más segura: findFirst para el día
                const startOfDay = new Date(date);
                startOfDay.setHours(0, 0, 0, 0);
                const endOfDay = new Date(date);
                endOfDay.setHours(23, 59, 59, 999);

                const existing = await prisma.stockHistorico.findFirst({
                    where: {
                        productoId: p.id,
                        fecha: {
                            gte: startOfDay,
                            lte: endOfDay
                        }
                    }
                });

                if (existing) {
                    await prisma.stockHistorico.update({
                        where: { id: existing.id },
                        data: { stock }
                    });
                } else {
                    await prisma.stockHistorico.create({
                        data: {
                            productoId: p.id,
                            fecha: startOfDay, // Guardamos con hora 00:00
                            stock
                        }
                    });
                }
                return true;
            }
            return false;
        });

        const results = await Promise.all(promises);
        updated += results.filter(r => r).length;
        process.stdout.write('.');
    }
    console.log(''); // Newline
    logSuccess(`  COMPLETADO ${dateStr}: ${updated} registros actualizados.`);
}

async function main() {
    const daysBack = parseInt(process.argv[2]) || 7; // Default 1 week
    logSection(`SINCRONIZACIÓN HISTÓRICA DE STOCK (${daysBack} días)`);

    try {
        // 1. Obtener todos los productos de la BD (Whitelist)
        const productos = await prisma.producto.findMany({
            select: { id: true, sku: true }
        });

        logInfo(`Total Productos a Consultar: ${productos.length}`);

        // 2. Iterar fechas (Desde ayer hacia atrás)
        // Empezamos desde ayer porque el stock de "hoy" lo maneja syncDaily/syncStocks normal
        const today = new Date();

        for (let i = 1; i <= daysBack; i++) {
            const targetDate = subDays(today, i);
            await processDay(targetDate, productos);

            // Espera para no saturar API
            await new Promise(r => setTimeout(r, DELAY_BETWEEN_DAYS));
        }

    } catch (error) {
        logError(`Error fatal: ${error.message}`);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { main };
