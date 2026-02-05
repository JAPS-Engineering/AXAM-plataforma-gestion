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
const { getDailySales, getMonthlySales, getWeeklySales, getCurrentStock, getAllProducts, getWhiteListSKUs } = require('../services/salesService');

const prisma = getPrismaClient();

/**
 * Sincronizar productos desde el ERP (usando Prisma)
 * Versión simplificada que usa el mismo cliente de base de datos que el resto de la app
 */
async function syncNewProducts() {
    logSection('SINCRONIZANDO PRODUCTOS');

    try {
        // 1. Obtener productos del ERP
        const erpProducts = await getAllProducts();
        logInfo(`Obtenidos ${erpProducts.length} productos del ERP`);

        if (erpProducts.length === 0) {
            logWarning('No se encontraron productos en el ERP');
            return { created: 0, updated: 0 };
        }

        // 1.5 Filtrar por White List (Lista Mayorista ID 89)
        const whiteList = await getWhiteListSKUs();
        let productsToProcess = erpProducts;

        if (whiteList) {
            productsToProcess = erpProducts.filter(p => {
                const sku = (p.codigo_prod || p.cod_producto || p.codigo || p.sku || '').trim();
                return whiteList.has(sku);
            });
            logInfo(`Filtrado: ${productsToProcess.length} productos permitidos (de ${erpProducts.length})`);
        }

        let created = 0;
        let updated = 0;

        // 2. Obtener todos los productos existentes en DB para comparar en memoria
        // Esto evita hacer un query por cada producto del ERP (N+1 problem)
        const existingProducts = await prisma.producto.findMany({
            select: { sku: true, descripcion: true, familia: true, proveedor: true }
        });

        const existingMap = new Map();
        existingProducts.forEach(p => existingMap.set(p.sku, p));

        logInfo(`Productos en DB local: ${existingProducts.length}`);

        const updates = [];
        const creates = [];

        // 3. Comparar y preparar operaciones
        for (const product of productsToProcess) {
            const sku = (product.codigo_prod || product.cod_producto || product.codigo || product.sku || '').trim();
            const descripcion = (product.nombre || product.descripcion || '').trim();
            const familia = (product.familia || product.cod_familia || '').trim();
            const proveedor = (product.proveedor || product.nombre_proveedor || '').trim();

            if (!sku || !descripcion) continue;

            const existing = existingMap.get(sku);

            if (existing) {
                // Actualizar solo si hay cambios en campos clave
                if (existing.descripcion !== descripcion || existing.familia !== familia) {
                    updates.push(prisma.producto.update({
                        where: { sku },
                        data: { descripcion, familia, proveedor }
                    }));
                }
            } else {
                // Crear nuevo producto
                creates.push(prisma.producto.create({
                    data: { sku, descripcion, familia, proveedor }
                }));
            }
        }

        // 4. Ejecutar operaciones en paralelo (por partes si son muchas)
        // Usamos transacciones o Promise.all
        if (creates.length > 0) {
            logInfo(`Creando ${creates.length} nuevos productos...`);
            // Batch create logic could be used here if supported, but simple loop is fine for now
            // For safety with transaction limits, we process in chunks of 50
            for (let i = 0; i < creates.length; i += 50) {
                await Promise.all(creates.slice(i, i + 50));
            }
        }

        if (updates.length > 0) {
            logInfo(`Actualizando ${updates.length} productos...`);
            for (let i = 0; i < updates.length; i += 50) {
                await Promise.all(updates.slice(i, i + 50));
            }
        }

        created = creates.length;
        updated = updates.length;

        logSuccess(`Productos: ${created} nuevos, ${updated} actualizados`);
        return { created, updated };

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

        // Optimización: Obtener todos los productos y vendedores en memoria
        const allProducts = await prisma.producto.findMany({ select: { id: true, sku: true } });
        const productMap = new Map(allProducts.map(p => [p.sku, p.id]));

        // Optimización vendedores: Upsert solo si no existen (o caché simple)
        const activeVendedores = new Set((await prisma.vendedor.findMany({ select: { codigo: true } })).map(v => v.codigo));

        const ventasAInsertar = [];
        const vendedoresVistos = new Set(); // Para no intentar upsert el mismo vendedor multiples veces en este loop

        for (const [key, data] of monthlySales) {
            const { sku, vendedor } = data;
            const productoId = productMap.get(sku);

            if (!productoId) continue;

            const stockActual = stockMap.get(sku) || 0;

            // Gestionar vendedor
            if (vendedor && !vendedoresVistos.has(vendedor)) {
                vendedoresVistos.add(vendedor);
                await prisma.vendedor.upsert({
                    where: { codigo: vendedor },
                    update: { activo: true },
                    create: { codigo: vendedor, nombre: vendedor, activo: true }
                });
            }

            ventasAInsertar.push({
                productoId: productoId,
                vendedor: vendedor || '',
                cantidadVendida: data.cantidad,
                stockActual: stockActual,
                montoNeto: data.montoNeto
            });

            // updated count will be the total length
            productosConVentas++;
        }

        // También actualizar stock para productos sin ventas este mes (pero con stock)
        for (const [sku, stock] of stockMap) {
            if (monthlySales.has(sku)) continue; // Ya procesado

            const productoId = productMap.get(sku);
            if (!productoId) continue;

            ventasAInsertar.push({
                productoId: productoId,
                vendedor: '',
                cantidadVendida: 0,
                stockActual: stock,
                montoNeto: 0
            });
        }

        if (ventasAInsertar.length > 0) {
            logInfo(`Insertando ${ventasAInsertar.length} registros en VentaActual...`);
            // createMany es mucho más rápido
            await prisma.ventaActual.createMany({
                data: ventasAInsertar
            });
            updated = ventasAInsertar.length;
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
    const year = getYear(yesterday);
    const month = getMonth(yesterday) + 1;

    logInfo(`Fecha de sincronización (ayer): ${format(yesterday, 'dd/MM/yyyy')}`);

    try {
        // 1. Sincronizar nuevos productos (con filtro WhiteList)
        await syncNewProducts();

        // 2. Sincronizar MES COMPLETO de ayer para asegurar consistencia (idempotencia)
        // En lugar de sumar solo el día (que podría duplicar si se corre 2 veces),
        // volvemos a calcular el mes completo hasta ayer.
        await syncFullMonth(year, month);

        // 3. Sincronizar Semana actual/anterior
        // Calculate which week "yesterday" belongs to and sync it
        const { getISOWeek } = require('date-fns');
        const week = getISOWeek(yesterday);
        const yYear = year; // Use year of yesterday
        await syncWeek(yYear, week);

        // 3. Actualizar datos del mes actual (stock + ventas acumuladas en VentaActual)
        await syncCurrentMonthData();

        logSection('SINCRONIZACIÓN COMPLETADA');
        logSuccess(`Última sincronización: ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}`);

    } catch (error) {
        logError(`Error en sincronización: ${error.message}`);
        throw error;
    }
}

/**
 * Upsert de venta mensual (Helper individual y para syncFullMonth)
 */
async function upsertMonthlySale(productoId, ano, mes, cantidad, montoNeto, vendedor = '', accumulate = false) {
    const where = { productoId_ano_mes_vendedor: { productoId, ano, mes, vendedor: vendedor || '' } };

    // Check exist
    const existing = await prisma.ventaHistorica.findUnique({ where });

    // Ensure vendedor
    if (vendedor) {
        await prisma.vendedor.upsert({
            where: { codigo: vendedor },
            create: { codigo: vendedor, nombre: vendedor, activo: true },
            update: { activo: true }
        });
    }

    if (existing) {
        const data = accumulate ? {
            cantidadVendida: existing.cantidadVendida + cantidad,
            montoNeto: existing.montoNeto + montoNeto
        } : {
            cantidadVendida: cantidad,
            montoNeto: montoNeto
        };
        await prisma.ventaHistorica.update({ where: { id: existing.id }, data });
    } else {
        await prisma.ventaHistorica.create({
            data: { productoId, ano, mes, vendedor: vendedor || '', cantidadVendida: cantidad, montoNeto }
        });
    }
}

/**
 * Sincronizar mes completo (OPTIMIZADO)
 */
async function syncFullMonth(year, month) {
    logSection(`SINCRONIZANDO MES COMPLETO: ${month}/${year}`);

    try {
        const { sales, documentsCount } = await getMonthlySales(year, month);

        if (sales.size === 0) {
            logWarning(`Sin ventas para ${month}/${year}`);
            return { processed: 0, updated: 0 };
        }

        // 1. Cargar datos necesarios en memoria (Bulk)
        const allProducts = await prisma.producto.findMany({ select: { id: true, sku: true } });
        const productMap = new Map(allProducts.map(p => [p.sku, p.id]));

        // 2. Obtener ventas históricas existentes para este mes (Bulk)
        const existingSales = await prisma.ventaHistorica.findMany({
            where: { ano: year, mes: month }
        });
        const salesMap = new Map();
        existingSales.forEach(s => salesMap.set(`${s.productoId}-${s.vendedor}`, s));

        // 3. Procesar diferencials
        const updates = [];
        const creates = [];
        const vendedoresVistos = new Set();
        const activeVendedores = new Set((await prisma.vendedor.findMany({ select: { codigo: true } })).map(v => v.codigo));

        let updatedCount = 0;

        for (const [key, data] of sales) {
            const { sku, vendedor } = data;

            // Resolver ID de producto
            let productoId = productMap.get(sku);
            if (!productoId) {
                try {
                    const newProd = await prisma.producto.create({
                        data: { sku, descripcion: `Producto ${sku} (Auto-creado)`, familia: 'SIN DEFINIR' }
                    });
                    productoId = newProd.id;
                    productMap.set(sku, productoId); // Cachear
                } catch (e) { continue; }
            }

            // Gestionar Vendedor
            const vendKey = vendedor || '';
            if (vendKey && !vendedoresVistos.has(vendKey)) {
                vendedoresVistos.add(vendKey);
                await prisma.vendedor.upsert({
                    where: { codigo: vendKey },
                    create: { codigo: vendKey, nombre: vendKey, activo: true },
                    update: { activo: true }
                });
            }

            // Logic: OVERWRITE (no accumulate)
            const mapKey = `${productoId}-${vendKey}`;
            const existingRecord = salesMap.get(mapKey);

            if (existingRecord) {
                // Update if changed
                if (existingRecord.cantidadVendida !== data.cantidad || Math.abs(existingRecord.montoNeto - data.montoNeto) > 1) {
                    updates.push(prisma.ventaHistorica.update({
                        where: { id: existingRecord.id },
                        data: { cantidadVendida: data.cantidad, montoNeto: data.montoNeto }
                    }));
                }
            } else {
                // Create
                creates.push(prisma.ventaHistorica.create({
                    data: {
                        productoId,
                        ano: year,
                        mes: month,
                        vendedor: vendKey,
                        cantidadVendida: data.cantidad,
                        montoNeto: data.montoNeto
                    }
                }));
            }
        }

        // Ejecutar Batch
        if (creates.length > 0) {
            for (let i = 0; i < creates.length; i += 50) await Promise.all(creates.slice(i, i + 50));
        }
        if (updates.length > 0) {
            for (let i = 0; i < updates.length; i += 50) await Promise.all(updates.slice(i, i + 50));
        }

        updatedCount = creates.length + updates.length;
        logSuccess(`${documentsCount} documentos procesados, ${updatedCount} registros actualizados en VentaHistorica`);

        return { processed: documentsCount, updated: updatedCount };

    } catch (error) {
        logError(`Error sincronizando ${month}/${year}: ${error.message}`);
        throw error;
    }
}

/**
 * Sincronizar semana específica
 * @param {number} year 
 * @param {number} week 
 */
async function syncWeek(year, week) {
    logSection(`SINCRONIZANDO SEMANA ${week}/${year}`);

    try {
        const { sales, documentsCount } = await getWeeklySales(year, week);

        if (sales.size === 0) {
            logWarning(`Sin ventas para Semana ${week}/${year}`);
            return { processed: 0, updated: 0 };
        }

        // Obtener productos y mapa de IDs
        const allProducts = await prisma.producto.findMany({ select: { id: true, sku: true } });
        const productMap = new Map(allProducts.map(p => [p.sku, p.id]));

        // Obtener ventas existentes para esta semana
        const existingSales = await prisma.ventaSemanal.findMany({
            where: { ano: year, semana: week }
        });
        const salesMap = new Map();
        existingSales.forEach(s => salesMap.set(`${s.productoId}-${s.vendedor || ''}`, s));

        const updates = [];
        const creates = [];
        const vendedoresVistos = new Set();

        for (const [key, data] of sales) {
            const { sku, vendedor } = data;

            let productoId = productMap.get(sku);
            if (!productoId) continue; // Si no existe el producto, se salta (debería existir por syncs previos)

            const vendKey = vendedor || '';
            const mapKey = `${productoId}-${vendKey}`;
            const existingRecord = salesMap.get(mapKey);

            if (existingRecord) {
                // Update
                if (existingRecord.cantidadVendida !== data.cantidad || Math.abs(existingRecord.montoNeto - data.montoNeto) > 1) {
                    updates.push(prisma.ventaSemanal.update({
                        where: { id: existingRecord.id },
                        data: { cantidadVendida: data.cantidad, montoNeto: data.montoNeto }
                    }));
                }
            } else {
                // Create
                creates.push(prisma.ventaSemanal.create({
                    data: {
                        productoId,
                        ano: year,
                        semana: week,
                        vendedor: vendKey,
                        cantidadVendida: data.cantidad,
                        montoNeto: data.montoNeto
                    }
                }));
            }
        }

        // Batch exec
        const batchSize = 50;
        if (creates.length > 0) {
            for (let i = 0; i < creates.length; i += batchSize) await Promise.all(creates.slice(i, i + batchSize));
        }
        if (updates.length > 0) {
            for (let i = 0; i < updates.length; i += batchSize) await Promise.all(updates.slice(i, i + batchSize));
        }

        const updated = creates.length + updates.length;
        logSuccess(`Semana ${week}: ${documentsCount} docs, ${updated} registros actualizados`);
        return { processed: documentsCount, updated };

    } catch (error) {
        logError(`Error sincronizando Semana ${week}: ${error.message}`);
        throw error;
    }
}

/**
 * Sincronizar últimas N semanas
 */
async function syncWeeksBack(weeks = 12) {
    logSection(`SINCRONIZANDO ÚLTIMAS ${weeks} SEMANAS`);
    const { subWeeks, getISOWeek, getYear } = require('date-fns');

    const today = new Date();

    for (let i = 0; i < weeks; i++) {
        const targetDate = subWeeks(today, i);
        const week = getISOWeek(targetDate);
        const year = getYear(targetDate);

        await syncWeek(year, week);
    }

    logSuccess('Sincronización semanal completada');
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
            await syncCurrentMonthData(true); // Include today for manual sync
            break;

        case 'weeks':
            const nWeeks = parseInt(args[1]) || 12;
            await syncWeeksBack(nWeeks);
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
  weeks [N]         - Sincronizar últimas N semanas (default 12)
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
