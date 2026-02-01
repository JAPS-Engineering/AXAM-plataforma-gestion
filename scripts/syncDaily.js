/**
 * Script de sincronización incremental diaria
 * 
 * Diseñado para ejecutarse vía CRON a la 1 AM todos los días
 * Sincroniza SOLO los documentos del día anterior para eficiencia
 * 
 * Uso: node scripts/syncDaily.js
 * Cron: 0 1 * * * cd /path/to/project && node scripts/syncDaily.js
 */

require('dotenv').config();
const { format, subDays, getYear, getMonth, startOfMonth, endOfMonth, eachDayOfInterval } = require('date-fns');
const { getPrismaClient } = require('../prisma/client');
const { logSection, logSuccess, logError, logWarning, logInfo } = require('../utils/logger');
const { getDailySales, getMonthlySales, getCurrentStock, getAllProducts } = require('../services/salesService');

const prisma = getPrismaClient();

/**
 * Sincronizar productos desde el ERP (solo nuevos)
 */
/**
 * Sincronizar productos desde el ERP (usando Filtro de Lista 652)
 */
async function syncNewProducts() {
    logSection('SINCRONIZANDO PRODUCTOS (CON FILTRO LISTA 652)');

    try {
        // Reutilizamos la lógica centralizada en syncProductos.js
        // para asegurar que siempre se aplique el filtro de WhiteList
        const { syncProductsWithFilter } = require('./syncProductos');
        await syncProductsWithFilter();

        // Retornamos dummy stats porque syncProductos ya loguea su propio detalle
        return { created: 0, updated: 0 };

    } catch (error) {
        logError(`Error sincronizando productos: ${error.message}`);
        throw error;
    }
}

/**
 * Sincronizar ventas de un día específico
 */
async function syncDaySales(date) {
    const year = getYear(date);
    const month = getMonth(date) + 1;
    const dateStr = format(date, 'yyyy-MM-dd');

    logInfo(`Sincronizando ventas del ${dateStr}...`);

    try {
        const { sales, documentsCount } = await getDailySales(date);

        if (sales.size === 0) {
            logWarning(`  Sin ventas para ${dateStr}`);
            return { processed: 0, updated: 0 };
        }

        let updated = 0;

        for (const [key, data] of sales) {
            const { sku, vendedor } = data;
            // Buscar el producto
            const producto = await prisma.producto.findUnique({
                where: { sku }
            });

            if (!producto) {
                // Crear producto si no existe
                const newProduct = await prisma.producto.create({
                    data: { sku, descripcion: 'Producto nuevo (auto-creado)', familia: '' }
                });
                await upsertMonthlySale(newProduct.id, year, month, data.cantidad, data.montoNeto, vendedor, false);
                updated++;
                continue;
            }

            // Actualizar venta mensual (acumular)
            await upsertMonthlySale(producto.id, year, month, data.cantidad, data.montoNeto, vendedor, true);
            updated++;
        }

        logSuccess(`  ${documentsCount} documentos, ${updated} productos actualizados`);

        return { processed: documentsCount, updated };

    } catch (error) {
        logError(`Error sincronizando ${dateStr}: ${error.message}`);
        throw error;
    }
}

/**
 * Upsert de venta mensual
 */
async function upsertMonthlySale(productoId, ano, mes, cantidad, montoNeto, vendedor = '', accumulate = false) {
    const existing = await prisma.ventaHistorica.findUnique({
        where: {
            productoId_ano_mes_vendedor: { productoId, ano, mes, vendedor: vendedor || '' }
        }
    });

    // Asegurar que el vendedor existe en la tabla de Vendedores (Auto-registro)
    if (vendedor) {
        await prisma.vendedor.upsert({
            where: { codigo: vendedor },
            update: { activo: true },
            create: { codigo: vendedor, nombre: vendedor, activo: true }
        });
    }

    if (existing) {
        if (accumulate) {
            await prisma.ventaHistorica.update({
                where: { id: existing.id },
                data: {
                    cantidadVendida: existing.cantidadVendida + cantidad,
                    montoNeto: existing.montoNeto + montoNeto
                }
            });
        } else {
            await prisma.ventaHistorica.update({
                where: { id: existing.id },
                data: {
                    cantidadVendida: cantidad,
                    montoNeto: montoNeto
                }
            });
        }
    } else {
        await prisma.ventaHistorica.create({
            data: {
                productoId,
                ano,
                mes,
                vendedor: vendedor || '',
                cantidadVendida: cantidad,
                montoNeto: montoNeto
            }
        });
    }
}

/**
 * Sincronizar mes completo (para inicialización o recálculo)
 */
async function syncFullMonth(year, month) {
    logSection(`SINCRONIZANDO MES COMPLETO: ${month}/${year}`);

    try {
        const { sales, documentsCount } = await getMonthlySales(year, month);

        if (sales.size === 0) {
            logWarning(`Sin ventas para ${month}/${year}`);
            return { processed: 0, updated: 0 };
        }

        let updated = 0;

        for (const [key, data] of sales) {
            const { sku, vendedor } = data;
            let producto = await prisma.producto.findUnique({
                where: { sku }
            });

            if (!producto) {
                producto = await prisma.producto.create({
                    data: { sku, descripcion: 'Producto nuevo (auto-creado)', familia: '' }
                });
            }

            // Reemplazar venta mensual (no acumular)
            await upsertMonthlySale(producto.id, year, month, data.cantidad, data.montoNeto, vendedor, false);
            updated++;
        }

        logSuccess(`${documentsCount} documentos, ${updated} productos actualizados`);

        return { processed: documentsCount, updated };

    } catch (error) {
        logError(`Error sincronizando ${month}/${year}: ${error.message}`);
        throw error;
    }
}

/**
 * Sincronizar stock actual y ventas del mes actual
 * @param {boolean} includeToday - Si true, incluye ventas hasta AHORA. Si false, solo hasta ayer (para CRON)
 */
async function syncCurrentMonthData(includeToday = false) {
    logSection('SINCRONIZANDO DATOS DEL MES ACTUAL');

    const { getChileDate, formatChileDate } = require('../utils/timezone');

    // Usar fecha en zona horaria local
    const today = getChileDate();
    const year = getYear(today);
    const month = getMonth(today) + 1;

    try {
        const startDate = startOfMonth(today);
        let endDate;

        if (includeToday) {
            // Sincronización manual: incluir ventas hasta AHORA
            endDate = new Date(today);
            logInfo(`Obteniendo ventas del mes actual (hasta ahora: ${format(endDate, 'dd/MM/yyyy HH:mm')})...`);
        } else {
            // Sincronización automática (CRON): solo hasta ayer 23:59:59
            // Las ventas de hoy se obtienen en tiempo real en el dashboard
            endDate = subDays(today, 1);
            endDate.setHours(23, 59, 59, 999);
            logInfo('Obteniendo ventas del mes actual (hasta ayer)...');
        }

        // Si es el primer día del mes y no incluimos hoy, el rango puede quedar vacío
        await prisma.ventaActual.deleteMany({});

        // Asegurar que existe el vendedor "default" (vacío) para stock sin ventas
        await prisma.vendedor.upsert({
            where: { codigo: "" },
            update: { activo: true },
            create: { codigo: "", nombre: "Sin Asignar", activo: true }
        });

        let monthlySales = new Map();

        if (startDate <= endDate) {
            const { getAllSales, aggregateSalesByProduct } = require('../services/salesService');
            // Obtener ventas con rango específico
            const documents = await getAllSales(startDate, endDate);
            monthlySales = aggregateSalesByProduct(documents);
        }

        // 2. Obtener stock actual (siempre live)
        logInfo('Obteniendo stock actual...');
        const stockMap = await getCurrentStock();

        // 3. Actualizar VentaActual con los datos acumulados hasta ayer
        let updated = 0;
        let productosConVentas = 0; // Contador para productos con ventas

        for (const [key, data] of monthlySales) {
            const { sku, vendedor } = data;
            const producto = await prisma.producto.findUnique({
                where: { sku }
            });

            if (!producto) continue;

            const stockActual = stockMap.get(sku) || 0;

            // Asegurar que el vendedor existe
            if (vendedor) {
                await prisma.vendedor.upsert({
                    where: { codigo: vendedor },
                    update: { activo: true },
                    create: { codigo: vendedor, nombre: vendedor, activo: true }
                });
            }

            await prisma.ventaActual.create({
                data: {
                    productoId: producto.id,
                    vendedor: vendedor || '',
                    cantidadVendida: data.cantidad,
                    stockActual: stockActual,
                    montoNeto: data.montoNeto
                }
            });
            updated++;
            productosConVentas++; // Este producto SÍ tuvo ventas
        }

        // También actualizar stock para productos sin ventas este mes (pero con stock)
        for (const [sku, stock] of stockMap) {
            if (monthlySales.has(sku)) continue; // Ya procesado

            const producto = await prisma.producto.findUnique({
                where: { sku }
            });

            if (!producto) continue;

            await prisma.ventaActual.create({
                data: {
                    productoId: producto.id,
                    cantidadVendida: 0,
                    stockActual: stock,
                    montoNeto: 0
                }
            });
            updated++;
            // No incrementar productosConVentas - estos NO tuvieron ventas
        }

        logSuccess(`VentaActual: ${updated} productos actualizados, ${productosConVentas} con ventas (hasta ${format(endDate, 'dd/MM/yyyy HH:mm')})`);
        return { updated, productosConVentas };

    } catch (error) {
        logError(`Error sincronizando datos actuales: ${error.message}`);
        throw error;
    }
}

/**
 * Sincronización incremental diaria (para CRON)
 * Solo sincroniza el día anterior
 */
async function syncYesterday() {
    logSection('SINCRONIZACIÓN INCREMENTAL DIARIA');

    const yesterday = subDays(new Date(), 1);

    logInfo(`Fecha de sincronización: ${format(yesterday, 'dd/MM/yyyy')}`);

    try {
        // 1. Sincronizar nuevos productos
        await syncNewProducts();

        // 2. Sincronizar ventas de ayer
        await syncDaySales(yesterday);

        // 3. Actualizar datos del mes actual (stock + ventas acumuladas)
        await syncCurrentMonthData();

        logSection('SINCRONIZACIÓN COMPLETADA');
        logSuccess(`Última sincronización: ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}`);

    } catch (error) {
        logError(`Error en sincronización: ${error.message}`);
        throw error;
    }
}

/**
 * Sincronización inicial (primer uso)
 * Sincroniza los últimos N meses
 */
async function syncInitial(months = 12) {
    logSection(`SINCRONIZACIÓN INICIAL (${months} meses)`);

    const today = new Date();

    try {
        // 1. Sincronizar productos
        await syncNewProducts();

        // 2. Sincronizar cada mes hacia atrás
        for (let i = months; i >= 1; i--) {
            const targetDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const year = getYear(targetDate);
            const month = getMonth(targetDate) + 1;

            await syncFullMonth(year, month);
        }

        // 3. Sincronizar datos del mes actual
        await syncCurrentMonthData();

        logSection('SINCRONIZACIÓN INICIAL COMPLETADA');

    } catch (error) {
        logError(`Error en sincronización inicial: ${error.message}`);
        throw error;
    }
}

/**
 * Sincronización completa desde enero 2021
 * Para análisis multi-año
 */
async function syncFull2021() {
    logSection('SINCRONIZACIÓN COMPLETA (DESDE ENERO 2021)');

    const startYear = 2021;
    const startMonth = 1;
    const today = new Date();
    const endYear = getYear(today);
    const endMonth = getMonth(today) + 1;

    try {
        // 1. Sincronizar productos
        await syncNewProducts();

        // 2. Sincronizar cada mes desde enero 2021
        let year = startYear;
        let month = startMonth;
        let totalMeses = 0;

        while (year < endYear || (year === endYear && month < endMonth)) {
            await syncFullMonth(year, month);
            totalMeses++;

            month++;
            if (month > 12) {
                month = 1;
                year++;
            }
        }

        // 3. Sincronizar datos del mes actual
        await syncCurrentMonthData();

        logSection(`SINCRONIZACIÓN COMPLETA: ${totalMeses} meses desde enero 2021`);

    } catch (error) {
        logError(`Error en sincronización completa: ${error.message}`);
        throw error;
    }
}

// CLI
async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'daily';

    switch (command) {
        case 'daily':
        case 'yesterday':
            await syncYesterday();
            break;

        case 'init':
        case 'initial':
            const months = parseInt(args[1]) || 12;
            await syncInitial(months);
            break;

        case 'full':
        case '2021':
            await syncFull2021();
            break;

        case 'month':
            const year = parseInt(args[1]) || new Date().getFullYear();
            const month = parseInt(args[2]) || new Date().getMonth() + 1;
            await syncFullMonth(year, month);
            break;

        case 'current':
            await syncCurrentMonthData();
            break;

        case 'products':
            await syncNewProducts();
            break;

        default:
            console.log(`
Uso: node scripts/syncDaily.js [comando] [opciones]

Comandos:
  daily, yesterday  - Sincroniza el día anterior (defecto, para CRON)
  init, initial [N] - Sincronización inicial de N meses (defecto: 12)
  full, 2021        - Sincronización completa desde enero 2021
  month [año] [mes] - Sincronizar un mes específico
  current           - Sincronizar solo datos del mes actual
  products          - Sincronizar solo productos
            `);
    }

    await prisma.$disconnect();
}

if (require.main === module) {
    main().catch(error => {
        logError(`Error fatal: ${error.message}`);
        process.exit(1);
    });
}

module.exports = {
    syncYesterday,
    syncInitial,
    syncFull2021,
    syncFullMonth,
    syncCurrentMonthData,
    syncNewProducts,
    syncDaySales
};
