
require('dotenv').config();
const { addMonths, startOfMonth, isAfter } = require('date-fns');
const { getDatabase, closeDatabase } = require('../utils/database');
const { logSection, logSuccess, logError } = require('../utils/logger');
const { getMonthlySales } = require('../services/salesService');
const { saveVentasMensuales } = require('../services/ventaService');

// Configuración de fecha de inicio (ajustable)
// Sincronización desde 2021 para análisis multi-año
const FECHA_INICIO = new Date(2021, 0, 1);

async function syncMonth(db, date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    logSection(`📅 PROCESANDO MES ${month}/${year}`);

    // El servicio unificado se encarga de:
    // 1. Traer FAVE + GDVE + BOVE + NCVE
    // 2. Deduplicar FAVEs que referencian GDVEs
    // 3. Extraer usuario_vendedor
    const result = await getMonthlySales(year, month);

    // Convertir Map a Objeto para compatibilidad con saveVentasMensuales
    const salesObject = Object.fromEntries(result.sales);

    if (result.sales.size > 0) {
        const saveResult = saveVentasMensuales(db, salesObject, year, month);
        logSuccess(`  ✅ Mes ${month}/${year} completado. Guardadas: ${saveResult.guardadas}, Ignorados (No en DB): ${saveResult.noEncontrados}`);
    } else {
        logSuccess(`  ⚠️ Mes ${month}/${year} sin ventas válidas.`);
    }
}

async function main() {
    logSection('🔄 INICIANDO SINCRONIZACIÓN DE VENTAS (FAVE + GDVE)');
    const db = getDatabase();

    try {
        let currentDate = FECHA_INICIO;
        const now = new Date();

        while (!isAfter(startOfMonth(currentDate), startOfMonth(now))) {
            await syncMonth(db, currentDate);
            currentDate = addMonths(currentDate, 1);
        }

        logSuccess('\n🏁 Sincronización Completa Exitosamente.');

    } catch (error) {
        logError(`Error Global: ${error.message}`);
    } finally {
        closeDatabase();
    }
}

if (require.main === module) {
    main().catch(console.error);
}
