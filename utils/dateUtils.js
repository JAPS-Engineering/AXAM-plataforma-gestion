/**
 * Utilidades de manejo de fechas y rangos para reportes
 */
const { getYear, getMonth, subMonths, parseISO, differenceInMonths, addMonths, format } = require('date-fns');
const { getMesActual } = require('../services/rotacionService');

/**
 * Generar array de meses para un rango
 * @param {number} startYear 
 * @param {number} startMonth 
 * @param {number} endYear 
 * @param {number} endMonth 
 * @returns {Array<{ano: number, mes: number, label: string}>}
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
 * Parsear rango de fechas desde query params
 * Soporta ?start=YYYY-MM&end=YYYY-MM O ?meses=X
 * @param {Object} query req.query
 * @returns {{startYear: number, startMonth: number, endYear: number, endMonth: number, monthsCount: number, monthsArray: Array, isCustom: boolean}}
 */
function parseDateParams(query) {
    const { meses, start, end } = query;
    const mesActual = getMesActual();

    // Caso 1: Rango Personalizado
    if (start && end) {
        // Robust parsing: split YYYY-MM and ensure valid numbers
        const partsStart = start.split('-');
        const partsEnd = end.split('-');

        const startYear = parseInt(partsStart[0], 10);
        const startMonth = parseInt(partsStart[1], 10);
        const endYear = parseInt(partsEnd[0], 10);
        const endMonth = parseInt(partsEnd[1], 10);

        // Fallback to current month if parsing fails
        const sY = isNaN(startYear) ? mesActual.ano : startYear;
        const sM = isNaN(startMonth) ? mesActual.mes : startMonth;
        const eY = isNaN(endYear) ? mesActual.ano : endYear;
        const eM = isNaN(endMonth) ? mesActual.mes : endMonth;

        const startDate = new Date(sY, sM - 1, 1);
        const endDate = new Date(eY, eM - 1, 1);

        const monthsCount = differenceInMonths(addMonths(endDate, 1), startDate);
        const monthsArray = generateMonthsRangeArray(sY, sM, eY, eM);

        return {
            startYear: sY,
            startMonth: sM,
            endYear: eY,
            endMonth: eM,
            monthsCount: monthsCount > 0 ? monthsCount : 1,
            monthsArray,
            isCustom: true
        };
    }

    // Caso 2: Últimos X meses (Default)
    const mesesNum = parseInt(meses || '3', 10);
    // Usamos el "Mes Actual" del sistema (ultima carga) como pivote final
    const today = new Date(mesActual.ano, mesActual.mes - 1, 1);

    // Fecha Inicio = (Hoy - X meses + 1) para incluir el mes actual
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

module.exports = {
    generateMonthsRangeArray,
    parseDateParams
};
