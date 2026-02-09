/**
 * Script para probar diferentes códigos de unidad de negocio y centro de costo
 * hasta encontrar una combinación válida
 */

require('dotenv').config();
const axios = require('axios');
const { getAuthHeaders } = require('../../utils/auth');
const { getPrismaClient } = require('../../prisma/client');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

const prisma = getPrismaClient();

// Posibles códigos a probar
const UNIDADES_NEGOCIO = [
    '1', '01', '001',
    'CM', 'CASAMATRIZ',
    'Casa Matriz',
    'U01', 'UN01',
    'PRINCIPAL', 'MAIN',
    ''  // Vacío como último intento
];

const CENTROS_COSTO = [
    'A06', '06', '6',
    'ADQ', 'ADQUISICIONES', 'Adquisiciones',
    '001', '01', '1',
    'COMPRAS', 'PURCHASES',
    ''  // Vacío como último intento
];

function formatDate(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

async function testCombination(unidNegocio, cenCos, producto) {
    const headers = await getAuthHeaders();
    const url = `${ERP_BASE_URL}/import/create-document/?emitir=0&docnumreg=1`;

    const today = new Date();
    const vctoDate = new Date(today);
    vctoDate.setDate(vctoDate.getDate() + 30);

    const payload = {
        rut_empresa: RUT_EMPRESA,
        tipodocumento: "OC",
        num_doc: String(Date.now()).slice(-6),
        fecha_doc: formatDate(today),
        fecha_ref: "",
        fecha_vcto: formatDate(vctoDate),
        modalidad: "S",
        cod_unidnegocio: unidNegocio,
        rut_cliente: "96662200-8",  // DIVERSEY
        dire_cliente: "",
        rut_facturador: "",
        cod_vendedor: "",
        cod_comisionista: "",
        lista_precio: "",
        plazo_pago: "30",
        stock: "R",
        cod_moneda: "CLP",
        tasa_cambio: "1",
        afecto: "1000",
        exento: "0",
        iva: "190",
        imp_esp: "",
        iva_ret: "",
        imp_ret: "",
        tipo_desc_global: "",
        monto_desc_global: "",
        total: "1190",
        deuda_pendiente: "0",
        glosa: "Test automatico para encontrar códigos válidos",
        ajuste_iva: "0",
        iva_proporcional: "A",
        detalles: [{
            cod_producto: producto.sku,
            cantidad: "1",
            unidad: producto.unidad || "U",
            precio_unit: "1000",
            moneda_det: "CLP",
            tasa_cambio_det: "1",
            nro_serie: "",
            num_lote: "",
            fecha_vec: "",
            cen_cos: cenCos,
            tipo_desc: "",
            descuento: "",
            ubicacion: "",
            bodega: "",
            concepto1: "",
            concepto2: "",
            concepto3: "",
            concepto4: "",
            descrip: producto.descripcion,
            desc_adic: "",
            comentario1: "",
            comentario2: "",
            comentario3: "",
            comentario4: "",
            comentario5: "",
            cod_impesp1: "",
            mon_impesp1: "",
            cod_impesp2: "",
            mon_impesp2: "",
            fecha_comp: "",
            porc_retencion: ""
        }]
    };

    try {
        const response = await axios.post(url, payload, {
            headers,
            timeout: 15000
        });
        return { success: true, data: response.data };
    } catch (error) {
        if (error.response) {
            return {
                success: false,
                status: error.response.status,
                errors: error.response.data?.mensaje
            };
        }
        return { success: false, error: error.message };
    }
}

async function main() {
    console.log('\n' + '='.repeat(60));
    console.log('  BUSCANDO CÓDIGOS VÁLIDOS DE UNIDAD DE NEGOCIO Y CENTRO DE COSTO');
    console.log('='.repeat(60));

    // Obtener un producto de prueba
    const producto = await prisma.producto.findFirst({
        select: { sku: true, descripcion: true, unidad: true }
    });

    if (!producto) {
        console.error('No se encontró ningún producto para la prueba');
        process.exit(1);
    }

    console.log('\nProducto de prueba:', producto.sku, '-', producto.descripcion.slice(0, 40));
    console.log('\nProbando combinaciones...\n');

    let found = false;
    let testedCount = 0;
    const totalTests = UNIDADES_NEGOCIO.length * CENTROS_COSTO.length;

    // Primero probar solo unidad de negocio con el centro de costo más probable
    console.log('--- Fase 1: Probando códigos de unidad de negocio ---\n');
    for (const unidNegocio of UNIDADES_NEGOCIO) {
        testedCount++;
        const cenCos = 'A06';  // El más probable según el usuario

        process.stdout.write(`  [${testedCount}/${UNIDADES_NEGOCIO.length}] cod_unidnegocio="${unidNegocio}", cen_cos="${cenCos}"... `);

        const result = await testCombination(unidNegocio, cenCos, producto);

        if (result.success) {
            console.log('✅ ¡ÉXITO!');
            console.log('\n🎉 ¡ENCONTRADOS CÓDIGOS VÁLIDOS!');
            console.log(`   cod_unidnegocio: "${unidNegocio}"`);
            console.log(`   cen_cos: "${cenCos}"`);
            console.log('\nRespuesta:', JSON.stringify(result.data, null, 2));
            found = true;
            break;
        } else {
            // Verificar si el error es solo de unidad de negocio o también centro de costo
            const errors = result.errors?.['00001'] || [];
            const unidError = errors.some(e => e.includes('Unidad de negocio'));
            const cenCosError = errors.some(e => e.includes('Centro de costo'));

            if (!unidError && cenCosError) {
                // Unidad de negocio es correcta, buscar centro de costo
                console.log('✓ (unidad OK, buscando cen_cos)');

                console.log('\n--- Encontrada unidad de negocio válida: "' + unidNegocio + '" ---');
                console.log('--- Probando centros de costo ---\n');

                for (const cenCosTest of CENTROS_COSTO) {
                    process.stdout.write(`    cen_cos="${cenCosTest}"... `);
                    const result2 = await testCombination(unidNegocio, cenCosTest, producto);

                    if (result2.success) {
                        console.log('✅ ¡ÉXITO!');
                        console.log('\n🎉 ¡ENCONTRADOS CÓDIGOS VÁLIDOS!');
                        console.log(`   cod_unidnegocio: "${unidNegocio}"`);
                        console.log(`   cen_cos: "${cenCosTest}"`);
                        console.log('\nRespuesta:', JSON.stringify(result2.data, null, 2));
                        found = true;
                        break;
                    } else {
                        console.log('❌');
                    }
                }
                if (found) break;
            } else {
                console.log('❌');
            }
        }
    }

    if (!found) {
        console.log('\n--- Fase 2: Probando todas las combinaciones ---\n');
        testedCount = 0;

        for (const unidNegocio of UNIDADES_NEGOCIO) {
            for (const cenCos of CENTROS_COSTO) {
                testedCount++;
                process.stdout.write(`  [${testedCount}/${totalTests}] "${unidNegocio}" + "${cenCos}"... `);

                const result = await testCombination(unidNegocio, cenCos, producto);

                if (result.success) {
                    console.log('✅ ¡ÉXITO!');
                    console.log('\n🎉 ¡ENCONTRADOS CÓDIGOS VÁLIDOS!');
                    console.log(`   cod_unidnegocio: "${unidNegocio}"`);
                    console.log(`   cen_cos: "${cenCos}"`);
                    console.log('\nRespuesta:', JSON.stringify(result.data, null, 2));
                    found = true;
                    break;
                } else {
                    console.log('❌');
                }
            }
            if (found) break;
        }
    }

    if (!found) {
        console.log('\n❌ No se encontró ninguna combinación válida con los códigos probados.');
        console.log('   Por favor, verifica en Manager+ los códigos exactos de:');
        console.log('   - Unidad de negocio');
        console.log('   - Centro de costo');
    }

    process.exit(0);
}

main().catch(error => {
    console.error('Error fatal:', error.message);
    process.exit(1);
});
