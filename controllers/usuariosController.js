/**
 * Controlador CRUD de usuarios
 */

const bcrypt = require('bcrypt');
const { getPrismaClient } = require('../prisma/client');

const SALT_ROUNDS = 10;

/**
 * GET /api/usuarios
 * Listar todos los usuarios (sin devolver passwordHash)
 */
async function getUsuarios(req, res) {
    try {
        const prisma = getPrismaClient();
        const usuarios = await prisma.usuario.findMany({
            select: {
                id: true,
                username: true,
                nombre: true,
                activo: true,
                createdAt: true,
                updatedAt: true
            },
            orderBy: { createdAt: 'asc' }
        });

        res.json(usuarios);
    } catch (error) {
        console.error('Error al listar usuarios:', error);
        res.status(500).json({ error: 'Error al listar usuarios' });
    }
}

/**
 * POST /api/usuarios
 * Crear un nuevo usuario
 */
async function createUsuario(req, res) {
    try {
        const { username, password, nombre } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username y contraseña son requeridos' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
        }

        const prisma = getPrismaClient();

        // Verificar que no exista
        const existing = await prisma.usuario.findUnique({
            where: { username: username.toLowerCase().trim() }
        });

        if (existing) {
            return res.status(409).json({ error: 'El nombre de usuario ya existe' });
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        const usuario = await prisma.usuario.create({
            data: {
                username: username.toLowerCase().trim(),
                passwordHash,
                nombre: nombre || ''
            },
            select: {
                id: true,
                username: true,
                nombre: true,
                activo: true,
                createdAt: true,
                updatedAt: true
            }
        });

        res.status(201).json(usuario);
    } catch (error) {
        console.error('Error al crear usuario:', error);
        res.status(500).json({ error: 'Error al crear usuario' });
    }
}

/**
 * PUT /api/usuarios/:id
 * Editar usuario (nombre, username, contraseña, activo)
 */
async function updateUsuario(req, res) {
    try {
        const { id } = req.params;
        const { username, password, nombre, activo } = req.body;

        const prisma = getPrismaClient();

        const existing = await prisma.usuario.findUnique({
            where: { id: parseInt(id) }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const updateData = {};

        if (username !== undefined) {
            const normalizedUsername = username.toLowerCase().trim();
            // Check if another user already has this username
            const duplicate = await prisma.usuario.findFirst({
                where: {
                    username: normalizedUsername,
                    NOT: { id: parseInt(id) }
                }
            });
            if (duplicate) {
                return res.status(409).json({ error: 'El nombre de usuario ya está en uso' });
            }
            updateData.username = normalizedUsername;
        }

        if (password !== undefined && password !== '') {
            if (password.length < 6) {
                return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
            }
            updateData.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        }

        if (nombre !== undefined) {
            updateData.nombre = nombre;
        }

        if (activo !== undefined) {
            updateData.activo = activo;
        }

        const usuario = await prisma.usuario.update({
            where: { id: parseInt(id) },
            data: updateData,
            select: {
                id: true,
                username: true,
                nombre: true,
                activo: true,
                createdAt: true,
                updatedAt: true
            }
        });

        res.json(usuario);
    } catch (error) {
        console.error('Error al actualizar usuario:', error);
        res.status(500).json({ error: 'Error al actualizar usuario' });
    }
}

/**
 * DELETE /api/usuarios/:id
 * Eliminar usuario
 */
async function deleteUsuario(req, res) {
    try {
        const { id } = req.params;
        const prisma = getPrismaClient();

        // No permitir eliminar al propio usuario
        if (req.user.id === parseInt(id)) {
            return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
        }

        const existing = await prisma.usuario.findUnique({
            where: { id: parseInt(id) }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        await prisma.usuario.delete({
            where: { id: parseInt(id) }
        });

        res.json({ message: 'Usuario eliminado correctamente' });
    } catch (error) {
        console.error('Error al eliminar usuario:', error);
        res.status(500).json({ error: 'Error al eliminar usuario' });
    }
}

module.exports = { getUsuarios, createUsuario, updateUsuario, deleteUsuario };
