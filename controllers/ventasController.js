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

const { parseDateParams } = require('../utils/dateUtils');

const prisma = getPrismaClient();

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
                if (!ventasPorMes[key]) {
                    ventasPorMes[key] = { cantidad: 0, montoNeto: 0 };
                }
                ventasPorMes[key].cantidad += (venta.cantidadVendida || 0);
                ventasPorMes[key].montoNeto += (venta.montoNeto || 0);
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
                    ano: endYear,
                    mes: endMonth,
                    montoVendido: producto.ventasActuales?.reduce((sum, v) => sum + (v.montoNeto || 0), 0) || 0,
                    cantidadVendida: producto.ventasActuales?.reduce((sum, v) => sum + (v.cantidadVendida || 0), 0) || 0,
                    stockActual: producto.ventasActuales?.[0]?.stockActual || 0 // Stock suele ser el mismo por producto
                }
            };
        });

        // const rowsConVentas = rows.filter(r => r.totalMonto > 0);
        // Retornamos todos los productos para que el frontend maneje el filtrado (con/sin ventas)
        const rowsFinal = rows;

        res.json({
            meta: {
                mesesConsultados: monthsArray.length,
                marca: marca || null,
                mesActual: { ano: endYear, mes: endMonth },
                columnas: monthsArray.map(m => m.label),
                totalProductos: rowsFinal.length,
                totalMontoPeriodo: totalMontoGlobal,
                promedioMontoPeriodo: parseFloat((totalMontoGlobal / monthsArray.length).toFixed(0)),
                generadoEn: new Date().toISOString()
            },
            productos: rowsFinal
        });

    } catch (error) {
        logError(`Error en getVentasDashboard: ${error.message}`);
        res.status(500).json({ error: 'Error al obtener datos de ventas', message: error.message });
    }
}

async function getVentasResumen(req, res) {
    try {
        const { marca } = req.query;
        const { startYear, startMonth, endYear, endMonth, monthsCount, monthsArray } = parseDateParams(req.query);

        const baseDateClause = [
            { OR: [{ ano: { gt: startYear } }, { ano: startYear, mes: { gte: startMonth } }] },
            { OR: [{ ano: { lt: endYear } }, { ano: endYear, mes: { lte: endMonth } }] }
        ];

        const mesActual = getMesActual(); // { ano, mes }

        // Filtro para Histórica (EXCLUYE mes actual)
        const filterHistorico = {
            AND: [
                ...baseDateClause,
                {
                    OR: [
                        { ano: { lt: mesActual.ano } },
                        { ano: mesActual.ano, mes: { lt: mesActual.mes } }
                    ]
                }
            ]
        };

        if (marca) {
            filterHistorico.AND.push({
                producto: { sku: { startsWith: marca.toUpperCase() } }
            });
        }

        // 1. Obtener Ventas Históricas (Agregado por mes)
        const ventasPorMes = await prisma.ventaHistorica.groupBy({
            by: ['ano', 'mes'],
            _sum: { montoNeto: true, cantidadVendida: true },
            where: filterHistorico,
            orderBy: [{ ano: 'asc' }, { mes: 'asc' }]
        });

        // 2. Obtener Ventas Mes Actual (si está en el rango)
        const isCurrentMonthInRange = (
            (mesActual.ano > startYear || (mesActual.ano === startYear && mesActual.mes >= startMonth)) &&
            (mesActual.ano < endYear || (mesActual.ano === endYear && mesActual.mes <= endMonth))
        );

        if (isCurrentMonthInRange) {
            const whereActual = {};
            if (marca) {
                whereActual.producto = { sku: { startsWith: marca.toUpperCase() } };
            }

            const currentMonthSales = await prisma.ventaActual.aggregate({
                _sum: { montoNeto: true, cantidadVendida: true },
                where: whereActual
            });

            if (currentMonthSales._sum.montoNeto || currentMonthSales._sum.cantidadVendida) {
                ventasPorMes.push({
                    ano: mesActual.ano,
                    mes: mesActual.mes,
                    _sum: {
                        montoNeto: currentMonthSales._sum.montoNeto || 0,
                        cantidadVendida: currentMonthSales._sum.cantidadVendida || 0
                    }
                });
            }
        }

        // 3. Top Productos (Combinando fuentes si es necesario)
        // Por simplicidad para el Top 10, si el rango incluye el mes actual, 
        // priorizamos la histórica pero para reportes de un solo mes (Mes Actual)
        // debemos usar VentaActual.

        let topProductos;
        if (monthsCount === 1 && isCurrentMonthInRange) {
            topProductos = await prisma.ventaActual.groupBy({
                by: ['productoId'],
                _sum: { montoNeto: true, cantidadVendida: true },
                where: marca ? { producto: { sku: { startsWith: marca.toUpperCase() } } } : {},
                orderBy: { _sum: { montoNeto: 'desc' } },
                take: 10
            });
        } else {
            topProductos = await prisma.ventaHistorica.groupBy({
                by: ['productoId'],
                _sum: { montoNeto: true, cantidadVendida: true },
                where: filterHistorico,
                orderBy: { _sum: { montoNeto: 'desc' } },
                take: 10
            });
        }

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

async function getGraficosAvanzados(req, res) {
    try {
        const { marca } = req.query;
        const { startYear, startMonth, endYear, endMonth } = parseDateParams(req.query);

        const mesActualObj = getMesActual();
        const anoActual = mesActualObj.ano;
        const anoAnterior = anoActual - 1;

        // SQL WHERE para rangos en queries RAW
        let dateFilterSql = `
            AND (
                (v.ano > ${startYear} OR (v.ano = ${startYear} AND v.mes >= ${startMonth}))
                AND
                (v.ano < ${endYear} OR (v.ano = ${endYear} AND v.mes <= ${endMonth}))
            )
        `;

        if (marca) {
            dateFilterSql += ` AND p.sku LIKE '${marca.toUpperCase()}%' `;
        }

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

        // 3. Ventas por Vendedor (Filtrado) - AHORA CON APODOS
        const ventasPorVendedorResult = await prisma.$queryRawUnsafe(`
            SELECT 
                COALESCE(NULLIF(ven.nombre, ''), v.vendedor) as name, 
                SUM(v.monto_neto) as value
            FROM ventas_mensuales v
            LEFT JOIN vendedores ven ON v.vendedor = ven.codigo
            JOIN productos p ON v.producto_id = p.id
            WHERE 1=1 ${dateFilterSql}
            GROUP BY v.vendedor, name
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

async function getVentasTendencias(req, res) {
    try {
        const { marca } = req.query;
        const { startYear, startMonth, endYear, endMonth, monthsCount, monthsArray } = parseDateParams(req.query);
        const mesActual = getMesActual();

        // 1. Histórica (Excluyendo Mes Actual para evitar duplicados o datos viejos)
        let dateFilterSqlHistorico = `
            AND (
                (v.ano > ${startYear} OR (v.ano = ${startYear} AND v.mes >= ${startMonth}))
                AND
                (v.ano < ${endYear} OR (v.ano = ${endYear} AND v.mes <= ${endMonth}))
            )
            AND (v.ano < ${mesActual.ano} OR (v.ano = ${mesActual.ano} AND v.mes < ${mesActual.mes}))
        `;

        if (marca) {
            dateFilterSqlHistorico += ` AND p.sku LIKE '${marca.toUpperCase()}%' `;
        }

        const tendenciasHistoricasResult = await prisma.$queryRawUnsafe(`
            SELECT 
                v.ano, v.mes,
                CASE WHEN p.familia IS NULL OR p.familia = '' THEN 'Sin Familia' ELSE p.familia END as familia,
                SUM(v.monto_neto) as totalMonto,
                SUM(v.cantidad_vendida) as totalCantidad
            FROM ventas_mensuales v
            JOIN productos p ON v.producto_id = p.id
            WHERE 1=1 ${dateFilterSqlHistorico}
            GROUP BY v.ano, v.mes, familia
        `);

        // 2. Mes Actual (si está en el rango solicitado)
        let tendenciasActualesResult = [];
        const isCurrentMonthInRange = (
            (mesActual.ano > startYear || (mesActual.ano === startYear && mesActual.mes >= startMonth)) &&
            (mesActual.ano < endYear || (mesActual.ano === endYear && mesActual.mes <= endMonth))
        );

        if (isCurrentMonthInRange) {
            let filterMarcaActual = marca ? ` AND p.sku LIKE '${marca.toUpperCase()}%' ` : '';
            tendenciasActualesResult = await prisma.$queryRawUnsafe(`
                SELECT 
                    ${mesActual.ano} as ano,
                    ${mesActual.mes} as mes,
                    CASE WHEN p.familia IS NULL OR p.familia = '' THEN 'Sin Familia' ELSE p.familia END as familia,
                    SUM(v.monto_neto) as totalMonto,
                    SUM(v.cantidad_vendida) as totalCantidad
                FROM ventas_actuales v
                JOIN productos p ON v.producto_id = p.id
                WHERE 1=1 ${filterMarcaActual}
                GROUP BY familia
            `);
        }

        const formatBigInt = (items) => items.map(item => ({
            ano: Number(item.ano),
            mes: Number(item.mes),
            familia: item.familia,
            totalMonto: Number(item.totalMonto || 0),
            totalCantidad: Number(item.totalCantidad || 0)
        }));

        // 4. Mapeo de Vendedores (Para que el frontend reciba nombres reales si los necesita en el futuro)
        // Por ahora Tendencias agrupa por Familia, pero si agregamos vista por vendedor:
        const vendedoresInfo = await prisma.vendedor.findMany({ where: { activo: true } });
        const nicknameMap = new Map(vendedoresInfo.map(v => [v.codigo, v.nombre || v.codigo]));

        const rawData = [...formatBigInt(tendenciasHistoricasResult), ...formatBigInt(tendenciasActualesResult)];

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
