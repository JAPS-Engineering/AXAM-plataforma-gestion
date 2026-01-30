const { getPrismaClient } = require('../prisma/client');
const { logError } = require('../utils/logger');

const prisma = getPrismaClient();

/**
 * Listar todos los vendedores
 */
async function getVendedores(req, res) {
    try {
        const vendedores = await prisma.vendedor.findMany({
            orderBy: { nombre: 'asc' }
        });
        res.json(vendedores);
    } catch (error) {
        logError(`Error en getVendedores: ${error.message}`);
        res.status(500).json({ error: 'Error al obtener vendedores' });
    }
}

/**
 * Actualizar un vendedor (apodo o estado activo)
 */
async function updateVendedor(req, res) {
    try {
        const { id } = req.params;
        const { nombre, activo } = req.body;

        const vendedor = await prisma.vendedor.update({
            where: { id: parseInt(id) },
            data: { nombre, activo }
        });

        res.json(vendedor);
    } catch (error) {
        logError(`Error en updateVendedor: ${error.message}`);
        res.status(500).json({ error: 'Error al actualizar vendedor' });
    }
}

/**
 * Eliminar un vendedor
 */
async function deleteVendedor(req, res) {
    try {
        const { id } = req.params;
        await prisma.vendedor.delete({
            where: { id: parseInt(id) }
        });
        res.json({ message: 'Vendedor eliminado correctamente' });
    } catch (error) {
        logError(`Error en deleteVendedor: ${error.message}`);
        res.status(500).json({ error: 'Error al eliminar vendedor' });
    }
}

module.exports = {
    getVendedores,
    updateVendedor,
    deleteVendedor
};
