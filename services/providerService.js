
const { getPrismaClient } = require('../prisma/client');
const { logInfo, logError } = require('../utils/logger');

const prisma = getPrismaClient();

/**
 * Infiere el proveedor de un producto basándose en su última compra histórica.
 * @param {number} productId - ID del producto en la base de datos
 * @returns {Promise<Object|null>} - Datos del proveedor encontrado { nombre, rut }
 */
async function inferFromHistory(productId) {
    try {
        const lastPurchase = await prisma.compraHistorica.findFirst({
            where: { productoId: productId },
            orderBy: { fecha: 'desc' },
            select: {
                proveedor: true,
                rutProveedor: true
            }
        });

        if (lastPurchase && (lastPurchase.proveedor || lastPurchase.rutProveedor)) {
            return {
                nombre: lastPurchase.proveedor || '',
                rut: lastPurchase.rutProveedor || ''
            };
        }

        return null;
    } catch (error) {
        logError(`Error al inferir proveedor para producto ${productId}: ${error.message}`);
        return null;
    }
}

/**
 * Sincroniza los proveedores de todos los productos que no tengan uno asignado
 * o actualiza basándose en la última compra.
 */
async function syncAllProviders() {
    logInfo('Iniciando sincronización masiva de proveedores desde el historial de compras...');

    try {
        const productos = await prisma.producto.findMany({
            select: { id: true, sku: true }
        });

        let actualizados = 0;

        for (const prod of productos) {
            const provider = await inferFromHistory(prod.id);
            if (provider) {
                await prisma.producto.update({
                    where: { id: prod.id },
                    data: {
                        proveedor: provider.nombre,
                        rutProveedor: provider.rut
                    }
                });
                actualizados++;
            }
        }

        logInfo(`Sincronización de proveedores completada. ${actualizados} productos actualizados.`);
        return { success: true, actualizados };
    } catch (error) {
        logError(`Error en syncAllProviders: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Actualiza manualmente el proveedor de un producto.
 */
async function updateProductProvider(productId, nombre, rut) {
    try {
        await prisma.producto.update({
            where: { id: productId },
            data: {
                proveedor: nombre,
                rutProveedor: rut
            }
        });
        return { success: true };
    } catch (error) {
        logError(`Error al actualizar proveedor para producto ${productId}: ${error.message}`);
        return { success: false, error: error.message };
    }
}

module.exports = {
    inferFromHistory,
    syncAllProviders,
    updateProductProvider
};
