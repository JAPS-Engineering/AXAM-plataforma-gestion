/**
 * Script de diagnóstico para verificar que el ERP devuelve ventas del mes actual
 */

require('dotenv').config();
const { format, startOfMonth, subDays, getYear, getMonth } = require('date-fns');
const { getChileDate } = require('../utils/timezone');
const { getAllSales, aggregateSalesByProduct } = require('../services/salesService');

async function main() {
    console.log('=== TEST DE CONSULTA AL ERP ===\n');

    const today = getChileDate();
    const startDate = startOfMonth(today);
    const endDate = new Date(today); // Hasta ahora

    console.log(`Consultando ERP desde ${format(startDate, 'dd/MM/yyyy')} hasta ${format(endDate, 'dd/MM/yyyy HH:mm')}...\n`);

    try {
        const documents = await getAllSales(startDate, endDate);
        console.log(`\nDocumentos obtenidos: ${documents.length}`);

        if (documents.length === 0) {
            console.log('\n⚠️  EL ERP NO DEVOLVIÓ DOCUMENTOS PARA ESTE MES!');
            console.log('   Verifica conexión al ERP o si hay ventas registradas.');
            return;
        }

        const salesByProduct = aggregateSalesByProduct(documents);
        console.log(`Productos con ventas: ${salesByProduct.size}`);

        // Mostrar top 5
        const top5 = Array.from(salesByProduct.values())
            .sort((a, b) => b.cantidad - a.cantidad)
            .slice(0, 5);

        console.log('\nTop 5 productos con más ventas:');
        top5.forEach((s, i) => {
            console.log(`  ${i + 1}. ${s.sku} (${s.vendedor}): ${s.cantidad} unidades, $${s.montoNeto.toLocaleString('es-CL')}`);
        });

        // Sumar totales
        let totalCantidad = 0;
        let totalMonto = 0;
        for (const s of salesByProduct.values()) {
            totalCantidad += s.cantidad;
            totalMonto += s.montoNeto;
        }

        console.log(`\nTotal cantidad: ${totalCantidad}`);
        console.log(`Total monto: $${totalMonto.toLocaleString('es-CL')}`);

    } catch (error) {
        console.error('Error consultando ERP:', error.message);
    }

    console.log('\n=== FIN ===');
}

main();
