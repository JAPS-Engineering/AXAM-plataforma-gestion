/**
 * Controlador de Ventas Monetarias
 * 
 * Endpoints para análisis de ventas en CLP:
 * - Dashboard de ingresos por producto
 * - KPIs y resúmenes globales
 */

const { getPrismaClient } = require('../prisma/client');
const { getMesActual } = require('../services/rotacionService');
const { logError } = require('../utils/logger');
const { subMonths, getYear, getMonth, format, differenceInMonths, parseISO, addMonths } = require('date-fns');

const prisma = getPrismaClient();

/**
 * Helper: Generar array de meses para un rango
 */
function generateMonthsRangeArray(startYear, startMonth, endYear, endMonth) {
    const months = [];
    let current = new Date(startYear, startMonth - 1, 1);
    const end = new Date(endYear, endMonth - 1, 1);

    // Seguridad: Evitar bucles infinitos si las fechas estan mal
    if (current > end) return [];

    while (current <= end) {
        months.push({
            ano: getYear(current),
            mes: getMonth(current) + 1,
            label: format(current, 'MMM yyyy').toUpperCase()
        });
        current = addMonths(current, 1);
    }
    return months;
}

/**
 * Helper: Parsear rango de fechas desde query params
 * Soporta ?start=YYYY-MM&end=YYYY-MM O ?meses=X
 */
function parseDateParams(query) {
    const { meses, start, end } = query;
    const mesActual = getMesActual();

    // Caso 1: Rango Personalizado
    if (start && end) {
        const startDate = parseISO(`${start}-01`); // YYYY-MM-01
        const endDate = parseISO(`${end}-01`);

        const startYear = getYear(startDate);
        const startMonth = getMonth(startDate) + 1;

        const endYear = getYear(endDate);
        const endMonth = getMonth(endDate) + 1;

        const monthsCount = differenceInMonths(addMonths(endDate, 1), startDate);
        const monthsArray = generateMonthsRangeArray(startYear, startMonth, endYear, endMonth);

        return {
            startYear, startMonth,
            endYear, endMonth,
            monthsCount: monthsCount > 0 ? monthsCount : 1, // Evitar div by zero
            monthsArray,
            isCustom: true
        };
    }

    // Caso 2: Últimos X meses (Default)
    const mesesNum = parseInt(meses || '3', 10);
    // Usamos el "Mes Actual" del sistema (ultima carga) como pivote final
    const today = new Date(mesActual.ano, mesActual.mes - 1, 1);

    // Fecha Inicio = (Hoy - X meses + 1) para incluir el mes actual
    // Ejemplo: Si estamos en Marzo (3) y pido 3 meses: Enero, Feb, Mar.
    // subMonths(Mar 1, 3) -> Dic 1. (Dic, Ene, Feb, Mar = 4 meses).
    // Queremos subMonths(Mar 1, 2) -> Ene 1.
    const startDate = subMonths(today, mesesNum - 1);

    const startYear = getYear(startDate);
    const startMonth = getMonth(startDate) + 1;
    const endYear = mesActual.ano;
    const endMonth = mesActual.mes;

    const monthsArray = generateMonthsRangeArray(startYear, startMonth, endYear, endMonth);

    return {
        startYear, startMonth,
        endYear, endMonth,
        monthsCount: mesesNum,
        monthsArray,
        isCustom: false
    };
}

/**
 * GET /api/ventas/dashboard
 * Dashboard de ventas monetarias por producto (Tabla detallada)
 * Mantiene compatibilidad con parametro 'meses'
 */
async function getVentasDashboard(req, res) {
    try {
        const { meses = 3, marca } = req.query;
        // Reutilizamos la logica de parsing para ser consistentes, aunque este endpoint no fue el foco del cambio
        // pero mejora la consistencia.
        const { startYear, startMonth, endYear, endMonth, monthsArray } = parseDateParams(req.query);

        // Date Filter for Prisma
        // Complex OR logic for ranges
        const dateFilterSql = {
            AND: [
                { OR: [{ ano: { gt: startYear } }, { ano: startYear, mes: { gte: startMonth } }] },
                { OR: [{ ano: { lt: endYear } }, { ano: endYear, mes: { lte: endMonth } }] }
            ]
        };

        const filtroMarca = marca ? { sku: { startsWith: marca.toUpperCase() } } : {};

        const productosDB = await prisma.producto.findMany({
            where: filtroMarca,
            include: {
                ventasHistoricas: { where: dateFilterSql, orderBy: [{ ano: 'asc' }, { mes: 'asc' }] },
                ventasActuales: true
            },
            orderBy: { sku: 'asc' }
        });

        let totalMontoGlobal = 0;
        const rows = productosDB.map(producto => {
            const ventasHistoricas = producto.ventasHistoricas || [];
            const ventaActualDB = producto.ventasActuales?.[0] || null; // Ojo: ventaActuales podría estar fuera del rango historico si el rango es custom pasado?
            // En este modelo, ventasActuales es una tabla separada que siempre tiene el "mes en curso".

            const ventasPorMes = {};
            for (const venta of ventasHistoricas) {
                const key = `${venta.ano}-${venta.mes}`;
                ventasPorMes[key] = { cantidad: venta.cantidadVendida, montoNeto: venta.montoNeto };
            }

            const ventasMeses = monthsArray.map(m => {
                const data = ventasPorMes[`${m.ano}-${m.mes}`] || { cantidad: 0, montoNeto: 0 };
                return { ano: m.ano, mes: m.mes, label: m.label, cantidad: data.cantidad, montoNeto: data.montoNeto };
            });

            const totalMonto = ventasMeses.reduce((sum, v) => sum + v.montoNeto, 0);
            const totalCantidad = ventasMeses.reduce((sum, v) => sum + v.cantidad, 0);
            totalMontoGlobal += totalMonto;

            return {
                producto: { id: producto.id, sku: producto.sku, descripcion: producto.descripcion, familia: producto.familia },
                ventasMeses, totalMonto, totalCantidad,
                promedioMonto: parseFloat((totalMonto / ventasMeses.length).toFixed(0)),
                promedioCantidad: parseFloat((totalCantidad / ventasMeses.length).toFixed(2)),
                mesActual: {
                    ano: endYear, // Proxy aproximado
                    mes: endMonth,
                    montoVendido: ventaActualDB?.montoNeto || 0,
                    cantidadVendida: ventaActualDB?.cantidadVendida || 0
                }
            };
        });

        const rowsConVentas = rows.filter(r => r.totalMonto > 0);

        res.json({
            meta: {
                mesesConsultados: monthsArray.length,
                marca: marca || null,
                mesActual: { ano: endYear, mes: endMonth },
                columnas: monthsArray.map(m => m.label),
                totalProductos: rowsConVentas.length,
                totalMontoPeriodo: totalMontoGlobal,
                promedioMontoPeriodo: parseFloat((totalMontoGlobal / monthsArray.length).toFixed(0)),
                generadoEn: new Date().toISOString()
            },
            productos: rowsConVentas
        });

    } catch (error) {
        logError(`Error en getVentasDashboard: ${error.message}`);
        res.status(500).json({ error: 'Error al obtener datos de ventas', message: error.message });
    }
}

/**
 * GET /api/ventas/resumen
 * KPIs globales de ventas. Soporta ?start=YYYY-MM&end=YYYY-MM
 */
async function getVentasResumen(req, res) {
    try {
        const { startYear, startMonth, endYear, endMonth, monthsCount, monthsArray } = parseDateParams(req.query);

        const whereDateClause = {
            AND: [
                { OR: [{ ano: { gt: startYear } }, { ano: startYear, mes: { gte: startMonth } }] },
                { OR: [{ ano: { lt: endYear } }, { ano: endYear, mes: { lte: endMonth } }] }
            ]
        };

        const ventasPorMes = await prisma.ventaHistorica.groupBy({
            by: ['ano', 'mes'],
            _sum: { montoNeto: true, cantidadVendida: true },
            where: whereDateClause,
            orderBy: [{ ano: 'asc' }, { mes: 'asc' }]
        });

        const topProductos = await prisma.ventaHistorica.groupBy({
            by: ['productoId'],
            _sum: { montoNeto: true, cantidadVendida: true },
            where: whereDateClause,
            orderBy: { _sum: { montoNeto: 'desc' } },
            take: 10
        });

        const productosInfo = await prisma.producto.findMany({
            where: { id: { in: topProductos.map(p => p.productoId) } },
            select: { id: true, sku: true, descripcion: true }
        });

        const productosMap = new Map(productosInfo.map(p => [p.id, p]));

        const topProductosFormateado = topProductos.map(item => ({
            producto: productosMap.get(item.productoId) || { sku: 'N/A', descripcion: 'N/A' },
            totalMonto: item._sum.montoNeto || 0,
            totalCantidad: item._sum.cantidadVendida || 0
        }));

        const totalMonto = ventasPorMes.reduce((sum, v) => sum + (v._sum.montoNeto || 0), 0);
        const promedioMensual = totalMonto / monthsCount;

        const ventasMensuales = monthsArray.map(m => {
            const found = ventasPorMes.find(v => v.ano === m.ano && v.mes === m.mes);
            return {
                label: m.label,
                ano: m.ano,
                mes: m.mes,
                montoNeto: found?._sum.montoNeto || 0,
                cantidad: found?._sum.cantidadVendida || 0
            };
        });

        const ultimoMes = ventasMensuales[ventasMensuales.length - 1];
        const crecimiento = promedioMensual > 0
            ? ((ultimoMes.montoNeto - promedioMensual) / promedioMensual) * 100
            : 0;

        res.json({
            kpis: {
                totalMonto,
                promedioMensual: parseFloat(promedioMensual.toFixed(0)),
                crecimiento: parseFloat(crecimiento.toFixed(1)),
                topProducto: topProductosFormateado[0] || null
            },
            ventasMensuales,
            topProductos: topProductosFormateado,
            meta: {
                monthsCount,
                range: `${startYear}-${startMonth} to ${endYear}-${endMonth}`,
                generadoEn: new Date().toISOString()
            }
        });

    } catch (error) {
        logError(`Error en getVentasResumen: ${error.message}`);
        res.status(500).json({ error: 'Error al obtener resumen de ventas', message: error.message });
    }
}


/**
 * GET /api/ventas/graficos-avanzados
 * Datos agregados. MarketShare responde a filtros custom. RendimientoAnual es fijo.
 */
async function getGraficosAvanzados(req, res) {
    try {
        const { startYear, startMonth, endYear, endMonth } = parseDateParams(req.query);

        const mesActualObj = getMesActual();
        const anoActual = mesActualObj.ano;
        const anoAnterior = anoActual - 1;

        // SQL WHERE para rangos en queries RAW
        const dateFilterSql = `
            AND (
                (v.ano > ${startYear} OR (v.ano = ${startYear} AND v.mes >= ${startMonth}))
                AND
                (v.ano < ${endYear} OR (v.ano = ${endYear} AND v.mes <= ${endMonth}))
            )
        `;

        // 1. Ventas por Familia (Filtrado)
        const ventasPorFamiliaResult = await prisma.$queryRawUnsafe(`
            SELECT p.familia, SUM(v.monto_neto) as totalMonto, SUM(v.cantidad_vendida) as totalCantidad
            FROM ventas_mensuales v
            JOIN productos p ON v.producto_id = p.id
            WHERE 1=1 ${dateFilterSql}
            GROUP BY p.familia
            ORDER BY totalMonto DESC
        `);

        // 2. Market Share (Filtrado)
        const ventasPorFamiliaShareResult = await prisma.$queryRawUnsafe(`
            SELECT 
                CASE WHEN p.familia IS NULL OR p.familia = '' THEN 'Sin Familia' ELSE p.familia END as name, 
                SUM(v.monto_neto) as value
            FROM ventas_mensuales v
            JOIN productos p ON v.producto_id = p.id
            WHERE 1=1 ${dateFilterSql}
            GROUP BY name
            ORDER BY value DESC
        `);

        // 3. Ventas por Vendedor (Filtrado)
        const ventasPorVendedorResult = await prisma.$queryRawUnsafe(`
            SELECT 
                CASE WHEN v.vendedor IS NULL OR v.vendedor = '' THEN 'Sin Vendedor' ELSE v.vendedor END as name, 
                SUM(v.monto_neto) as value
            FROM ventas_mensuales v
            WHERE 1=1 ${dateFilterSql}
            GROUP BY name
            ORDER BY value DESC
            LIMIT 10
        `);

        // 4. Rendimiento Anual (FIJO AÑO ACTUAL vs ANTERIOR)
        const rendimientoAnualResult = await prisma.$queryRaw`
            SELECT ano, mes, SUM(monto_neto) as totalMonto
            FROM ventas_mensuales v
            WHERE ano IN (${anoActual}, ${anoAnterior})
            GROUP BY ano, mes
            ORDER BY ano ASC, mes ASC
        `;

        const formatBigInt = (items) => items.map(item => {
            const newItem = { ...item };
            for (const key in newItem) {
                if (typeof newItem[key] === 'bigint') {
                    newItem[key] = Number(newItem[key]);
                }
            }
            return newItem;
        });

        const ventasPorFamilia = formatBigInt(ventasPorFamiliaResult);
        const marketShareRaw = formatBigInt(ventasPorFamiliaShareResult);
        const ventasPorVendedor = formatBigInt(ventasPorVendedorResult);
        const rendimientoRaw = formatBigInt(rendimientoAnualResult);

        const totalVentaPeriodo = ventasPorFamilia.reduce((acc, curr) => acc + curr.totalMonto, 0);

        const marketShare = marketShareRaw.map(f => ({
            name: f.name,
            value: f.value,
            percentage: totalVentaPeriodo ? ((f.value / totalVentaPeriodo) * 100).toFixed(1) : 0
        }));

        const comparativaAnual = [];
        let acumActual = 0;
        let acumAnterior = 0;

        for (let m = 1; m <= 12; m++) {
            const valActual = rendimientoRaw.find(r => r.ano === anoActual && r.mes === m)?.totalMonto || 0;
            const valAnterior = rendimientoRaw.find(r => r.ano === anoAnterior && r.mes === m)?.totalMonto || 0;

            // Solo sumar si ya pasó (o es actual) para no proyectar ceros futuros como caídas?
            // Dejamos logica simple cumulativa
            acumActual += valActual;
            acumAnterior += valAnterior;

            comparativaAnual.push({
                mes: m,
                mensualActual: valActual,
                acumuladoActual: acumActual,
                mensualAnterior: valAnterior,
                acumuladoAnterior: acumAnterior
            });
        }

        res.json({
            ventasPorFamilia,
            marketShare,
            ventasPorVendedor,
            rendimientoAnual: comparativaAnual,
            meta: { anoActual, anoAnterior, totalVentaPeriodo }
        });

    } catch (error) {
        logError(`Error en getGraficosAvanzados: ${error.message}`);
        res.status(500).json({ error: 'Error al obtener gráficos avanzados', message: error.message });
    }
}


/**
 * GET /api/ventas/tendencias
 * Evolución de ventas. Mantiene lógica original si no se pasan fechas, o usa fechas si se pasan?
 * El usuario pidió NO afectar tendencias por fechas custom ("claramente toman todo el año").
 * Mantendremos logica de "meses" (default 6 or 12).
 */
async function getVentasTendencias(req, res) {
    try {
        const { startYear, startMonth, endYear, endMonth, monthsCount, monthsArray } = parseDateParams(req.query);

        // SQL WHERE para rangos
        const dateFilterSql = `
            AND (
                (v.ano > ${startYear} OR (v.ano = ${startYear} AND v.mes >= ${startMonth}))
                AND
                (v.ano < ${endYear} OR (v.ano = ${endYear} AND v.mes <= ${endMonth}))
            )
        `;

        const tendenciasResult = await prisma.$queryRawUnsafe(`
            SELECT 
                v.ano,
                v.mes,
                CASE WHEN p.familia IS NULL OR p.familia = '' THEN 'Sin Familia' ELSE p.familia END as familia,
                SUM(v.monto_neto) as totalMonto,
                SUM(v.cantidad_vendida) as totalCantidad
            FROM ventas_mensuales v
            JOIN productos p ON v.producto_id = p.id
            WHERE 1=1 ${dateFilterSql}
            GROUP BY v.ano, v.mes, familia
            ORDER BY v.ano ASC, v.mes ASC
        `);

        const formatBigInt = (items) => items.map(item => ({
            ano: item.ano,
            mes: item.mes,
            familia: item.familia,
            totalMonto: Number(item.totalMonto),
            totalCantidad: Number(item.totalCantidad)
        }));

        const rawData = formatBigInt(tendenciasResult);
        const pivotData = monthsArray.map(m => {
            const monthData = { label: m.label, ano: m.ano, mes: m.mes, totalMonto: 0, totalCantidad: 0 };
            const registrosMes = rawData.filter(r => r.ano === m.ano && r.mes === m.mes);
            registrosMes.forEach(r => {
                monthData[r.familia] = { monto: r.totalMonto, cantidad: r.totalCantidad };
                monthData.totalMonto += r.totalMonto;
                monthData.totalCantidad += r.totalCantidad;
            });
            return monthData;
        });

        const familiasEncontradas = [...new Set(rawData.map(r => r.familia))].sort();

        res.json({ tendencias: pivotData, familias: familiasEncontradas, meta: { mesesConsultados: monthsCount } });

    } catch (error) {
        logError(`Error en getVentasTendencias: ${error.message}`);
        res.status(500).json({ error: 'Error al obtener tendencias', message: error.message });
    }
}

module.exports = {
    getVentasDashboard,
    getVentasResumen,
    getGraficosAvanzados,
    getVentasTendencias
};
