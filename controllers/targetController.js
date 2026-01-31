const { getPrismaClient } = require('../prisma/client');
const { logError } = require('../utils/logger');
const { getMesActual } = require('../services/rotacionService');
const { parseDateParams, generateMonthsRangeArray } = require('../utils/dateUtils');
const { addMonths, getYear, getMonth } = require('date-fns');

const prisma = getPrismaClient();

/**
 * GET /api/targets
 */
async function getTargets(req, res) {
    try {
        const { startYear, startMonth, endYear, endMonth, monthsArray } = parseDateParams(req.query);
        const baseDateClause = [
            { OR: [{ ano: { gt: startYear } }, { ano: startYear, mes: { gte: startMonth } }] },
            { OR: [{ ano: { lt: endYear } }, { ano: endYear, mes: { lte: endMonth } }] }
        ];

        const objetivos = await prisma.objetivoVenta.findMany({
            where: { AND: baseDateClause }
        });

        const proyecciones = await prisma.proyeccionVenta.findMany({
            where: { AND: baseDateClause }
        });

        res.json({
            meta: { range: monthsArray },
            objetivos,
            proyecciones
        });
    } catch (error) {
        logError(`Error en getTargets: ${error.message}`);
        res.status(500).json({ error: 'Error al obtener targets' });
    }
}

async function saveObjetivo(req, res) {
    try {
        const { tipo, entidadId, ano, mes, montoObjetivo } = req.body;
        const result = await prisma.objetivoVenta.upsert({
            where: { tipo_entidadId_ano_mes: { tipo, entidadId, ano, mes } },
            update: { montoObjetivo },
            create: { tipo, entidadId, ano, mes, montoObjetivo }
        });
        res.json(result);
    } catch (error) {
        logError(`Error en saveObjetivo: ${error.message}`);
        res.status(500).json({ error: 'Error al guardar objetivo' });
    }
}

async function saveProyeccion(req, res) {
    try {
        const { vendedorId, ano, mes, montoPropongo, observacion } = req.body;
        const result = await prisma.proyeccionVenta.upsert({
            where: { vendedorId_ano_mes: { vendedorId, ano, mes } },
            update: { montoPropongo, observacion },
            create: { vendedorId, ano, mes, montoPropongo, observacion }
        });
        res.json(result);
    } catch (error) {
        logError(`Error en saveProyeccion: ${error.message}`);
        res.status(500).json({ error: 'Error al guardar proyección' });
    }
}

/**
 * GET /api/targets/ventas
 * Devuelve el formato esperado por el frontend (ventas, objetivos, proyecciones como Records)
 */
async function getVentasPorVendedor(req, res) {
    try {
        const { startYear, startMonth, endYear, endMonth, monthsArray: pastMonthsArray, monthsCount } = parseDateParams(req.query);
        const mesActual = getMesActual();

        // Calcular rango futuro (Desde mes actual + N meses)
        const futureMonthsCount = parseInt(req.query.futureMonths || '6', 10);

        // Start from CURRENT MONTH to ensure we capture immediate targets
        const futureStartDate = new Date(mesActual.ano, mesActual.mes - 1, 1);

        // Future end date is current month + count
        const futureEndDate = addMonths(futureStartDate, futureMonthsCount - 1);

        const futureEndYear = getYear(futureEndDate);
        const futureEndMonth = getMonth(futureEndDate) + 1;

        const futureMonthsArray = generateMonthsRangeArray(mesActual.ano, mesActual.mes, futureEndYear, futureEndMonth);

        // Cláusula para rango Histórico (Ventas)
        const historicalDateClause = [
            { OR: [{ ano: { gt: startYear } }, { ano: startYear, mes: { gte: startMonth } }] },
            { OR: [{ ano: { lt: endYear } }, { ano: endYear, mes: { lte: endMonth } }] }
        ];

        // Cláusula extendida para Objetivos (Todo el historial + Futuro)
        // Desde startYear/Month (historia) hasta futureEndYear/Month (futuro)
        const extendedDateClause = [
            { OR: [{ ano: { gt: startYear } }, { ano: startYear, mes: { gte: startMonth } }] },
            { OR: [{ ano: { lt: futureEndYear } }, { ano: futureEndYear, mes: { lte: futureEndMonth } }] }
        ];

        // 1. Obtener Ventas Históricas
        const filterHistorico = {
            AND: [
                ...historicalDateClause,
                { OR: [{ ano: { lt: mesActual.ano } }, { ano: mesActual.ano, mes: { lt: mesActual.mes } }] }
            ]
        };

        const ventasHistoricas = await prisma.ventaHistorica.groupBy({
            by: ['vendedor', 'mes', 'ano'],
            where: filterHistorico,
            _sum: { montoNeto: true }
        });

        // 2. Obtener Ventas Actuales
        let ventasActualesAgregadas = [];
        const isCurrentInRange = (
            (mesActual.ano > startYear || (mesActual.ano === startYear && mesActual.mes >= startMonth)) &&
            (mesActual.ano < endYear || (mesActual.ano === endYear && mesActual.mes <= endMonth))
        );

        if (isCurrentInRange) {
            const va = await prisma.ventaActual.groupBy({
                by: ['vendedor'],
                _sum: { montoNeto: true }
            });
            ventasActualesAgregadas = va.map(v => ({
                vendedor: v.vendedor,
                mes: mesActual.mes,
                ano: mesActual.ano,
                _sum: v._sum
            }));
        }

        // 3. Objetivos y Proyecciones (Usando rango extendido)
        const objetivos = await prisma.objetivoVenta.findMany({ where: { AND: extendedDateClause, tipo: 'VENDEDOR' } });
        const proyecciones = await prisma.proyeccionVenta.findMany({ where: { AND: extendedDateClause } });

        // --- CALCULAR ESTADÍSTICAS DEL MES ACTUAL (PARA KPIs SIEMPRE VISIBLES) ---
        let currentMonthSales = 0;
        let currentMonthTarget = 0;

        // Venta actual total (Desde VentaActual model)
        const vaTotal = await prisma.ventaActual.aggregate({
            _sum: { montoNeto: true }
        });
        currentMonthSales = vaTotal._sum.montoNeto || 0;

        // Objetivo mes actual total
        const objActualTotal = await prisma.objetivoVenta.aggregate({
            where: {
                mes: mesActual.mes,
                ano: mesActual.ano,
                tipo: 'VENDEDOR'
            },
            _sum: { montoObjetivo: true }
        });
        currentMonthTarget = objActualTotal._sum.montoObjetivo || 0;

        // --- NUEVO: Obtener Ventas por Familia (Agrupado por Vendedor -> Familia) ---
        const familySalesPerSeller = {};

        // Calcular índices de meses para filtrado más simple en SQL
        // Formula: year * 12 + month
        const startIdx = startYear * 12 + startMonth;
        const endIdx = endYear * 12 + endMonth;
        const currentIdx = mesActual.ano * 12 + mesActual.mes;

        // Límite para histórico: hasta el mes anterior al actual (si cae dentro del rango)
        const limitIdx = Math.min(endIdx, currentIdx - 1);

        // a. Ventas Históricas por Familia (Solo si el rango incluye meses pasados)
        if (startIdx <= limitIdx) {
            const historicFamily = await prisma.$queryRaw`
                SELECT 
                    vm.vendedor, 
                    p.familia, 
                    SUM(vm.monto_neto) as total
                FROM ventas_mensuales vm
                JOIN productos p ON vm.producto_id = p.id
                WHERE 
                    (vm.ano * 12 + vm.mes) >= ${startIdx}
                    AND (vm.ano * 12 + vm.mes) <= ${limitIdx}
                GROUP BY vm.vendedor, p.familia
            `;

            historicFamily.forEach(row => {
                const vend = row.vendedor || 'SIN ASIGNAR';
                if (!familySalesPerSeller[vend]) familySalesPerSeller[vend] = {};
                const fam = row.familia || 'SIN FAMILIA';
                familySalesPerSeller[vend][fam] = (familySalesPerSeller[vend][fam] || 0) + Number(row.total);
            });
        }

        // b. Ventas Actuales por Familia (Solo si el rango incluye el mes actual)
        if (isCurrentInRange) {
            const currentFamily = await prisma.$queryRaw`
                SELECT 
                    va.vendedor, 
                    p.familia, 
                    SUM(va.monto_neto) as total
                FROM ventas_actuales va
                JOIN productos p ON va.producto_id = p.id
                GROUP BY va.vendedor, p.familia
            `;

            currentFamily.forEach(row => {
                const vend = row.vendedor || 'SIN ASIGNAR';
                if (!familySalesPerSeller[vend]) familySalesPerSeller[vend] = {};
                const fam = row.familia || 'SIN FAMILIA';
                familySalesPerSeller[vend][fam] = (familySalesPerSeller[vend][fam] || 0) + Number(row.total);
            });
        }

        // 4. Vendedores (Para apodos)
        const vList = await prisma.vendedor.findMany();
        const nicknameMap = {};
        vList.forEach(v => nicknameMap[v.codigo] = v.nombre || v.codigo);

        // 5. Convertir a formato Record para el frontend
        const resVentas = {};
        const resObjetivos = {};
        const resProyecciones = {};
        const marketShareData = {};

        const allSales = [...ventasHistoricas, ...ventasActualesAgregadas];
        allSales.forEach(v => {
            if (!resVentas[v.vendedor]) resVentas[v.vendedor] = {};
            const key = `${v.ano}-${String(v.mes).padStart(2, '0')}`;
            const monto = Number(v._sum.montoNeto || 0);
            resVentas[v.vendedor][key] = monto;
            marketShareData[v.vendedor] = (marketShareData[v.vendedor] || 0) + monto;
        });

        objetivos.forEach(o => {
            if (!resObjetivos[o.entidadId]) resObjetivos[o.entidadId] = {};
            const key = `${o.ano}-${String(o.mes).padStart(2, '0')}`;
            resObjetivos[o.entidadId][key] = o.montoObjetivo;
        });

        proyecciones.forEach(p => {
            if (!resProyecciones[p.vendedorId]) resProyecciones[p.vendedorId] = {};
            const key = `${p.ano}-${String(p.mes).padStart(2, '0')}`;
            resProyecciones[p.vendedorId][key] = p.montoPropongo;
        });

        // Generar Ranking (Ranking de Vendedores Chart)
        const totalVenta = Object.values(marketShareData).reduce((a, b) => a + b, 0);
        const ranking = Object.entries(marketShareData)
            .map(([code, value]) => ({
                name: nicknameMap[code] || code,
                code: code,
                value,
                percentage: totalVenta > 0 ? ((value / totalVenta) * 100).toFixed(1) : "0"
            }))
            .sort((a, b) => b.value - a.value);

        res.json({
            ventas: resVentas,
            ventasPorFamilia: familySalesPerSeller,
            objetivos: resObjetivos,
            proyecciones: resProyecciones,
            ranking,
            vendedores: nicknameMap, // Nuevo: Map de apodos
            meta: {
                monthsArray: pastMonthsArray,
                futureMonthsArray,
                monthsCount,
                totalVenta,
                anoActual: mesActual.ano,
                currentMonthStats: {
                    sales: currentMonthSales,
                    target: currentMonthTarget
                }
            }
        });

    } catch (error) {
        logError(`Error en getVentasPorVendedor: ${error.message}`);
        res.status(500).json({ error: 'Error al obtener datos' });
    }
}

module.exports = {
    getTargets,
    saveObjetivo,
    saveProyeccion,
    getVentasPorVendedor
};
