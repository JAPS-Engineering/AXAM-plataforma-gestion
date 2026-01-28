const express = require('express');
const router = express.Router();
const { getTargets, saveObjetivo, saveProyeccion } = require('../controllers/targetController');

// GET /api/targets?ano=2024&mes=1&vendedorId=XXX
router.get('/', getTargets);

// POST /api/targets/objetivo (Admin)
router.post('/objetivo', saveObjetivo);

// POST /api/targets/proyeccion (Vendedor - Propongo)
router.post('/proyeccion', saveProyeccion);

module.exports = router;
