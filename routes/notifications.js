/**
 * Rutas para gestión de notificaciones
 */

const express = require('express');
const router = express.Router();
const { getPrismaClient } = require('../prisma/client');
const { sendTestEmail, verifyConnection } = require('../services/emailService');

const prisma = getPrismaClient();

// GET /api/notifications/emails - Listar emails configurados
router.get('/emails', async (req, res) => {
    try {
        const emails = await prisma.emailNotificacion.findMany({
            where: { tipo: 'STOCK_BAJO' },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ emails });
    } catch (error) {
        console.error('Error obteniendo emails:', error);
        res.status(500).json({ error: 'Error al obtener emails' });
    }
});

// POST /api/notifications/emails - Agregar email
router.post('/emails', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'Email inválido' });
        }

        const normalized = email.toLowerCase().trim();

        // Verificar si ya existe
        const existing = await prisma.emailNotificacion.findUnique({
            where: { email: normalized }
        });

        if (existing) {
            // Si existe pero está inactivo, reactivarlo
            if (!existing.activo) {
                const updated = await prisma.emailNotificacion.update({
                    where: { email: normalized },
                    data: { activo: true }
                });
                return res.json({ email: updated, reactivated: true });
            }
            return res.status(400).json({ error: 'Este email ya está configurado' });
        }

        const newEmail = await prisma.emailNotificacion.create({
            data: {
                email: normalized,
                tipo: 'STOCK_BAJO',
                activo: true
            }
        });

        res.status(201).json({ email: newEmail });
    } catch (error) {
        console.error('Error agregando email:', error);
        res.status(500).json({ error: 'Error al agregar email' });
    }
});

// DELETE /api/notifications/emails/:email - Eliminar email
router.delete('/emails/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const normalized = decodeURIComponent(email).toLowerCase().trim();

        await prisma.emailNotificacion.delete({
            where: { email: normalized }
        });

        res.json({ success: true });
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Email no encontrado' });
        }
        console.error('Error eliminando email:', error);
        res.status(500).json({ error: 'Error al eliminar email' });
    }
});

// PATCH /api/notifications/emails/:email/toggle - Activar/Desactivar email
router.patch('/emails/:email/toggle', async (req, res) => {
    try {
        const { email } = req.params;
        const normalized = decodeURIComponent(email).toLowerCase().trim();

        const existing = await prisma.emailNotificacion.findUnique({
            where: { email: normalized }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Email no encontrado' });
        }

        const updated = await prisma.emailNotificacion.update({
            where: { email: normalized },
            data: { activo: !existing.activo }
        });

        res.json({ email: updated });
    } catch (error) {
        console.error('Error actualizando email:', error);
        res.status(500).json({ error: 'Error al actualizar email' });
    }
});

// POST /api/notifications/test - Enviar email de prueba
router.post('/test', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'Email inválido' });
        }

        const result = await sendTestEmail(email.toLowerCase().trim());

        if (result.success) {
            res.json({ success: true, messageId: result.messageId });
        } else {
            res.status(500).json({ error: result.error });
        }
    } catch (error) {
        console.error('Error enviando email de prueba:', error);
        res.status(500).json({ error: 'Error al enviar email de prueba' });
    }
});

// GET /api/notifications/status - Verificar estado del servicio de email
router.get('/status', async (req, res) => {
    try {
        const connected = await verifyConnection();
        const emailCount = await prisma.emailNotificacion.count({
            where: { activo: true, tipo: 'STOCK_BAJO' }
        });

        res.json({
            emailConfigured: connected,
            activeRecipients: emailCount
        });
    } catch (error) {
        console.error('Error verificando estado:', error);
        res.status(500).json({ error: 'Error al verificar estado' });
    }
});

module.exports = router;
