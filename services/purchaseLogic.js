/**
 * Servicio de lógica de compras sugeridas
 * Calcula las cantidades recomendadas a pedir basándose en ventas históricas
 */

const { getPrismaClient } = require('../prisma/client');
const { getMesActual } = require('./rotacionService');
const { subMonths, getYear, getMonth } = require('date-fns');

const prisma = getPrismaClient();

/**
 * Algoritmos disponibles para cálculo de compra sugerida
 */
const ALGORITMOS = {
    LINEAL: 'LINEAL',        // Promedio simple de ventas
    PREDICCION: 'PREDICCION' // Con tendencia (pendiente futura)
};

/**
 * Calcula la cantidad sugerida de compra para un producto
 * @param {string} sku - SKU del producto
 * @param {Object} options - Opciones de cálculo
 * @param {string} options.algoritmo - LINEAL o PREDICCION
 * @param {number} options.meses - Meses de histórico a considerar (1-12)
 * @param {number} options.mesesCobertura - Meses de stock objetivo
 * @returns {Object} - Resultado del cálculo
 */
async function calculateSuggestedPurchase(sku, options = {}) {
    const {
        algoritmo = ALGORITMOS.LINEAL,
        meses = 6, // Se interpreta como "periodos"
        mesesCobertura = 2, // Se interpreta como "periodos de cobertura"
        frequency = 'MONTHLY' // 'MONTHLY' | 'WEEKLY'
    } = options;

    // Obtener mes actual para buscar pedido
    const mesActual = getMesActual();

    // Query Base (para stock y pedidos, que son comunes)
    const queryInclude = {
        ventasActuales: true,
        pedidos: {
            where: {
                ano: mesActual.ano,
                mes: mesActual.mes
            }
        }
    };

    // Agregar la relación histórica correcta según frecuencia
    if (frequency === 'WEEKLY') {
        const { getISOWeek, getYear } = require('date-fns');
        const now = new Date();
        const currentWeek = getISOWeek(now);
        const currentYear = getYear(now);

        // No es tan trivial filtrar las "últimas N semanas" directamente en el include con take simple si hay huecos
        // pero por simplicidad inicial usamos take + orderBy
        queryInclude.ventasSemanales = {
            orderBy: [{ ano: 'desc' }, { semana: 'desc' }],
            take: meses // Tomar ultimas N semanas
        };
    } else {
        queryInclude.ventasHistoricas = {
            orderBy: [{ ano: 'desc' }, { mes: 'desc' }],
            take: meses
        };
    }

    // Obtener producto
    const producto = await prisma.producto.findUnique({
        where: { sku },
        include: queryInclude
    });

    if (!producto) {
        return { error: 'Producto no encontrado', sku };
    }

    // Normalizar historial a una estructura común
    let ventasHistoricas = [];
    if (frequency === 'WEEKLY') {
        ventasHistoricas = producto.ventasSemanales || [];
    } else {
        ventasHistoricas = producto.ventasHistoricas || [];
    }
    const ventaActual = (producto.ventasActuales && producto.ventasActuales[0]) || {};
    const stockActual = ventaActual.stockActual || 0;

    // Obtener pedido pendiente actual
    const pedido = (producto.pedidos && producto.pedidos[0]) || {};
    const compraRealizar = pedido.cantidad !== undefined ? pedido.cantidad : null;
    const tipoCompra = pedido.tipo || 'OC';

    // Si no hay ventas históricas, no podemos calcular
    if (ventasHistoricas.length === 0) {
        return {
            id: producto.id,
            sku,
            descripcion: producto.descripcion,
            familia: producto.familia,
            stockActual,
            stockMinimo: producto.stockMinimo,
            promedioVenta: 0,
            tendencia: 0,
            prediccionProximoMes: 0,
            cantidadSugerida: 0,
            compraRealizar,
            motivo: 'Sin historial de ventas'
        };
    }

    // Calcular promedio de ventas
    const totalVentas = ventasHistoricas.reduce((sum, v) => sum + v.cantidadVendida, 0);
    const promedioVenta = totalVentas / ventasHistoricas.length;

    let cantidadSugerida = 0;
    let tendencia = 0;
    let prediccionProximoMes = promedioVenta;

    // Ajustar terminología según frecuencia (mes vs semana)
    // El frontend envía "meses" y "mesesCobertura", pero si estamos en modo semanal,
    // conceptualmente son "periodos" (semanas).
    // La lógica matemática es agnóstica a la unidad de tiempo.

    if (algoritmo === ALGORITMOS.LINEAL) {
        // Cálculo lineal simple: promedio * periodos de cobertura - stock actual
        let stockObjetivo = producto.stockOptimo || (promedioVenta * mesesCobertura);
        cantidadSugerida = Math.max(0, stockObjetivo - stockActual);

        prediccionProximoMes = promedioVenta;
    } else if (algoritmo === ALGORITMOS.PREDICCION) {
        // Cálculo con tendencia (regresión lineal simple)
        const n = ventasHistoricas.length;
        if (n >= 2) {
            // Invertir para que x=0 sea el periodo más antiguo
            const ventasOrdenadas = [...ventasHistoricas].reverse();

            let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
            ventasOrdenadas.forEach((v, i) => {
                sumX += i;
                sumY += v.cantidadVendida;
                sumXY += i * v.cantidadVendida;
                sumX2 += i * i;
            });

            // Pendiente de la recta (tendencia por periodo)
            const pendiente = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
            tendencia = pendiente;

            // Predicción para el próximo periodo (x = n)
            prediccionProximoMes = promedioVenta + (pendiente * (n - (n - 1) / 2));

            // Cantidad sugerida considerando la predicción
            const prediccionCobertura = prediccionProximoMes * mesesCobertura;
            // Si hay Stock Óptimo, tiene prioridad sobre la cobertura calculada
            const stockObjetivo = producto.stockOptimo || prediccionCobertura;

            cantidadSugerida = Math.max(0, stockObjetivo - stockActual);
        } else {
            // Si no hay suficientes datos, usar lineal
            let stockObjetivo = producto.stockOptimo || (promedioVenta * mesesCobertura);
            cantidadSugerida = Math.max(0, stockObjetivo - stockActual);
        }
    }

    // Redondear al entero más cercano
    cantidadSugerida = Math.round(cantidadSugerida);

    // Considerar factor de empaque si existe
    if (producto.factorEmpaque && producto.factorEmpaque > 1) {
        cantidadSugerida = Math.ceil(cantidadSugerida / producto.factorEmpaque) * producto.factorEmpaque;
    }

    return {
        id: producto.id,
        sku,
        descripcion: producto.descripcion,
        familia: producto.familia,
        proveedor: producto.proveedor,
        origen: producto.origen,
        stockActual,
        stockMinimo: producto.stockMinimo,
        stockOptimo: producto.stockOptimo,
        promedioVenta: Math.round(promedioVenta), // Promedio por periodo (mes o semana)
        tendencia: parseFloat(tendencia.toFixed(2)), // Tendencia por periodo
        prediccionProximoMes: Math.round(prediccionProximoMes), // Predicción para prox periodo
        cantidadSugerida,
        mesesCobertura, // Periodos de cobertura
        algoritmo,
        compraRealizar,
        tipoCompra,
        factorEmpaque: producto.factorEmpaque
    };
}

/**
 * Verifica si un producto está en quiebre de stock
 * @param {string} sku - SKU del producto
 * @returns {Object} - Estado del stock
 */
async function checkStockBreach(sku) {
    const producto = await prisma.producto.findUnique({
        where: { sku },
        include: {
            ventasActuales: {
                select: { stockActual: true }
            }
        }
    });

    if (!producto) {
        return { error: 'Producto no encontrado', sku };
    }

    const ventaActual = (producto.ventasActuales && producto.ventasActuales[0]) || {};
    const stockActual = ventaActual.stockActual || 0;
    const stockMinimo = producto.stockMinimo;

    // Si no tiene mínimo configurado, no hay quiebre
    if (stockMinimo === null) {
        return {
            sku,
            stockActual,
            stockMinimo: null,
            enQuiebre: false,
            motivo: 'Sin stock mínimo configurado'
        };
    }

    const enQuiebre = stockActual < stockMinimo;
    const diferencia = stockMinimo - stockActual;

    return {
        sku,
        descripcion: producto.descripcion,
        stockActual,
        stockMinimo,
        enQuiebre,
        diferencia: enQuiebre ? diferencia : 0,
        porcentajeStock: stockMinimo > 0 ? parseFloat(((stockActual / stockMinimo) * 100).toFixed(1)) : 100
    };
}

/**
 * Obtiene todos los productos en quiebre de stock
 * @param {Object} options - Filtros opcionales
 * @returns {Array} - Lista de productos en quiebre
 */
async function getProductosEnQuiebre(options = {}) {
    const { proveedor, origen } = options;

    const filtros = {
        stockMinimo: { not: null }
    };

    if (proveedor) {
        filtros.proveedor = proveedor;
    }
    if (origen) {
        filtros.origen = origen;
    }

    const productos = await prisma.producto.findMany({
        where: filtros,
        include: {
            ventasActuales: {
                select: { stockActual: true }
            }
        }
    });

    // Filtrar solo los que están en quiebre
    const productosEnQuiebre = productos.filter(p => {
        const venta = (p.ventasActuales && p.ventasActuales[0]) || {};
        const stockActual = venta.stockActual || 0;
        return stockActual < p.stockMinimo;
    });

    return productosEnQuiebre.map(p => {
        // Stock Actual
        const venta = (p.ventasActuales && p.ventasActuales[0]) || {};
        const stockActual = venta.stockActual || 0;
        return {
            id: p.id,
            sku: p.sku,
            descripcion: p.descripcion,
            proveedor: p.proveedor,
            origen: p.origen,
            stockActual,
            stockMinimo: p.stockMinimo,
            diferencia: p.stockMinimo - stockActual,
            porcentajeStock: parseFloat(((stockActual / p.stockMinimo) * 100).toFixed(1))
        };
    }).sort((a, b) => a.porcentajeStock - b.porcentajeStock); // Más críticos primero
}

/**
 * Genera compras sugeridas para un proveedor o familia
 * @param {string} filtroValor - Nombre del proveedor o familia
 * @param {Object} options - Opciones de cálculo
 * @returns {Array} - Lista de compras sugeridas
 */
async function generateSuggestedPurchases(filtroValor, options = {}) {
    const {
        algoritmo = ALGORITMOS.LINEAL,
        meses = 6,
        mesesCobertura = 2,
        soloEnQuiebre = false,
        tipoFiltro = 'proveedor', // 'proveedor' o 'familia'
        frequency = 'MONTHLY'
    } = options;

    // Construir filtro dinámico según el tipo
    const filtros = {};
    if (tipoFiltro === 'familia') {
        filtros.familia = filtroValor;
    } else {
        filtros.proveedor = filtroValor;
    }

    const productos = await prisma.producto.findMany({
        where: filtros,
        select: { sku: true }
    });

    const sugerencias = await Promise.all(
        productos.map(producto =>
            calculateSuggestedPurchase(producto.sku, {
                algoritmo,
                meses,
                mesesCobertura,
                frequency
            })
        )
    );

    return sugerencias.sort((a, b) => b.cantidadSugerida - a.cantidadSugerida);
}

module.exports = {
    ALGORITMOS,
    calculateSuggestedPurchase,
    checkStockBreach,
    getProductosEnQuiebre,
    generateSuggestedPurchases
};
