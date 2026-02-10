/**
 * Controlador de autenticación
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getPrismaClient } = require('../prisma/client');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * POST /api/auth/login
 * Login con username y password
 */
async function login(req, res) {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username y contraseña son requeridos' });
        }

        const prisma = getPrismaClient();
        const usuario = await prisma.usuario.findUnique({
            where: { username: username.toLowerCase().trim() }
        });

        if (!usuario) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        if (!usuario.activo) {
            return res.status(401).json({ error: 'Usuario desactivado. Contacte al administrador.' });
        }

        const passwordValid = await bcrypt.compare(password, usuario.passwordHash);
        if (!passwordValid) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        // Generar JWT
        const token = jwt.sign(
            {
                id: usuario.id,
                username: usuario.username,
                nombre: usuario.nombre
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        res.json({
            token,
            user: {
                id: usuario.id,
                username: usuario.username,
                nombre: usuario.nombre
            }
        });
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

/**
 * GET /api/auth/me
 * Obtener datos del usuario autenticado
 */
async function getMe(req, res) {
    try {
        const prisma = getPrismaClient();
        const usuario = await prisma.usuario.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                username: true,
                nombre: true,
                activo: true,
                createdAt: true
            }
        });

        if (!usuario) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.json(usuario);
    } catch (error) {
        console.error('Error en getMe:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

module.exports = { login, getMe };
