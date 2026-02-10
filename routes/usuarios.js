/**
 * Rutas CRUD de usuarios (todas protegidas con JWT)
 */

const express = require('express');
const router = express.Router();
const { getUsuarios, createUsuario, updateUsuario, deleteUsuario } = require('../controllers/usuariosController');

// GET /api/usuarios - Listar todos los usuarios
router.get('/', getUsuarios);

// POST /api/usuarios - Crear un nuevo usuario
router.post('/', createUsuario);

// PUT /api/usuarios/:id - Editar usuario
router.put('/:id', updateUsuario);

// DELETE /api/usuarios/:id - Eliminar usuario
router.delete('/:id', deleteUsuario);

module.exports = router;
