/**
 * Script de prueba para verificar CÁLCULO DE MONTOS en GDVE
 * Objetivo: Confirmar si precio_unitario es Neto o Bruto comparando con el Total.
 */

require('dotenv').config();
const axios = require('axios');
const { format, startOfMonth, endOfMonth } = require('date-fns');
const { getAuthHeaders } = require('../../utils/auth');
const { logInfo, logError, logSuccess } = require('../../utils/logger');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

async function main() {
    console.log('\n🧮 VERIFICANDO CÁLCULO DE MONTOS (GDVE)...\n');

    try {
        const headers = await getAuthHeaders();
        const now = new Date();
        const df = format(startOfMonth(now), 'yyyyMMdd');
        const dt = format(endOfMonth(now), 'yyyyMMdd');
        const url = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/GDVE/V/?df=${df}&dt=${dt}&details=1`;

        const response = await axios.get(url, { headers });
        const data = response.data.data || response.data || [];

        if (!Array.isArray(data) || data.length === 0) {
            logError("No se encontraron GDVEs para probar.");
            return;
        }

        const doc = data[0]; // Tomamos el primero
        const items = doc.detalles || doc.items || doc.productos || [];
        const totalHeader = parseFloat(doc.total || 0);

        console.log(`📄 Documento Folio: ${doc.folio || doc.numero}`);
        console.log(`💰 Total Documento (Header): $${totalHeader.toLocaleString('es-CL')}`);

        let sumNetoCalculado = 0;

        console.log('\n🔍 Detalle de Items:');
        items.forEach((item, idx) => {
            const cant = parseFloat(item.cant || 0);
            const precio = parseFloat(item.precio_unitario || 0);
            const subtotal = cant * precio;
            sumNetoCalculado += subtotal;

            console.log(`   ${idx + 1}. ${item.codigo} x ${cant} @ $${precio.toLocaleString()} = $${subtotal.toLocaleString()}`);
        });

        console.log('\n📊 Análisis:');
        console.log(`   Suma (Cant * PrecioUnitario): $${sumNetoCalculado.toLocaleString('es-CL')}`);

        const estimadoBruto = sumNetoCalculado * 1.19; // IVA 19%
        console.log(`   Suma + IVA (19%): $${estimadoBruto.toLocaleString('es-CL')}`);

        const diffBruto = Math.abs(totalHeader - estimadoBruto);
        const diffNeto = Math.abs(totalHeader - sumNetoCalculado);

        if (diffBruto < 100) {
            logSuccess(`✅ CONCLUSIÓN: 'precio_unitario' es NETO. (Suma + IVA coincide con Total)`);
        } else if (diffNeto < 100) {
            logSuccess(`✅ CONCLUSIÓN: 'precio_unitario' es BRUTO. (Suma coincide con Total)`);
        } else {
            logError(`❓ No calza exacto. Diferencia Bruto: $${diffBruto.toFixed(0)}, Diferencia Neto: $${diffNeto.toFixed(0)}`);
        }

    } catch (error) {
        console.error(error.message);
    }
}

if (require.main === module) {
    main().catch(console.error);
}
