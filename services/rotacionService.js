/**
 * Servicio para rotar datos históricos
 * Mueve las ventas del mes actual a históricas cuando cambia el mes
 * Elimina datos históricos mayores a 12 meses
 */

const { getPrismaClient } = require('../prisma/client');
const { logInfo, logSuccess, logError, logWarning } = require('../utils/logger');
const { getYear, getMonth, subMonths, startOfMonth, endOfMonth } = require('date-fns');

const prisma = getPrismaClient();

/**
 * Obtener el mes actual en formato { ano, mes }
 */
function getMesActual() {
    const ahora = new Date();
    return {
        ano: getYear(ahora),
        mes: getMonth(ahora) + 1 // getMonth devuelve 0-11, necesitamos 1-12
    };
}

/**
 * Rotar ventas actuales a históricas
 * Se ejecuta cuando cambia el mes
 */
async function rotarVentasActualesAHistoricas() {
    try {
        const { getChileDate } = require('../utils/timezone');

        // El mes actual es el MES NUEVO (ej: febrero)
        // Los datos en VentaActual son del MES ANTERIOR (ej: enero)
        // Por lo tanto, necesitamos guardar los datos con la fecha del mes ANTERIOR

        const fechaChile = getChileDate();
        const mesAnterior = subMonths(fechaChile, 1);
        const mesHistorico = {
            ano: getYear(mesAnterior),
            mes: getMonth(mesAnterior) + 1
        };

        logInfo(`Iniciando rotación de ventas actuales a históricas...`);
        logInfo(`Guardando datos como: ${mesHistorico.ano}-${mesHistorico.mes} (mes que se cierra)`);

        // Obtener todas las ventas actuales
        const ventasActuales = await prisma.ventaActual.findMany({
            include: {
                producto: true
            }
        });

        if (ventasActuales.length === 0) {
            logInfo('No hay ventas actuales para rotar');
            return { rotadas: 0, eliminadas: 0 };
        }

        let rotadas = 0;
        let errores = 0;

        // Procesar en transacción para asegurar consistencia
        await prisma.$transaction(async (tx) => {
            for (const ventaActual of ventasActuales) {
                try {
                    // Intentar crear o actualizar venta histórica
                    // Nota: El schema requiere productoId, ano, mes, vendedor como unique constraint
                    await tx.ventaHistorica.upsert({
                        where: {
                            productoId_ano_mes_vendedor: {
                                productoId: ventaActual.productoId,
                                ano: mesHistorico.ano,
                                mes: mesHistorico.mes,
                                vendedor: ventaActual.vendedor
                            }
                        },
                        update: {
                            cantidadVendida: ventaActual.cantidadVendida,
                            montoNeto: ventaActual.montoNeto
                        },
                        create: {
                            productoId: ventaActual.productoId,
                            ano: mesHistorico.ano,
                            mes: mesHistorico.mes,
                            vendedor: ventaActual.vendedor,
                            cantidadVendida: ventaActual.cantidadVendida,
                            montoNeto: ventaActual.montoNeto
                        }
                    });

                    // Resetear venta actual (mantener stock pero resetear ventas)
                    await tx.ventaActual.update({
                        where: {
                            productoId_vendedor: {
                                productoId: ventaActual.productoId,
                                vendedor: ventaActual.vendedor
                            }
                        },
                        data: {
                            cantidadVendida: 0,
                            montoNeto: 0
                            // Mantener stockActual
                        }
                    });

                    rotadas++;
                } catch (error) {
                    errores++;
                    logError(`Error al rotar venta del producto ${ventaActual.productoId} vendedor ${ventaActual.vendedor}: ${error.message}`);
                }
            }
        }, {
            timeout: 60000 // 60 segundos para manejar grandes volúmenes de datos
        });

        logSuccess(`Rotación completada: ${rotadas} ventas rotadas, ${errores} errores`);

        return { rotadas, errores };
    } catch (error) {
        logError(`Error en rotación de ventas: ${error.message}`);
        throw error;
    }
}

/**
 * Mantener todos los datos históricos (sin limpieza)
 * NOTA: Esta función fue deshabilitada para permitir análisis multi-año.
 * Los datos históricos se conservan indefinidamente desde 2021.
 */
async function limpiarDatosAntiguos() {
    // Deshabilitado: mantenemos todos los datos históricos para análisis por año
    logInfo('Limpieza de datos antiguos deshabilitada - conservando todo el historial');
    return {
        ventasEliminadas: 0,
        pedidosEliminados: 0
    };
}

/**
 * Ejecutar rotación completa: rotar ventas actuales a históricas
 * NOTA: Ya no se eliminan datos antiguos para permitir análisis multi-año
 */
async function ejecutarRotacionCompleta() {
    try {
        logInfo('=== INICIANDO ROTACIÓN DE DATOS ===');

        const rotacion = await rotarVentasActualesAHistoricas();

        logSuccess('=== ROTACIÓN FINALIZADA ===');

        return {
            rotacion
        };
    } catch (error) {
        logError(`Error en rotación completa: ${error.message}`);
        throw error;
    }
}

/**
 * Verificar si es necesario rotar (si cambió el mes)
 * Retorna true si hay datos en VentaActual que necesitan rotarse Y aún no se han rotado
 */
async function necesitaRotacion() {
    try {
        const { getChileDate } = require('../utils/timezone');

        // Verificar si hay datos en VentaActual
        const totalVentaActual = await prisma.ventaActual.aggregate({
            _sum: { montoNeto: true, cantidadVendida: true }
        });

        // Si VentaActual está vacío o reseteado, no necesita rotación
        const tieneVentas = (totalVentaActual._sum.montoNeto || 0) > 0 ||
            (totalVentaActual._sum.cantidadVendida || 0) > 0;

        if (!tieneVentas) {
            return false;
        }

        // Verificar si el mes anterior ya fue rotado
        const fechaChile = getChileDate();
        const mesAnterior = subMonths(fechaChile, 1);
        const mesHistoricoEsperado = {
            ano: getYear(mesAnterior),
            mes: getMonth(mesAnterior) + 1
        };

        // Verificar si ya existe data para el mes anterior en histórico
        const yaRotado = await prisma.ventaHistorica.findFirst({
            where: {
                ano: mesHistoricoEsperado.ano,
                mes: mesHistoricoEsperado.mes
            }
        });

        // Si los datos del mes anterior ya están rot ados Y VentaActual tiene ventas,
        // significa que VentaActual tiene datos del MES NUEVO (no necesita rotación)
        if (yaRotado && tieneVentas) {
            return false;
        }

        // Si no está rotado y tiene ventas, necesita rotación
        return !yaRotado && tieneVentas;

    } catch (error) {
        logError(`Error al verificar necesidad de rotación: ${error.message}`);
        return false;
    }
}

module.exports = {
    rotarVentasActualesAHistoricas,
    limpiarDatosAntiguos,
    ejecutarRotacionCompleta,
    necesitaRotacion,
    getMesActual
};
