/**
 * Script para obtener catálogos configurados en Manager+ que son requeridos
 * para la creación de OC/OCI
 */

require('dotenv').config();
const axios = require('axios');
const { getAuthHeaders } = require('../../utils/auth');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

async function getCatalogs() {
    console.log('\n='.repeat(60));
    console.log('  OBTENIENDO CATÁLOGOS DE MANAGER+');
    console.log('='.repeat(60));
    console.log('\nEmpresa:', RUT_EMPRESA);
    console.log('API Base:', ERP_BASE_URL);

    const headers = await getAuthHeaders();

    // Endpoints a probar para obtener catálogos
    const catalogs = [
        { name: 'Unidades de Negocio', path: '/business-units' },
        { name: 'Centros de Costo', path: '/cost-centers' },
        { name: 'Unidades de Medida', path: '/units' },
        { name: 'Monedas', path: '/currencies' },
        { name: 'Vendedores', path: '/sellers' },
        { name: 'Clientes', path: '/clients' },
        { name: 'Productos (sample)', path: `/products/${RUT_EMPRESA}?con_stock=N&limit=1` },
    ];

    for (const catalog of catalogs) {
        console.log(`\n📋 ${catalog.name}:`);
        console.log('   URL:', ERP_BASE_URL + catalog.path);

        try {
            const url = catalog.path.startsWith('/products')
                ? ERP_BASE_URL + catalog.path
                : `${ERP_BASE_URL}${catalog.path}/${RUT_EMPRESA}`;

            const response = await axios.get(url, {
                headers,
                timeout: 15000
            });

            const data = response.data.data || response.data;

            if (Array.isArray(data)) {
                console.log(`   ✅ Encontrados ${data.length} registros`);
                if (data.length > 0) {
                    // Mostrar primeros 3 registros
                    data.slice(0, 3).forEach((item, i) => {
                        console.log(`      [${i + 1}]`, JSON.stringify(item).slice(0, 200));
                    });
                }
            } else if (typeof data === 'object') {
                console.log('   Respuesta:', JSON.stringify(data).slice(0, 500));
            }

        } catch (error) {
            if (error.response) {
                console.log(`   ❌ Error ${error.response.status}:`,
                    error.response.data?.message || error.response.statusText);
            } else {
                console.log('   ❌ Error:', error.message);
            }
        }
    }

    // Obtener estructura de un producto específico para ver sus unidades
    console.log('\n\n📦 Obteniendo estructura de producto con unidades:');
    try {
        const url = `${ERP_BASE_URL}/products/${RUT_EMPRESA}?con_stock=S&con_listaprecios=S&limit=5`;
        console.log('   URL:', url);

        const response = await axios.get(url, {
            headers,
            timeout: 15000
        });

        const products = response.data.data || response.data;

        if (Array.isArray(products) && products.length > 0) {
            console.log(`\n   ✅ Productos con detalle de unidades:`);
            products.slice(0, 3).forEach((p, i) => {
                console.log(`\n   [${i + 1}] ${p.cod_prod || p.sku} - ${(p.descripcion || '').slice(0, 50)}`);
                // Buscar campos relacionados con unidades
                const unitFields = ['unidad', 'unidad_medida', 'unid', 'uom', 'unit', 'tipo_unidad', 'cod_unidad'];
                unitFields.forEach(field => {
                    if (p[field]) {
                        console.log(`       ${field}: "${p[field]}"`);
                    }
                });
                // Mostrar todos los campos si no encontramos unidades específicas
                const keys = Object.keys(p);
                const relevantKeys = keys.filter(k =>
                    k.toLowerCase().includes('unid') ||
                    k.toLowerCase().includes('unit') ||
                    k.toLowerCase().includes('uom')
                );
                if (relevantKeys.length > 0) {
                    console.log('       Campos con "unid/unit":', relevantKeys.map(k => `${k}="${p[k]}"`).join(', '));
                }
            });
        }

    } catch (error) {
        console.log('   ❌ Error:', error.message);
    }

    console.log('\n\n✅ Consulta de catálogos completada');
}

getCatalogs().catch(error => {
    console.error('Error fatal:', error.message);
    process.exit(1);
});
