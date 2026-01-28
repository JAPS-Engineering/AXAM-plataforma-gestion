/**
 * Script de prueba para ver la estructura real de un producto en el ERP
 */

require('dotenv').config();
const axios = require('axios');
const { getAuthHeaders } = require('../utils/auth');

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

async function testProductData() {
    try {
        console.log('🔐 Autenticando...');
        const headers = await getAuthHeaders();

        // Obtener solo 5 productos para inspeccionar
        const url = `${ERP_BASE_URL}/products/${RUT_EMPRESA}?limit=5&pic=1`;
        console.log(`📡 Consultando URL: ${url}`);

        const response = await axios.get(url, { headers });
        const products = response.data.data || response.data || [];

        if (!Array.isArray(products) || products.length === 0) {
            console.log('⚠️ No se obtuvieron productos.');
            return;
        }

        console.log(`✅ Se obtuvieron ${products.length} productos.`);
        console.log('============================================================');
        console.log('ESTRUCTURA DEL PRIMER PRODUCTO:');
        console.log(JSON.stringify(products[0], null, 2));
        console.log('============================================================');

        // Buscar campos que podrían ser Familia o Marca
        const first = products[0];
        const possibleFields = [
            'familia', 'cod_familia', 'desc_familia',
            'marca', 'cod_marca', 'desc_marca',
            'tipo', 'grupo', 'subgrupo',
            'proveedor', 'nom_proveedor', 'nombre_proveedor'
        ];

        console.log('POSIBLES VALORES DE INTERÉS:');
        possibleFields.forEach(f => {
            if (first[f] !== undefined) {
                console.log(` - ${f}: ${first[f]}`);
            }
        });

    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

testProductData();
