/**
 * Test script para crear documentos OC y OCI en Manager+
 * 
 * Endpoint: POST /api/import/create-document/?emitir=0&docnumreg=1
 * 
 * OC = Orden de Compra (Nacional, CLP)
 * OCI = Orden de Compra de Importación (USD)
 */

require('dotenv').config();
const axios = require('axios');
const { getAuthHeaders } = require('../../utils/auth');
const { getPrismaClient } = require('../../prisma/client');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

const prisma = getPrismaClient();

/**
 * Formatear fecha como DD/MM/YYYY
 */
function formatDate(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

/**
 * Obtener un proveedor de las compras históricas
 */
async function getProviderFromPurchases() {
    console.log('\n📦 Buscando proveedor de compras históricas...');

    try {
        const compra = await prisma.compraHistorica.findFirst({
            where: {
                rutProveedor: { not: null }
            },
            select: {
                rutProveedor: true,
                proveedor: true
            }
        });

        if (compra && compra.rutProveedor) {
            console.log(`   ✅ Proveedor encontrado: ${compra.proveedor} (${compra.rutProveedor})`);
            return {
                rut: compra.rutProveedor,
                nombre: compra.proveedor || 'Proveedor Test'
            };
        }

        console.log('   ⚠️  No se encontró proveedor en compras históricas');
        return null;
    } catch (error) {
        console.error('   ❌ Error buscando proveedor:', error.message);
        return null;
    }
}

/**
 * Obtener productos para la orden
 */
async function getProductsForOrder(limit = 2) {
    console.log('\n📦 Obteniendo productos para la orden...');

    try {
        const productos = await prisma.producto.findMany({
            take: limit,
            select: {
                sku: true,
                descripcion: true,
                precioUltimaCompra: true,
                unidad: true   // Unidad de medida del producto
            }
        });

        console.log(`   ✅ Encontrados ${productos.length} productos`);
        return productos;
    } catch (error) {
        console.error('   ❌ Error obteniendo productos:', error.message);
        return [];
    }
}

/**
 * Crear una Orden de Compra Nacional (OC)
 */
async function testCreateOC(proveedor, productos) {
    console.log('\n' + '='.repeat(60));
    console.log('  TEST: CREAR ORDEN DE COMPRA NACIONAL (OC)');
    console.log('='.repeat(60));

    if (!proveedor) {
        console.log('❌ No hay proveedor disponible para el test');
        return null;
    }

    if (productos.length === 0) {
        console.log('❌ No hay productos disponibles para el test');
        return null;
    }

    try {
        const headers = await getAuthHeaders();

        // Construir URL con parámetros
        // emitir=0 (no emitir), docnumreg=1 (registrar número de documento automático)
        const url = `${ERP_BASE_URL}/import/create-document/?emitir=0&docnumreg=1`;

        const today = new Date();
        const vctoDate = new Date(today);
        vctoDate.setDate(vctoDate.getDate() + 30); // Vencimiento a 30 días

        // Construir detalles
        const detalles = productos.map(p => ({
            cod_producto: p.sku,
            cantidad: "1",
            unidad: p.unidad || "U",   // Usar unidad del producto
            precio_unit: String(p.precioUltimaCompra || 1000),
            moneda_det: "CLP",
            tasa_cambio_det: "1",
            nro_serie: "",
            num_lote: "",
            fecha_vec: "",
            cen_cos: "A06",   // Centro de costo
            tipo_desc: "",
            descuento: "",
            ubicacion: "",
            bodega: "",
            concepto1: "",
            concepto2: "",
            concepto3: "",
            concepto4: "",
            descrip: p.descripcion,
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
        }));

        // Calcular totales
        const totalNeto = detalles.reduce((sum, d) => sum + parseFloat(d.precio_unit) * parseFloat(d.cantidad), 0);
        const iva = Math.round(totalNeto * 0.19);
        const total = totalNeto + iva;

        const payload = {
            rut_empresa: RUT_EMPRESA,
            tipodocumento: "OC",  // Orden de Compra
            num_doc: String(Date.now()).slice(-6),   // Generar número único
            fecha_doc: formatDate(today),
            fecha_ref: "",
            fecha_vcto: formatDate(vctoDate),
            modalidad: "S",      // Simple
            cod_unidnegocio: "UNEG-001",   // Código de unidad de negocio
            rut_cliente: proveedor.rut,  // En compras, el "cliente" es el proveedor
            dire_cliente: "",
            rut_facturador: "",
            cod_vendedor: "",
            cod_comisionista: "",
            lista_precio: "",
            plazo_pago: "30",
            stock: "R",          // Reserva
            cod_moneda: "CLP",
            tasa_cambio: "1",
            afecto: String(Math.round(totalNeto)),
            exento: "0",
            iva: String(iva),
            imp_esp: "",
            iva_ret: "",
            imp_ret: "",
            tipo_desc_global: "",
            monto_desc_global: "",
            total: String(Math.round(total)),
            deuda_pendiente: "0",
            glosa: "Test OC creada desde AXAM Dashboard",
            ajuste_iva: "0",
            iva_proporcional: "A",
            detalles: detalles
        };

        console.log('\n📤 Enviando OC a Manager+...');
        console.log('   URL:', url);
        console.log('   Proveedor:', proveedor.nombre, `(${proveedor.rut})`);
        console.log('   Items:', detalles.length);
        console.log('   Total:', formatCurrency(total));
        console.log('\n   Payload:', JSON.stringify(payload, null, 2));

        const response = await axios.post(url, payload, {
            headers,
            timeout: 30000
        });

        console.log('\n✅ Respuesta exitosa:');
        console.log(JSON.stringify(response.data, null, 2));

        return response.data;

    } catch (error) {
        console.error('\n❌ Error creando OC:');
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('   Message:', error.message);
        }
        return null;
    }
}

/**
 * Crear una Orden de Compra de Importación (OCI)
 */
async function testCreateOCI(proveedor, productos) {
    console.log('\n' + '='.repeat(60));
    console.log('  TEST: CREAR ORDEN DE COMPRA DE IMPORTACIÓN (OCI)');
    console.log('='.repeat(60));

    if (!proveedor) {
        console.log('❌ No hay proveedor disponible para el test');
        return null;
    }

    if (productos.length === 0) {
        console.log('❌ No hay productos disponibles para el test');
        return null;
    }

    try {
        const headers = await getAuthHeaders();

        const url = `${ERP_BASE_URL}/import/create-document/?emitir=0&docnumreg=1`;

        const today = new Date();
        const vctoDate = new Date(today);
        vctoDate.setDate(vctoDate.getDate() + 60); // Vencimiento a 60 días para importación

        const tasaCambio = 950; // Ejemplo: 950 CLP por USD

        // Construir detalles en USD
        const detalles = productos.map(p => ({
            cod_producto: p.sku,
            cantidad: "1",
            unidad: p.unidad || "U",   // Usar unidad del producto
            precio_unit: "100",   // Precio en USD
            moneda_det: "USD",
            tasa_cambio_det: "1",   // Debe ser 1 si moneda_det = moneda documento
            nro_serie: "",
            num_lote: "",
            fecha_vec: "",
            cen_cos: "A06",   // Centro de costo
            tipo_desc: "",
            descuento: "",
            ubicacion: "",
            bodega: "",
            concepto1: "",
            concepto2: "",
            concepto3: "",
            concepto4: "",
            descrip: p.descripcion,
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
        }));

        // Calcular totales en USD
        const totalUSD = detalles.reduce((sum, d) => sum + parseFloat(d.precio_unit) * parseFloat(d.cantidad), 0);

        const payload = {
            rut_empresa: RUT_EMPRESA,
            tipodocumento: "OCI",  // Orden de Compra Importación
            num_doc: String(Date.now()).slice(-6),   // Generar número único
            fecha_doc: formatDate(today),
            fecha_ref: "",
            fecha_vcto: formatDate(vctoDate),
            modalidad: "S",
            cod_unidnegocio: "UNEG-001",   // Código de unidad de negocio
            rut_cliente: proveedor.rut,
            dire_cliente: "",
            rut_facturador: "",
            cod_vendedor: "",
            cod_comisionista: "",
            lista_precio: "",
            plazo_pago: "60",
            stock: "0",          // 0 para documentos que no mueven stock
            cod_moneda: "USD",
            tasa_cambio: String(tasaCambio),
            afecto: String(totalUSD),
            exento: "0",
            iva: "0",            // Sin IVA en importación
            imp_esp: "",
            iva_ret: "",
            imp_ret: "",
            tipo_desc_global: "",
            monto_desc_global: "",
            total: String(totalUSD),
            deuda_pendiente: "0",
            glosa: "Test OCI creada desde AXAM Dashboard - Container Test",
            ajuste_iva: "0",
            iva_proporcional: "A",
            detalles: detalles
        };

        console.log('\n📤 Enviando OCI a Manager+...');
        console.log('   URL:', url);
        console.log('   Proveedor:', proveedor.nombre, `(${proveedor.rut})`);
        console.log('   Items:', detalles.length);
        console.log('   Total USD:', totalUSD);
        console.log('   Tasa Cambio:', tasaCambio);
        console.log('\n   Payload:', JSON.stringify(payload, null, 2));

        const response = await axios.post(url, payload, {
            headers,
            timeout: 30000
        });

        console.log('\n✅ Respuesta exitosa:');
        console.log(JSON.stringify(response.data, null, 2));

        return response.data;

    } catch (error) {
        console.error('\n❌ Error creando OCI:');
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('   Message:', error.message);
        }
        return null;
    }
}

function formatCurrency(val) {
    return '$ ' + Math.round(val).toLocaleString('es-CL');
}

async function main() {
    console.log('\n' + '='.repeat(60));
    console.log('  TEST: CREACIÓN DE DOCUMENTOS EN MANAGER+');
    console.log('='.repeat(60));
    console.log('\nEmpresa:', RUT_EMPRESA);
    console.log('API Base:', ERP_BASE_URL);

    // Obtener datos de prueba
    let proveedor = await getProviderFromPurchases();
    const productos = await getProductsForOrder(2);

    if (!proveedor) {
        // Usar proveedor de prueba si no hay en la BD
        // ECOLAB SPA - RUT verificado de OCs existentes
        console.log('\n⚠️  Usando proveedor de prueba (ECOLAB)...');
        proveedor = {
            rut: '96604460-8',
            nombre: 'ECOLAB SPA'
        };
    }

    // Test OC
    console.log('\n\n--- INICIANDO TEST OC ---');
    const ocResult = await testCreateOC(proveedor, productos);

    // Test OCI
    console.log('\n\n--- INICIANDO TEST OCI ---');
    const ociResult = await testCreateOCI(proveedor, productos);

    // Resumen
    console.log('\n\n' + '='.repeat(60));
    console.log('  RESUMEN DE TESTS');
    console.log('='.repeat(60));
    console.log('OC:', ocResult ? '✅ Creada exitosamente' : '❌ Falló');
    console.log('OCI:', ociResult ? '✅ Creada exitosamente' : '❌ Falló');

    process.exit(0);
}

main().catch(error => {
    console.error('Error fatal:', error.message);
    process.exit(1);
});
