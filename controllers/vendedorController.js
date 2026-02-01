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
 * Actualizar un vendedor (apodo, estado activo u oculto)
 */
async function updateVendedor(req, res) {
    try {
        const { id } = req.params;
        const { nombre, activo, oculto } = req.body;

        const vendedor = await prisma.vendedor.update({
            where: { id: parseInt(id) },
            data: { nombre, activo, oculto }
        });

        res.json(vendedor);
    } catch (error) {
        logError(`Error en updateVendedor: ${error.message}`);
        res.status(500).json({ error: 'Error al actualizar vendedor' });
    }
}

module.exports = {
    getVendedores,
    updateVendedor
};
