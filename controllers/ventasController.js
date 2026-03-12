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
        const { startYear, startMonth, endYear, endMonth, monthsArray } = parseDateParams(req.query);

        const mesActualObj = getMesActual();
        // Excluir el mes actual de ventaHistorica — esos datos vienen de ventaActual
        const dateFilterSql = {
            AND: [
                { OR: [{ ano: { gt: startYear } }, { ano: startYear, mes: { gte: startMonth } }] },
                { OR: [{ ano: { lt: endYear } }, { ano: endYear, mes: { lte: endMonth } }] },
                // Excluir el mes actual del sistema (ya lo incluimos desde ventaActual)
                {
                    NOT: { ano: mesActualObj.ano, mes: mesActualObj.mes }
                }
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

        // mesActualObj ya declarado arriba

        let totalMontoGlobal = 0;
        const rows = productosDB.map(producto => {
            const ventasHistoricas = producto.ventasHistoricas || [];

            // Agrupar históricas
            const ventasPorMes = {};
            for (const venta of ventasHistoricas) {
                const key = `${venta.ano}-${venta.mes}`;
                if (!ventasPorMes[key]) {
                    ventasPorMes[key] = { cantidad: 0, montoNeto: 0 };
                }
                ventasPorMes[key].cantidad += (venta.cantidadVendida || 0);
                ventasPorMes[key].montoNeto += (venta.montoNeto || 0);
            }

            // Datos actuales (si existen)
            // Asumimos que ventaActuales contiene lo del "Mes en curso" del sistema
            const ventaActualItems = producto.ventasActuales || [];
            const montoActual = ventaActualItems.reduce((sum, v) => sum + (v.montoNeto || 0), 0);
            const cantidadActual = ventaActualItems.reduce((sum, v) => sum + (v.cantidadVendida || 0), 0);
            const stockActual = ventaActualItems[0]?.stockActual || 0;

            const ventasMeses = monthsArray.map(m => {
                let data = ventasPorMes[`${m.ano}-${m.mes}`] || { cantidad: 0, montoNeto: 0 };

                // Para el mes actual: usar SOLO ventaActual (ventaHistorica ya fue excluida del filtro)
                if (m.ano === mesActualObj.ano && m.mes === mesActualObj.mes) {
                    data = { cantidad: cantidadActual, montoNeto: montoActual };
                }

                return { ano: m.ano, mes: m.mes, label: m.label, cantidad: data.cantidad, montoNeto: data.montoNeto };
            });

            const totalMonto = ventasMeses.reduce((sum, v) => sum + v.montoNeto, 0);
            const totalCantidad = ventasMeses.reduce((sum, v) => sum + v.cantidad, 0);
            totalMontoGlobal += totalMonto;

            return {
                producto: {
                    id: producto.id,
                    sku: producto.sku,
                    descripcion: producto.descripcion,
                    familia: producto.familia,
                    precioUltimaCompra: producto.precioUltimaCompra
                },
                ventasMeses,
                totalMonto,
                totalCantidad,
                promedioMonto: ventasMeses.length > 0 ? parseFloat((totalMonto / ventasMeses.length).toFixed(0)) : 0,
                promedioCantidad: ventasMeses.length > 0 ? parseFloat((totalCantidad / ventasMeses.length).toFixed(2)) : 0,
                // "mesActual" sigue siendo el último dato disponible para KPIs rápidos
                mesActual: {
                    ano: endYear,
                    mes: endMonth,
                    montoVendido: montoActual,
                    cantidadVendida: cantidadActual,
                    stockActual: stockActual
                }
            };
        });

        const rowsFinal = rows;

        res.json({
            meta: {
                mesesConsultados: monthsArray.length,
                marca: marca || null,
                mesActual: { ano: endYear, mes: endMonth },
                columnas: monthsArray.map(m => m.label),
                totalProductos: rowsFinal.length,
                totalMontoPeriodo: totalMontoGlobal,
                promedioMontoPeriodo: monthsArray.length > 0 ? parseFloat((totalMontoGlobal / monthsArray.length).toFixed(0)) : 0,
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
        const mesActualObj = getMesActual(); // { ano, mes }

        const baseDateClause = [
            { OR: [{ ano: { gt: startYear } }, { ano: startYear, mes: { gte: startMonth } }] },
            { OR: [{ ano: { lt: endYear } }, { ano: endYear, mes: { lte: endMonth } }] },
            // Excluir el mes actual — viene de ventaActual para evitar doble conteo
            { NOT: { ano: mesActualObj.ano, mes: mesActualObj.mes } }
        ];

        const filterHistorico = {
            AND: [...baseDateClause]
        };

        if (marca) {
            filterHistorico.AND.push({
                producto: { sku: { startsWith: marca.toUpperCase() } }
            });
        }

        // 1. Obtener Ventas Históricas
        const ventasPorMesHistoricas = await prisma.ventaHistorica.groupBy({
            by: ['ano', 'mes'],
            _sum: { montoNeto: true, cantidadVendida: true },
            where: filterHistorico,
            orderBy: [{ ano: 'asc' }, { mes: 'asc' }]
        });

        // 2. Obtener Ventas Actuales (Solo si el rango incluye el mes actual)
        let ventasActualesTotal = { monto: 0, cantidad: 0 };
        let incluirActual = false;

        // Check if current month is inside range
        const startInt = startYear * 100 + startMonth;
        const endInt = endYear * 100 + endMonth;
        const currentInt = mesActualObj.ano * 100 + mesActualObj.mes;

        if (currentInt >= startInt && currentInt <= endInt) {
            incluirActual = true;
            const whereActual = {
                // Standardizing to Net Sales (Inc. Returns)
                // montoNeto: { gt: 0 } 
            };
            if (marca) {
                whereActual.producto = { sku: { startsWith: marca.toUpperCase() } };
            }

            const aggActual = await prisma.ventaActual.aggregate({
                _sum: { montoNeto: true, cantidadVendida: true },
                where: whereActual
            });

            ventasActualesTotal.monto = aggActual._sum.montoNeto || 0;
            ventasActualesTotal.cantidad = aggActual._sum.cantidadVendida || 0;
        }

        // 3. Merge Mensual
        // Mapa temporal para sumar
        const mapMensual = {};
        ventasPorMesHistoricas.forEach(v => {
            const k = `${v.ano}-${v.mes}`;
            mapMensual[k] = {
                monto: v._sum.montoNeto || 0,
                cantidad: v._sum.cantidadVendida || 0
            };
        });

        if (incluirActual) {
            const kActual = `${mesActualObj.ano}-${mesActualObj.mes}`;
            if (!mapMensual[kActual]) mapMensual[kActual] = { monto: 0, cantidad: 0 };

            // Sumar lo actual a lo histórico de ese mes (si hubiera)
            mapMensual[kActual].monto += ventasActualesTotal.monto;
            mapMensual[kActual].cantidad += ventasActualesTotal.cantidad;
        }

        // Construir array final
        const ventasMensuales = monthsArray.map(m => {
            const data = mapMensual[`${m.ano}-${m.mes}`] || { monto: 0, cantidad: 0 };
            return {
                label: m.label,
                ano: m.ano,
                mes: m.mes,
                montoNeto: data.monto,
                cantidad: data.cantidad
            };
        });

        // 4. Calcular Top Productos (Historico + Actual)
        // Como groupBy no deja unirse fácil, hacemos:
        // - Top N histórico
        // - Top N actual
        // - Merge manual y re-sort

        // Histórico
        const topHist = await prisma.ventaHistorica.groupBy({
            by: ['productoId'],
            _sum: { montoNeto: true, cantidadVendida: true },
            where: filterHistorico,
            orderBy: { _sum: { montoNeto: 'desc' } },
            take: 20 // Traemos más para dar margen al merge
        });

        // Actual
        let topAct = [];
        if (incluirActual) {
            const whereActual = {
                // Standardizing to Net Sales (Inc. Returns)
                // montoNeto: { gt: 0 } 
            };
            if (marca) whereActual.producto = { sku: { startsWith: marca.toUpperCase() } };

            topAct = await prisma.ventaActual.findMany({
                where: whereActual,
                select: { productoId: true, montoNeto: true, cantidadVendida: true },
                orderBy: { montoNeto: 'desc' },
                take: 20
            });
        }

        // Merge Top List
        const productStats = new Map();

        // Agregar históricos
        topHist.forEach(item => {
            const pid = item.productoId;
            if (!productStats.has(pid)) productStats.set(pid, { monto: 0, cantidad: 0 });
            const s = productStats.get(pid);
            s.monto += (item._sum.montoNeto || 0);
            s.cantidad += (item._sum.cantidadVendida || 0);
        });

        // Agregar actuales
        topAct.forEach(item => {
            const pid = item.productoId;
            if (!productStats.has(pid)) productStats.set(pid, { monto: 0, cantidad: 0 });
            const s = productStats.get(pid);
            s.monto += (item.montoNeto || 0);
            s.cantidad += (item.cantidadVendida || 0);
        });

        // Convertir a array y sortear
        const mergedTop = Array.from(productStats.entries())
            .map(([pid, stats]) => ({ productoId: pid, ...stats }))
            .sort((a, b) => b.monto - a.monto)
            .slice(0, 10);

        // Fetch product details
        const productosInfo = await prisma.producto.findMany({
            where: { id: { in: mergedTop.map(p => p.productoId) } },
            select: { id: true, sku: true, descripcion: true }
        });
        const productosMap = new Map(productosInfo.map(p => [p.id, p]));

        const topProductosFormateado = mergedTop.map(item => ({
            producto: productosMap.get(item.productoId) || { sku: 'N/A', descripcion: 'N/A' },
            totalMonto: item.monto,
            totalCantidad: item.cantidad
        }));

        // KPIs Globales
        const totalMonto = ventasMensuales.reduce((sum, v) => sum + v.montoNeto, 0);
        const promedioMensual = monthsCount > 0 ? totalMonto / monthsCount : 0;

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
        const { marca, yearRef, yearComp } = req.query;
        const { startYear, startMonth, endYear, endMonth } = parseDateParams(req.query);

        // Logic for Comparison Years
        // Default: Current Year vs Previous Year
        const mesActualObj = getMesActual();

        let anoActual = mesActualObj.ano;
        let anoAnterior = anoActual - 1;

        // Override if params provided
        if (yearRef) anoActual = parseInt(yearRef);
        if (yearComp) anoAnterior = parseInt(yearComp);

        // SQL WHERE para rangos en queries RAW (Main filters use the standard date range params)
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

        // UNION Subquery to treat ventas_actuales as just another month (the current one)
        // Note: We use the *System* current date for ventas_actuales, regardless of the filter params. 
        // The dateFilterSql will filter it out if it's not in the requested range.
        const ventasTableSql = `
            (
                SELECT producto_id, ano, mes, vendedor, cantidad_vendida, monto_neto 
                FROM ventas_mensuales
                -- Excluir mes actual de históricas para evitar doble conteo con ventas_actuales
                WHERE NOT (ano = ${mesActualObj.ano} AND mes = ${mesActualObj.mes})
                UNION ALL
                SELECT producto_id, ${mesActualObj.ano} as ano, ${mesActualObj.mes} as mes, vendedor, cantidad_vendida, monto_neto 
                FROM ventas_actuales 
                -- WHERE monto_neto > 0 (Standardizing to Net Sales)
            )
        `;

        // 1. Ventas por Familia (Filtrado)
        const ventasPorFamiliaResult = await prisma.$queryRawUnsafe(`
            SELECT p.familia, SUM(v.monto_neto) as totalMonto, SUM(v.cantidad_vendida) as totalCantidad
            FROM ${ventasTableSql} v
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
            FROM ${ventasTableSql} v
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
            FROM ${ventasTableSql} v
            LEFT JOIN vendedores ven ON v.vendedor = ven.codigo
            JOIN productos p ON v.producto_id = p.id
            WHERE 1=1 ${dateFilterSql}
            GROUP BY v.vendedor, name
            ORDER BY value DESC
            LIMIT 10
        `);

        // 4. Rendimiento Anual (COMPARATIVA CUSTOM O DEFAULT)
        // Note: This query uses specific years (anoActual, anoAnterior) instead of the general range
        const rendimientoAnualResult = await prisma.$queryRawUnsafe(`
            SELECT ano, mes, SUM(monto_neto) as totalMonto
            FROM ${ventasTableSql} v
            WHERE ano IN (${anoActual}, ${anoAnterior})
            GROUP BY ano, mes
            ORDER BY ano ASC, mes ASC
        `);

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

        const mesActualObj = getMesActual(); // System current date

        // 1. VentaHistorica - incluye TODOS los meses en el rango
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

        // UNION Subquery strategy (excluye mes actual de históricas para evitar doble conteo)
        const ventasTableSql = `
            (
                SELECT producto_id, ano, mes, vendedor, cantidad_vendida, monto_neto 
                FROM ventas_mensuales
                WHERE NOT (ano = ${mesActualObj.ano} AND mes = ${mesActualObj.mes})
                UNION ALL
                SELECT producto_id, ${mesActualObj.ano} as ano, ${mesActualObj.mes} as mes, vendedor, cantidad_vendida, monto_neto 
                FROM ventas_actuales 
                -- WHERE monto_neto > 0 (Standardizing to Net Sales)
            )
        `;

        const tendenciasResult = await prisma.$queryRawUnsafe(`
            SELECT 
                v.ano, v.mes,
                CASE WHEN p.familia IS NULL OR p.familia = '' THEN 'Sin Familia' ELSE p.familia END as familia,
                SUM(v.monto_neto) as totalMonto,
                SUM(v.cantidad_vendida) as totalCantidad
            FROM ${ventasTableSql} v
            JOIN productos p ON v.producto_id = p.id
            WHERE 1=1 ${dateFilterSql}
            GROUP BY v.ano, v.mes, familia
        `);

        const formatBigInt = (items) => items.map(item => ({
            ano: Number(item.ano),
            mes: Number(item.mes),
            familia: item.familia,
            totalMonto: Number(item.totalMonto || 0),
            totalCantidad: Number(item.totalCantidad || 0)
        }));

        // 2. Mapeo de Vendedores
        const vendedoresInfo = await prisma.vendedor.findMany({ where: { activo: true } });
        const nicknameMap = new Map(vendedoresInfo.map(v => [v.codigo, v.nombre || v.codigo]));

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
