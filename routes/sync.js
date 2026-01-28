const express = require('express');
const router = express.Router();
const { getPrismaClient } = require('../prisma/client');
const { logInfo, logError } = require('../utils/logger');

const prisma = getPrismaClient();

/**
 * POST /api/sync/pendientes
 * Recibe datos de pendientes desde el bookmarklet (Manager+)
 * Body: { data: Record<string, number> }
 */
router.post('/pendientes', async (req, res) => {
    try {
        const { data } = req.body;

        if (!data || typeof data !== 'object') {
            return res.status(400).json({ error: 'Datos de pendientes no válidos' });
        }

        logInfo(`Recibiendo sincronización de pendientes (${Object.keys(data).length} productos)`);

        // Guardar en la tabla de Configuracion
        await prisma.configuracion.upsert({
            where: { clave: 'pendientes_manager' },
            update: {
                valor: JSON.stringify(data),
                descripcion: `Última sincronización manual: ${new Date().toLocaleString()}`
            },
            create: {
                clave: 'pendientes_manager',
                valor: JSON.stringify(data),
                descripcion: `Sincronización inicial: ${new Date().toLocaleString()}`
            }
        });

        res.json({ success: true, message: 'Pendientes sincronizados correctamente' });

    } catch (error) {
        logError(`Error en POST /api/sync/pendientes: ${error.message}`);
        res.status(500).json({ error: 'Error al persistir sincronización', message: error.message });
    }
});

/**
 * GET /api/sync/pendientes-data
 * Recupera los últimos datos de pendientes guardados
 */
router.get('/pendientes-data', async (req, res) => {
    try {
        const config = await prisma.configuracion.findUnique({
            where: { clave: 'pendientes_manager' }
        });

        if (!config) {
            return res.json({ success: true, data: {} });
        }

        res.json({
            success: true,
            data: JSON.parse(config.valor),
            updatedAt: config.updatedAt
        });

    } catch (error) {
        logError(`Error en GET /api/sync/pendientes-data: ${error.message}`);
        res.status(500).json({ error: 'Error al recuperar datos', message: error.message });
    }
});

module.exports = router;
