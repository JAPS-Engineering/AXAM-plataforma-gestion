/**
 * Controlador del Dashboard de Compras
 * 
 * Endpoint principal que combina:
 * - Ventas históricas (últimos N meses desde DB)
 * - Ventas del mes actual (desde DB)
 * - Stock actual (desde DB, actualizado por cron)
 * - Cálculo de compra sugerida
 */

const { getPrismaClient } = require('../prisma/client');
const { getMesActual } = require('../services/rotacionService');
const { logError, logInfo, logSuccess } = require('../utils/logger');
const { subMonths, getYear, getMonth, format } = require('date-fns');
const { getChileDate } = require('../utils/timezone');
const { getAllSales, aggregateSalesByProduct } = require('../services/salesService');
const { syncYesterday, syncNewProducts, syncDaySales, syncCurrentMonthData } = require('../scripts/syncDaily');
const { syncCurrentMonth: syncComprasCurrentMonth } = require('../scripts/syncCompras');
const { syncAllProviders } = require('../services/providerService');
const { subDays } = require('date-fns');
const { registrarSync, getSyncLogs } = require('../services/syncLogService');

const prisma = getPrismaClient();

/**
 * Generar array de meses para el rango solicitado
 */
function generateMonthsArray(mesesNum) {
    const today = new Date();
    const months = [];

    // Generar desde el mes más antiguo hasta el mes anterior al actual
    for (let i = mesesNum; i >= 1; i--) {
        const date = subMonths(today, i);
        months.push({
            ano: getYear(date),
            mes: getMonth(date) + 1,
            label: format(date, 'MMM yyyy').toUpperCase()
        });
    }

    return months;
}

/**
 * GET /api/dashboard
 * 
 * Endpoint principal del dashboard de compras
 * 
 * Query params:
 * - meses: 3 | 6 | 12 (período para el promedio y columnas visibles)
 * - marca: string (filtro opcional por prefijo SKU)
 */
const isSyncing = { value: false };

async function getDashboard(req, res) {
    try {
        const { meses = 3, marca, frequency = 'MONTHLY', live = 'true' } = req.query;
        // console.log(`Dashboard Request: meses=${meses}, marca=${marca}, freq=${frequency}`); // Uncomment for debug


        // Validar parámetros
        const mesesNum = parseInt(meses, 10);

        // Validar frecuencia
        if (!['MONTHLY', 'WEEKLY'].includes(frequency)) {
            return res.status(400).json({ error: 'Frecuencia inválida. Use MONTHLY o WEEKLY' });
        }

        // Validar meses según frecuencia (para weekly aceptamos 4, 8, 12 semanas)
        const validPeriods = frequency === 'WEEKLY' ? [4, 8, 12] : [3, 6, 12];
        const mesActual = getMesActual();

        let headerLabels = [];
        let filtroFecha = {};

        // ==========================================
        // LÓGICA SEMANAL VS MENSUAL
        // ==========================================
        if (frequency === 'WEEKLY') {
            const { getISOWeek, getYear, subWeeks } = require('date-fns');
            const now = new Date();

            // Generar headers para las últimas N semanas 
            const weeksArray = [];
            for (let i = mesesNum; i >= 1; i--) {
                const date = subWeeks(now, i);
                const w = getISOWeek(date);
                const y = getYear(date);
                weeksArray.push({
                    ano: y,
                    semana: w,
                    label: `S${w}`
                });
            }
            headerLabels = weeksArray.map(w => w.label);

            const yearRef = weeksArray[0].ano;
            filtroFecha = {
                ano: { gte: yearRef - 1 }
            };

        } else {
            // LÓGICA MENSUAL (Original)
            const monthsArray = generateMonthsArray(mesesNum);
            headerLabels = monthsArray.map(m => m.label);

            // Construir filtro de fecha para ventas históricas
            const fechaInicio = subMonths(new Date(mesActual.ano, mesActual.mes - 1, 1), mesesNum);
            const anoInicio = getYear(fechaInicio);
            const mesInicio = getMonth(fechaInicio) + 1;

            filtroFecha = {
                AND: [
                    // Anterior al mes actual
                    {
                        OR: [
                            { ano: { lt: mesActual.ano } },
                            { ano: mesActual.ano, mes: { lt: mesActual.mes } }
                        ]
                    },
                    // Desde el mes de inicio
                    {
                        OR: [
                            { ano: { gt: anoInicio } },
                            { ano: anoInicio, mes: { gte: mesInicio } }
                        ]
                    }
                ]
            };
        }

        // Filtro de marca
        const filtroMarca = marca ? {
            sku: { startsWith: marca.toUpperCase() }
        } : {};

        // ==========================================
        // OBTENER VENTAS DE HOY (LIVE GAP FILLING)
        // ==========================================
        const today = getChileDate();
        const startOfToday = new Date(today);
        startOfToday.setHours(0, 0, 0, 0);
        const now = new Date(today);

        let ventasHoyMap = new Map();

        // Solo obtener ventas live del ERP en modo MENSUAL.
        // En modo SEMANAL, los datos ya están en la DB (tabla ventasSemanales),
        // no necesitamos llamar a la API del ERP y evitamos errores 429.
        if (live !== 'false' && frequency !== 'WEEKLY') {
            try {
                const docsHoy = await getAllSales(startOfToday, now);
                ventasHoyMap = aggregateSalesByProduct(docsHoy);
            } catch (error) {
                logError(`Dashboard warning: Error obteniendo ventas live: ${error.message}`);
            }
        }

        // ==========================================
        // QUERY A LA BASE DE DATOS
        // ==========================================

        // Preparar include dinámico según frecuencia
        const includeQuery = {
            ventasActuales: true,
            pedidos: {
                where: {
                    ano: mesActual.ano,
                    mes: mesActual.mes
                }
            }
        };

        if (frequency === 'WEEKLY') {
            includeQuery.ventasSemanales = {
                where: filtroFecha,
                orderBy: [{ ano: 'asc' }, { semana: 'asc' }]
            };
        } else {
            includeQuery.ventasHistoricas = {
                where: filtroFecha,
                orderBy: [{ ano: 'asc' }, { mes: 'asc' }]
            };
        }

        const productosDB = await prisma.producto.findMany({
            where: filtroMarca,
            include: includeQuery,
            orderBy: { sku: 'asc' }
        });

        // ==========================================
        // PROCESAMIENTO
        // ==========================================

        const rows = productosDB.map(producto => {
            const ventasActualesDB = producto.ventasActuales || [];
            const pedidoActual = producto.pedidos?.[0] || null;

            // Datos actuales
            let cantidadMesActual = ventasActualesDB.reduce((sum, v) => sum + (v.cantidadVendida || 0), 0);
            const stockActual = ventasActualesDB.length > 0 ? ventasActualesDB[0].stockActual : 0;
            const stockMinimo = producto.stockMinimo;

            // Sumar ventas live de HOY
            const ventaHoy = ventasHoyMap.get(producto.sku);
            if (ventaHoy) {
                cantidadMesActual += ventaHoy.cantidad;
            }

            let dataPoints = [];
            let promedio = 0;
            let compraSugerida = 0;

            if (frequency === 'WEEKLY') {
                const ventasSemanales = producto.ventasSemanales || [];
                const { getISOWeek, getYear, subWeeks } = require('date-fns');
                const now = new Date();

                // Generar las N semanas atrás
                const targetWeeks = [];
                for (let i = mesesNum; i >= 1; i--) {
                    const d = subWeeks(now, i);
                    targetWeeks.push({ y: getYear(d), w: getISOWeek(d) });
                }

                // Mapear ventas a las semanas objetivo
                const ventasMap = new Map();
                ventasSemanales.forEach(v => ventasMap.set(`${v.ano}-${v.semana}`, v.cantidadVendida));

                dataPoints = targetWeeks.map(t => ({
                    ano: t.y,
                    mes: t.w, // Reusamos campo mes para semana en frontend o ajustamos tipo
                    label: `S${t.w}`,
                    cantidad: ventasMap.get(`${t.y}-${t.w}`) || 0
                }));

                // Promedio Semanal
                const totalCant = dataPoints.reduce((sum, p) => sum + p.cantidad, 0);
                promedio = totalCant / dataPoints.length;

                // Sugerido Semanal
                // Cobertura deseada por defecto (ej. 4 semanas ~ 1 mes)
                // Usamos la misma lógica base: (Promedio * Cobertura) - Stock
                const semanasCobertura = 4;
                let sugeridoBase = (promedio * semanasCobertura) - stockActual;

                // Ajuste simple: Restamos lo que ya se vendió esta semana "en curso" (aprox cantidadMesActual / 4)
                // O mejor aun, simplemente Promedio - Stock (cobertura 1 semana)
                // Para mantener consistencia con mensual (que usa meses=6 cobertura=1? No, mensual usa mesesCobertura implicito 1 o parametro)

                // En getDashboard no recibimos mesesCobertura, asumimos lógica standard
                // Mensual: Promedio (1 mes) - Stock - VentaActual

                // Semanal: PromedioSemanal * (Cobetura en Semanas) - Stock
                // Asumamos cobertura de 2 meses = 8 semanas para ser seguros, o 4 semanas.
                // Usemos 4 semanas (1 mes de stock)

                compraSugerida = Math.round((promedio * 4) - stockActual);

            } else {
                // MENSUAL
                const ventasHistoricas = producto.ventasHistoricas || [];
                const monthsArray = generateMonthsArray(mesesNum);

                const ventasPorMes = {};
                for (const v of ventasHistoricas) {
                    ventasPorMes[`${v.ano}-${v.mes}`] = v.cantidadVendida;
                }

                dataPoints = monthsArray.map(m => ({
                    ano: m.ano,
                    mes: m.mes,
                    label: m.label,
                    cantidad: ventasPorMes[`${m.ano}-${m.mes}`] || 0
                }));

                const totalCant = dataPoints.reduce((sum, v) => sum + v.cantidad, 0);
                promedio = totalCant / dataPoints.length;

                // Fórmula estándar mensual
                compraSugerida = Math.round(promedio - stockActual - cantidadMesActual);
            }

            // Lógica común de Stock Óptimo y Mínimo
            if (producto.stockOptimo && producto.stockOptimo > 0) {
                compraSugerida = Math.max(0, producto.stockOptimo - stockActual);
            } else {
                if (stockMinimo !== null && stockMinimo > 0) {
                    const faltaParaMinimo = Math.round(stockMinimo - stockActual);
                    if (faltaParaMinimo > 0) {
                        compraSugerida = Math.max(compraSugerida, faltaParaMinimo);
                    }
                }
            }

            const bajoMinimo = stockMinimo !== null && stockActual < stockMinimo;

            return {
                producto: {
                    id: producto.id,
                    sku: producto.sku,
                    descripcion: producto.descripcion,
                    familia: producto.familia,
                    stockMinimo: stockMinimo,
                    stockOptimo: producto.stockOptimo,
                    dv: producto.dv,
                    costo: producto.precioUltimaCompra,
                    factorEmpaque: producto.factorEmpaque,
                    unidad: producto.unidad,
                    proveedor: producto.proveedor,
                    rutProveedor: producto.rutProveedor
                },
                ventasMeses: dataPoints, // Frontend lo renderizará igual
                promedio: parseFloat(promedio.toFixed(2)),
                mesActual: {
                    ano: mesActual.ano,
                    mes: mesActual.mes,
                    ventaActual: cantidadMesActual, // Ojo: en semanal esto sigue siendo venta MES actual
                    stockActual: stockActual
                },
                compraSugerida,
                bajoMinimo,
                compraRealizar: pedidoActual?.cantidad ?? null,
                tipoCompra: pedidoActual?.tipo || 'OC'
            };
        });


        res.json({
            meta: {
                mesesConsultados: mesesNum,
                marca: marca || null,
                mesActual: mesActual,
                columnas: headerLabels,
                totalProductos: rows.length,
                generadoEn: new Date().toISOString()
            },
            productos: rows
        });

    } catch (error) {
        logError(`Error en getDashboard: ${error.message}`);
        res.status(500).json({
            error: 'Error al obtener datos del dashboard',
            message: error.message
        });
    }
}

/**
 * POST /api/dashboard/orden
 * 
 * Guardar la orden de compra (las cantidades que el usuario decidió comprar)
 */
async function saveOrden(req, res) {
    try {
        const { items } = req.body;

        if (!items || !Array.isArray(items)) {
            return res.status(400).json({
                error: 'Se requiere un array de items con {productoId, cantidad}'
            });
        }

        const mesActual = getMesActual();
        let saved = 0;

        for (const item of items) {
            if (!item.productoId || item.cantidad === undefined) continue;

            await prisma.pedido.upsert({
                where: {
                    productoId_ano_mes: {
                        productoId: item.productoId,
                        ano: mesActual.ano,
                        mes: mesActual.mes
                    }
                },
                update: {
                    cantidad: item.cantidad,
                    tipo: item.tipo || 'OC'
                },
                create: {
                    productoId: item.productoId,
                    ano: mesActual.ano,
                    mes: mesActual.mes,
                    cantidad: item.cantidad,
                    tipo: item.tipo || 'OC'
                }
            });
            saved++;
        }

        res.json({
            success: true,
            message: `${saved} productos guardados en pedido`,
            mes: mesActual
        });

    } catch (error) {
        logError(`Error en saveOrden: ${error.message}`);
        res.status(500).json({
            error: 'Error al guardar orden',
            message: error.message
        });
    }
}

/**
 * DELETE /api/dashboard/orden/reset
 * 
 * Resetear todas las órdenes de compra del mes actual (poner a 0)
 */
async function resetOrdenes(req, res) {
    try {
        const mesActual = getMesActual();

        // Eliminar todos los pedidos del mes actual
        const result = await prisma.pedido.deleteMany({
            where: {
                ano: mesActual.ano,
                mes: mesActual.mes
            }
        });

        logSuccess(`Reset: ${result.count} pedidos eliminados del mes ${mesActual.mes}/${mesActual.ano}`);

        res.json({
            success: true,
            message: `${result.count} pedidos reseteados`,
            mes: mesActual
        });

    } catch (error) {
        logError(`Error en resetOrdenes: ${error.message}`);
        res.status(500).json({
            error: 'Error al resetear órdenes',
            message: error.message
        });
    }
}

/**
 * GET /api/dashboard/sync-status
 * 
 * Obtener estado de la última sincronización
 */
async function getSyncStatus(req, res) {
    try {
        const lastUpdate = await prisma.ventaActual.findFirst({
            orderBy: { updatedAt: 'desc' },
            select: { updatedAt: true }
        });

        const stats = await prisma.$transaction([
            prisma.producto.count(),
            prisma.ventaHistorica.count(),
            prisma.ventaActual.count()
        ]);

        res.json({
            lastSync: lastUpdate?.updatedAt || null,
            stats: {
                productos: stats[0],
                ventasHistoricas: stats[1],
                ventasActuales: stats[2]
            }
        });

    } catch (error) {
        logError(`Error en getSyncStatus: ${error.message}`);
        res.status(500).json({
            error: 'Error al obtener estado de sincronización',
            message: error.message
        });
    }
}

/**
 * GET /api/dashboard/sync-history
 * 
 * Obtener historial de sincronizaciones
 */
async function getSyncHistory(req, res) {
    try {
        const { limit = 50, tipo } = req.query;
        const limitNum = parseInt(limit, 10);

        const logs = await getSyncLogs(limitNum, tipo || null);

        res.json({
            logs,
            total: logs.length
        });

    } catch (error) {
        logError(`Error en getSyncHistory: ${error.message}`);
        res.status(500).json({
            error: 'Error al obtener historial de sincronización',
            message: error.message
        });
    }
}

/**
 * GET /api/dashboard/sync-stream
 * 
 * Stream de eventos (SSE) para progreso de sincronización
 */
async function syncStream(req, res) {
    // Headers SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    if (isSyncing.value) {
        logWarning('Sync requested but already in progress');
        res.write(`data: ${JSON.stringify({ step: 'error', message: 'Sincronización en curso. Intente nuevamente.' })}\n\n`);
        res.end();
        return;
    }

    isSyncing.value = true;

    const sendEvent = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const mesActual = getMesActual();

    try {
        sendEvent({ step: 'start', message: 'Iniciando proceso...' }); // This line was added based on the instruction.
        logInfo('Iniciando stream de sincronización...');
        sendEvent({ step: 'start', message: 'Conectando con Manager+...' });

        // 1. Productos
        sendEvent({ step: 'products', message: 'Buscando nuevos productos...' });
        const prodStats = await syncNewProducts();
        sendEvent({
            step: 'products_done',
            message: `Catálogo: ${prodStats.created} nuevos, ${prodStats.updated} actualizados`
        });

        // Registrar log de productos si hubo cambios
        if (prodStats.created > 0 || prodStats.updated > 0) {
            await registrarSync('productos', {
                mesTarget: mesActual.mes,
                anoTarget: mesActual.ano,
                productos: prodStats.created + prodStats.updated
            }, `${prodStats.created} nuevos, ${prodStats.updated} actualizados`);
        }

        // 2. Datos mes actual (Ventas + Stock) - incluir ventas hasta AHORA
        sendEvent({ step: 'data', message: 'Obteniendo ventas y stock del mes actual...' });
        const dataStats = await syncCurrentMonthData(false);  // false = SOLO hasta ayer (para evitar doble conteo con live dashboard)
        sendEvent({
            step: 'data_done',
            message: `${dataStats.productosConVentas} productos con ventas, ${dataStats.updated} actualizados`
        });

        // Registrar log de ventas del mes actual
        // productosConVentas = productos con ventas en el mes (hasta ahora, incluyendo hoy)
        await registrarSync('ventas_actuales', {
            mesTarget: mesActual.mes,
            anoTarget: mesActual.ano,
            productos: dataStats.updated || 0,
            productosConVentas: dataStats.productosConVentas || 0  // Productos con ventas del mes
        }, `Sincronización manual desde dashboard`);

        // 3. Compras del mes actual
        sendEvent({ step: 'purchases', message: 'Sincronizando compras del mes actual...' });
        try {
            const comprasStats = await syncComprasCurrentMonth();
            sendEvent({
                step: 'purchases_done',
                message: `${comprasStats.processed} compras, ${comprasStats.updated} costos actualizados`
            });
        } catch (comprasError) {
            sendEvent({
                step: 'purchases_warning',
                message: `Compras: ${comprasError.message}`
            });
        }

        // 4. Sincronizar proveedores desde el historial
        sendEvent({ step: 'providers', message: 'Sincronizando proveedores desde historial...' });
        try {
            const providerStats = await syncAllProviders();
            sendEvent({
                step: 'providers_done',
                message: `${providerStats.actualizados} proveedores actualizados`
            });
        } catch (providerError) {
            sendEvent({
                step: 'providers_warning',
                message: `Proveedores: ${providerError.message}`
            });
        }

        sendEvent({ step: 'complete', message: '¡Sincronización finalizada!' });
        isSyncing.value = false;
        res.end();

    } catch (error) {
        logError(`Error en stream: ${error.message}`);
        sendEvent({ step: 'error', message: `Error: ${error.message}` });
        isSyncing.value = false;
        res.end();
    }
}

module.exports = {
    getDashboard,
    saveOrden,
    resetOrdenes,
    getSyncStatus,
    getSyncHistory,
    syncStream
};
