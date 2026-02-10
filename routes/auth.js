/**
 * Rutas de autenticación
 */

const express = require('express');
const router = express.Router();
const { login, getMe } = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');

// POST /api/auth/login - Login (pública)
router.post('/login', login);

// GET /api/auth/me - Obtener usuario actual (protegida)
router.get('/me', authMiddleware, getMe);

module.exports = router;
