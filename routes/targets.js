const express = require('express');
const router = express.Router();
const { getTargets, saveObjetivo, saveProyeccion, getVentasPorVendedor } = require('../controllers/targetController');

// GET /api/targets?ano=2024&mes=1&vendedorId=XXX
router.get('/', getTargets);

// GET /api/targets/ventas?ano=2024
router.get('/ventas', getVentasPorVendedor);

// POST /api/targets/objetivo (Admin)
router.post('/objetivo', saveObjetivo);

// POST /api/targets/proyeccion (Vendedor - Propongo)
router.post('/proyeccion', saveProyeccion);

module.exports = router;
