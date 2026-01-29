/**
 * Controlador de Objetivos y Proyecciones de Venta
 * 
 * Gestiona:
 * - ObjetivoVenta: Metas definidas por la empresa (Admin)
 * - ProyeccionVenta: "Propongo" definido por el vendedor
 */

const { getPrismaClient } = require('../prisma/client');
const { logError, logInfo } = require('../utils/logger');
const { getMesActual } = require('../services/rotacionService');

const { parseDateParams } = require('../utils/dateUtils');

const prisma = getPrismaClient();

/**
 * GET /api/targets
 * Obtiene objetivos y proyecciones para un mes/año específico
 */
async function getTargets(req, res) {
    try {
        const { ano, mes, vendedorId } = req.query;
        const mesActual = getMesActual();

        const targetAno = parseInt(ano) || mesActual.ano;
        const targetMes = parseInt(mes) || mesActual.mes;

        // 1. Obtener Objetivos (Metas de Empresa)
        const objetivos = await prisma.objetivoVenta.findMany({
            where: {
                ano: targetAno,
                mes: targetMes
            }
        });

        // 2. Obtener Proyecciones (Propongo del Vendedor)
        const whereProyeccion = {
            ano: targetAno,
            mes: targetMes
        };
        if (vendedorId) {
            whereProyeccion.vendedorId = vendedorId;
        }

        const proyecciones = await prisma.proyeccionVenta.findMany({
            where: whereProyeccion
        });

        res.json({
            meta: {
                ano: targetAno,
                mes: targetMes
            },
            objetivos,
            proyecciones
        });

    } catch (error) {
        logError(`Error en getTargets: ${error.message}`);
        res.status(500).json({ error: 'Error al obtener objetivos' });
    }
}

/**
 * POST /api/targets/objetivo
 */
async function saveObjetivo(req, res) {
    try {
        const { tipo, entidadId, ano, mes, montoObjetivo } = req.body;

        if (!tipo || !entidadId || !ano || !mes) {
            return res.status(400).json({ error: 'Faltan campos requeridos' });
        }

        const objetivo = await prisma.objetivoVenta.upsert({
            where: {
                tipo_entidadId_ano_mes: {
                    tipo,
                    entidadId,
                    ano,
                    mes
                }
            },
            update: {
                montoObjetivo: parseFloat(montoObjetivo)
            },
            create: {
                tipo,
                entidadId,
                ano,
                mes,
                montoObjetivo: parseFloat(montoObjetivo)
            }
        });

        res.json({ success: true, objetivo });

    } catch (error) {
        logError(`Error en saveObjetivo: ${error.message}`);
        res.status(500).json({ error: 'Error al guardar objetivo' });
    }
}

/**
 * POST /api/targets/proyeccion
 */
async function saveProyeccion(req, res) {
    try {
        const { vendedorId, ano, mes, montoPropongo, observacion } = req.body;

        if (!vendedorId || !ano || !mes) {
            return res.status(400).json({ error: 'Faltan campos requeridos' });
        }

        const monto = parseFloat(montoPropongo);
        if (isNaN(monto)) {
            return res.status(400).json({ error: 'Monto inválido' });
        }

        const proyeccion = await prisma.proyeccionVenta.upsert({
            where: {
                vendedorId_ano_mes: {
                    vendedorId,
                    ano,
                    mes
                }
            },
            update: {
                montoPropongo: monto,
                observacion: observacion || undefined
            },
            create: {
                vendedorId,
                ano,
                mes,
                montoPropongo: monto,
                observacion: observacion
            }
        });

        res.json({ success: true, proyeccion });

    } catch (error) {
        logError(`Error en saveProyeccion: ${error.message}`);
        res.status(500).json({ error: 'Error al guardar proyección' });
    }
}

/**
 * GET /api/targets/ventas
 * Obtiene ventas reales agregadas por vendedor y mes para un periodo
 */
async function getVentasPorVendedor(req, res) {
    try {
        const { startYear, startMonth, endYear, endMonth, monthsArray, monthsCount } = parseDateParams(req.query);
        const mesActual = getMesActual(); // { ano, mes }

        const whereDateClause = {
            AND: [
                { OR: [{ ano: { gt: startYear } }, { ano: startYear, mes: { gte: startMonth } }] },
                { OR: [{ ano: { lt: endYear } }, { ano: endYear, mes: { lte: endMonth } }] }
            ]
        };

        // 1. Obtener Ventas Históricas
        const ventasHistoricas = await prisma.ventaHistorica.groupBy({
            by: ['vendedor', 'mes', 'ano'],
            where: whereDateClause,
            _sum: {
                montoNeto: true,
                cantidadVendida: true
            }
        });

        // 2. Obtener Ventas Actuales (si el mes actual está en el rango)
        let ventasActualesAgregadas = [];
        const isCurrentMonthInRange = (
            (mesActual.ano > startYear || (mesActual.ano === startYear && mesActual.mes >= startMonth)) &&
            (mesActual.ano < endYear || (mesActual.ano === endYear && mesActual.mes <= endMonth))
        );

        if (isCurrentMonthInRange) {
            const ventasActuales = await prisma.ventaActual.groupBy({
                by: ['vendedor'],
                _sum: {
                    montoNeto: true,
                    cantidadVendida: true
                }
            });

            ventasActualesAgregadas = ventasActuales.map(v => ({
                vendedor: v.vendedor,
                mes: mesActual.mes,
                ano: mesActual.ano,
                _sum: v._sum
            }));
        }

        // 3. Obtener Objetivos y Proyecciones en el rango
        const objetivos = await prisma.objetivoVenta.findMany({
            where: whereDateClause
        });

        const proyecciones = await prisma.proyeccionVenta.findMany({
            where: whereDateClause
        });

        // 4. Procesar y formatear respuesta
        const ventasResult = {};
        const objetivosResult = {};
        const proyeccionesResult = {};

        const marketShareData = {}; // Totales por vendedor para el periodo

        // Helper para agregar a marketShare
        const addTotal = (vendedor, monto) => {
            if (!vendedor) return;
            if (!marketShareData[vendedor]) marketShareData[vendedor] = 0;
            marketShareData[vendedor] += monto;
        };

        // Procesar históricas
        ventasHistoricas.forEach(v => {
            if (!ventasResult[v.vendedor]) ventasResult[v.vendedor] = {};
            const key = `${v.ano}-${v.mes}`;
            ventasResult[v.vendedor][key] = (ventasResult[v.vendedor][key] || 0) + (v._sum.montoNeto || 0);
            addTotal(v.vendedor, v._sum.montoNeto || 0);
        });

        // Procesar actuales
        ventasActualesAgregadas.forEach(v => {
            if (!ventasResult[v.vendedor]) ventasResult[v.vendedor] = {};
            const key = `${v.ano}-${v.mes}`;
            ventasResult[v.vendedor][key] = (ventasResult[v.vendedor][key] || 0) + (v._sum.montoNeto || 0);
            addTotal(v.vendedor, v._sum.montoNeto || 0);
        });

        // Procesar objetivos
        objetivos.forEach(o => {
            if (o.tipo === 'VENDEDOR') {
                if (!objetivosResult[o.entidadId]) objetivosResult[o.entidadId] = {};
                const key = `${o.ano}-${o.mes}`;
                objetivosResult[o.entidadId][key] = (objetivosResult[o.entidadId][key] || 0) + o.montoObjetivo;
            }
        });

        // Procesar proyecciones
        proyecciones.forEach(p => {
            if (!proyeccionesResult[p.vendedorId]) proyeccionesResult[p.vendedorId] = {};
            const key = `${p.ano}-${p.mes}`;
            proyeccionesResult[p.vendedorId][key] = (proyeccionesResult[p.vendedorId][key] || 0) + p.montoPropongo;
        });

        // Preparar Ranking y Market Share (formato esperado por componentes compartidos)
        const totalVentaPeriodo = Object.values(marketShareData).reduce((a, b) => a + b, 0);
        const rankingVendedores = Object.entries(marketShareData)
            .map(([name, value]) => ({
                name,
                value,
                percentage: totalVentaPeriodo > 0 ? ((value / totalVentaPeriodo) * 100).toFixed(1) : "0"
            }))
            .sort((a, b) => b.value - a.value);

        res.json({
            meta: {
                start: `${startYear}-${String(startMonth).padStart(2, '0')}`,
                end: `${endYear}-${String(endMonth).padStart(2, '0')}`,
                monthsCount,
                monthsArray,
                ano: endYear, // Para compatibilidad
                totalVenta: totalVentaPeriodo
            },
            ventas: ventasResult,
            objetivos: objetivosResult,
            proyecciones: proyeccionesResult,
            ranking: rankingVendedores // Nuevo: para gráficos de torta y ranking
        });

    } catch (error) {
        logError(`Error en getVentasPorVendedor: ${error.message}`);
        res.status(500).json({ error: 'Error al obtener ventas por vendedor' });
    }
}

module.exports = {
    getTargets,
    saveObjetivo,
    saveProyeccion,
    getVentasPorVendedor
};
