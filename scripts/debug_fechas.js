/**
 * Script de diagnóstico para verificar la lógica de fechas en syncCurrentMonthData
 */

require('dotenv').config();
const { format, getYear, getMonth, startOfMonth, subDays } = require('date-fns');
const { getChileDate } = require('../utils/timezone');

function main() {
    console.log('=== DIAGNÓSTICO DE FECHAS syncCurrentMonthData ===\n');

    const today = getChileDate();
    console.log(`Fecha Chile (today): ${format(today, 'dd/MM/yyyy HH:mm:ss')}`);

    const year = getYear(today);
    const month = getMonth(today) + 1;
    console.log(`Año: ${year}, Mes: ${month}`);

    const startDate = startOfMonth(today);
    console.log(`\nstartDate (inicio del mes): ${format(startDate, 'dd/MM/yyyy HH:mm:ss')}`);

    // Caso 1: CRON (includeToday = false)
    let endDateCron = subDays(today, 1);
    endDateCron.setHours(23, 59, 59, 999);
    console.log(`\nCaso CRON (includeToday=false):`);
    console.log(`  endDate (ayer 23:59): ${format(endDateCron, 'dd/MM/yyyy HH:mm:ss')}`);
    console.log(`  startDate <= endDate? ${startDate <= endDateCron}`);

    // Problema potencial: si es el día 1 del mes
    if (today.getDate() === 1) {
        console.log(`\n⚠️  HOY ES DÍA 1 DEL MES!`);
        console.log(`   startDate = ${format(startDate, 'dd/MM/yyyy')}`);
        console.log(`   endDate (ayer) = ${format(endDateCron, 'dd/MM/yyyy')}`);
        console.log(`   ¡endDate está en el MES ANTERIOR! El rango no tiene días válidos del mes actual.`);
    }

    // Caso 2: Manual (includeToday = true)
    const endDateManual = new Date(today);
    console.log(`\nCaso Manual (includeToday=true):`);
    console.log(`  endDate (ahora): ${format(endDateManual, 'dd/MM/yyyy HH:mm:ss')}`);
    console.log(`  startDate <= endDate? ${startDate <= endDateManual}`);

    console.log('\n=== FIN ===');
}

main();
