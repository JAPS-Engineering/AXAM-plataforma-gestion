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
const { subMonths, getYear, getMonth, format } = require('date-fns');

const prisma = getPrismaClient();

/**
 * Generar array de meses para el rango solicitado
 */
function generateMonthsArray(mesesNum) {
    const today = new Date();
    const months = [];

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
 * GET /api/ventas/dashboard
 * 
 * Dashboard de ventas monetarias por producto
 */
async function getVentasDashboard(req, res) {
    try {
        const { meses = 3, marca } = req.query;

        const mesesNum = parseInt(meses, 10);
        if (![3, 6, 12].includes(mesesNum)) {
            return res.status(400).json({
                error: 'El parámetro "meses" debe ser 3, 6 o 12'
            });
        }

        const mesActual = getMesActual();
        const monthsArray = generateMonthsArray(mesesNum);

        // Filtro de fecha para ventas históricas
        const fechaInicio = subMonths(new Date(mesActual.ano, mesActual.mes - 1, 1), mesesNum);
        const anoInicio = getYear(fechaInicio);
        const mesInicio = getMonth(fechaInicio) + 1;

        const filtroFecha = {
            AND: [
                {
                    OR: [
                        { ano: { lt: mesActual.ano } },
                        { ano: mesActual.ano, mes: { lt: mesActual.mes } }
                    ]
                },
                {
                    OR: [
                        { ano: { gt: anoInicio } },
                        { ano: anoInicio, mes: { gte: mesInicio } }
                    ]
                }
            ]
        };

        // Filtro de marca
        const filtroMarca = marca ? {
            sku: { startsWith: marca.toUpperCase() }
        } : {};

        // Obtener productos con ventas
        const productosDB = await prisma.producto.findMany({
            where: filtroMarca,
            include: {
                ventasHistoricas: {
                    where: filtroFecha,
                    orderBy: [{ ano: 'asc' }, { mes: 'asc' }]
                },
                ventasActuales: true
            },
            orderBy: { sku: 'asc' }
        });

        let totalMontoGlobal = 0;
        let totalCantidadGlobal = 0;

        // Procesar productos
        const rows = productosDB.map(producto => {
            const ventasHistoricas = producto.ventasHistoricas || [];
            const ventaActualDB = producto.ventasActuales?.[0] || null;

            // Crear mapa de ventas por mes
            const ventasPorMes = {};
            for (const venta of ventasHistoricas) {
                const key = `${venta.ano}-${venta.mes}`;
                ventasPorMes[key] = {
                    cantidad: venta.cantidadVendida,
                    montoNeto: venta.montoNeto
                };
            }

            // Generar array de ventas para cada mes
            const ventasMeses = monthsArray.map(m => {
                const data = ventasPorMes[`${m.ano}-${m.mes}`] || { cantidad: 0, montoNeto: 0 };
                return {
                    ano: m.ano,
                    mes: m.mes,
                    label: m.label,
                    cantidad: data.cantidad,
                    montoNeto: data.montoNeto
                };
            });

            // Calcular totales y promedios
            const totalMonto = ventasMeses.reduce((sum, v) => sum + v.montoNeto, 0);
            const totalCantidad = ventasMeses.reduce((sum, v) => sum + v.cantidad, 0);
            const promedioMonto = totalMonto / ventasMeses.length;
            const promedioCantidad = totalCantidad / ventasMeses.length;

            totalMontoGlobal += totalMonto;
            totalCantidadGlobal += totalCantidad;

            // Datos del mes actual
            const montoMesActual = ventaActualDB?.montoNeto || 0;
            const cantidadMesActual = ventaActualDB?.cantidadVendida || 0;

            return {
                producto: {
                    id: producto.id,
                    sku: producto.sku,
                    descripcion: producto.descripcion,
                    familia: producto.familia
                },
                ventasMeses,
                totalMonto,
                totalCantidad,
                promedioMonto: parseFloat(promedioMonto.toFixed(0)),
                promedioCantidad: parseFloat(promedioCantidad.toFixed(2)),
                mesActual: {
                    ano: mesActual.ano,
                    mes: mesActual.mes,
                    montoVendido: montoMesActual,
                    cantidadVendida: cantidadMesActual
                }
            };
        });

        // Filtrar productos que tienen ventas monetarias
        const rowsConVentas = rows.filter(r => r.totalMonto > 0 || r.mesActual.montoVendido > 0);

        res.json({
            meta: {
                mesesConsultados: mesesNum,
                marca: marca || null,
                mesActual: mesActual,
                columnas: monthsArray.map(m => m.label),
                totalProductos: rowsConVentas.length,
                totalMontoPeriodo: totalMontoGlobal,
                promedioMontoPeriodo: parseFloat((totalMontoGlobal / mesesNum).toFixed(0)),
                generadoEn: new Date().toISOString()
            },
            productos: rowsConVentas
        });

    } catch (error) {
        logError(`Error en getVentasDashboard: ${error.message}`);
        res.status(500).json({
            error: 'Error al obtener datos de ventas',
            message: error.message
        });
    }
}

/**
 * GET /api/ventas/resumen
 * 
 * KPIs globales de ventas
 */
async function getVentasResumen(req, res) {
    try {
        const { meses = 3 } = req.query;
        const mesesNum = parseInt(meses, 10);

        const mesActual = getMesActual();
        const monthsArray = generateMonthsArray(mesesNum);

        // Filtro de fecha
        const fechaInicio = subMonths(new Date(mesActual.ano, mesActual.mes - 1, 1), mesesNum);
        const anoInicio = getYear(fechaInicio);
        const mesInicio = getMonth(fechaInicio) + 1;

        // Obtener totales por mes
        const ventasPorMes = await prisma.ventaHistorica.groupBy({
            by: ['ano', 'mes'],
            _sum: {
                montoNeto: true,
                cantidadVendida: true
            },
            where: {
                AND: [
                    {
                        OR: [
                            { ano: { lt: mesActual.ano } },
                            { ano: mesActual.ano, mes: { lt: mesActual.mes } }
                        ]
                    },
                    {
                        OR: [
                            { ano: { gt: anoInicio } },
                            { ano: anoInicio, mes: { gte: mesInicio } }
                        ]
                    }
                ]
            },
            orderBy: [{ ano: 'asc' }, { mes: 'asc' }]
        });

        // Obtener top 10 productos por monto
        const topProductos = await prisma.ventaHistorica.groupBy({
            by: ['productoId'],
            _sum: {
                montoNeto: true,
                cantidadVendida: true
            },
            where: {
                AND: [
                    {
                        OR: [
                            { ano: { lt: mesActual.ano } },
                            { ano: mesActual.ano, mes: { lt: mesActual.mes } }
                        ]
                    },
                    {
                        OR: [
                            { ano: { gt: anoInicio } },
                            { ano: anoInicio, mes: { gte: mesInicio } }
                        ]
                    }
                ]
            },
            orderBy: {
                _sum: {
                    montoNeto: 'desc'
                }
            },
            take: 10
        });

        // Obtener info de productos del top
        const productosInfo = await prisma.producto.findMany({
            where: {
                id: { in: topProductos.map(p => p.productoId) }
            },
            select: { id: true, sku: true, descripcion: true }
        });

        const productosMap = new Map(productosInfo.map(p => [p.id, p]));

        // Formatear top productos
        const topProductosFormateado = topProductos.map(item => ({
            producto: productosMap.get(item.productoId) || { sku: 'N/A', descripcion: 'N/A' },
            totalMonto: item._sum.montoNeto || 0,
            totalCantidad: item._sum.cantidadVendida || 0
        }));

        // Calcular totales
        const totalMonto = ventasPorMes.reduce((sum, v) => sum + (v._sum.montoNeto || 0), 0);
        const promedioMensual = totalMonto / mesesNum;

        // Formatear ventas por mes para gráfico
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

        // Calcular crecimiento (último mes vs promedio)
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
                mesesConsultados: mesesNum,
                mesActual,
                generadoEn: new Date().toISOString()
            }
        });

    } catch (error) {
        logError(`Error en getVentasResumen: ${error.message}`);
        res.status(500).json({
            error: 'Error al obtener resumen de ventas',
            message: error.message
        });
    }
}


/**
 * GET /api/ventas/graficos-avanzados
 * 
 * Datos agregados para gráficos de familias, proveedores y rendimiento anual
 */
async function getGraficosAvanzados(req, res) {
    try {
        const mesActualObj = getMesActual();
        const anoActual = mesActualObj.ano;
        const anoAnterior = anoActual - 1;

        // 1. Ventas por Familia (Año Actual)
        const ventasPorFamiliaResult = await prisma.$queryRaw`
            SELECT 
                p.familia, 
                SUM(v.monto_neto) as totalMonto,
                SUM(v.cantidad_vendida) as totalCantidad
            FROM ventas_mensuales v
            JOIN productos p ON v.producto_id = p.id
            WHERE v.ano = ${anoActual}
            GROUP BY p.familia
            ORDER BY totalMonto DESC
        `;

        // 2. Market Share (Por Familia - Año Actual)
        // Agrupar familias vacías o nulas como 'Sin Familia'
        const ventasPorFamiliaShareResult = await prisma.$queryRaw`
            SELECT 
                CASE 
                    WHEN p.familia IS NULL OR p.familia = '' THEN 'Sin Familia'
                    ELSE p.familia 
                END as name, 
                SUM(v.monto_neto) as value
            FROM ventas_mensuales v
            JOIN productos p ON v.producto_id = p.id
            WHERE v.ano = ${anoActual}
            GROUP BY name
            ORDER BY value DESC
        `;

        // 3. Ventas por Vendedor (Año Actual)
        const ventasPorVendedorResult = await prisma.$queryRaw`
            SELECT 
                CASE 
                    WHEN v.vendedor IS NULL OR v.vendedor = '' THEN 'Sin Vendedor'
                    ELSE v.vendedor 
                END as name, 
                SUM(v.monto_neto) as value
            FROM ventas_mensuales v
            WHERE v.ano = ${anoActual}
            GROUP BY name
            ORDER BY value DESC
            LIMIT 10
        `;

        // 3. Rendimiento Anual (Acumulado por mes)
        // Obtenemos datos de este año y del anterior
        const rendimientoAnualResult = await prisma.$queryRaw`
            SELECT 
                ano,
                mes,
                SUM(monto_neto) as totalMonto
            FROM ventas_mensuales v
            WHERE ano IN (${anoActual}, ${anoAnterior})
            GROUP BY ano, mes
            ORDER BY ano ASC, mes ASC
        `;

        // Formatear BigInt
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

        // Calcular total para porcentajes
        const totalVentaAnual = ventasPorFamilia.reduce((acc, curr) => acc + curr.totalMonto, 0);

        // Market Share
        const marketShare = marketShareRaw.map(f => ({
            name: f.name,
            value: f.value,
            percentage: totalVentaAnual ? ((f.value / totalVentaAnual) * 100).toFixed(1) : 0
        }));

        // Preparar comparativa anual (Mes a Mes)
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
            meta: {
                anoActual,
                anoAnterior,
                totalVentaAnual
            }
        });

    } catch (error) {
        logError(`Error en getGraficosAvanzados: ${error.message}`);
        res.status(500).json({
            error: 'Error al obtener gráficos avanzados',
            message: error.message
        });
    }
}

module.exports = {
    getVentasDashboard,
    getVentasResumen,
    getGraficosAvanzados
};

