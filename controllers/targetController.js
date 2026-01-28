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

const prisma = getPrismaClient();

/**
 * GET /api/targets
 * Obtiene objetivos y proyecciones para un mes/año específico
 * Query params: ano, mes, vendedorId (opcional)
 */
async function getTargets(req, res) {
    try {
        const { ano, mes, vendedorId } = req.query;
        const mesActual = getMesActual();

        const targetAno = parseInt(ano) || mesActual.ano;
        const targetMes = parseInt(mes) || mesActual.mes;

        // 1. Obtener Objetivos (Metas de Empresa)
        // Pueden ser por Vendedor, Familia o Proveedor
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
 * Crea o actualiza un Objetivo de Venta (Admin)
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
 * Crea o actualiza una Proyección de Venta ("Propongo")
 */
async function saveProyeccion(req, res) {
    try {
        const { vendedorId, ano, mes, montoPropongo, observacion } = req.body;

        if (!vendedorId || !ano || !mes) {
            return res.status(400).json({ error: 'Faltan campos requeridos' });
        }

        // Validar que montoPropongo sea número válido
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

module.exports = {
    getTargets,
    saveObjetivo,
    saveProyeccion
};
