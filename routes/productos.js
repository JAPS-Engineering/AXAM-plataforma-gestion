/**
 * Rutas para endpoints de productos
 */

const express = require('express');
const router = express.Router();
const {
    getVentasHistoricas,
    getVentasActuales,
    getProductosCompleto,
    getProductosMinimos,
    updateStockMinimo
} = require('../controllers/productosController');

// GET /api/productos/ventas-historicas?meses=12&marca=KC
router.get('/ventas-historicas', getVentasHistoricas);

// GET /api/productos/ventas-actuales?marca=KC
router.get('/ventas-actuales', getVentasActuales);

// GET /api/productos/completo?meses=12&marca=KC
router.get('/completo', getProductosCompleto);

// GET /api/productos/minimos?page=1&pageSize=20&search=&filter=todos
router.get('/minimos', getProductosMinimos);

// PATCH /api/productos/:id/minimo - Actualizar stock mínimo
router.patch('/:id/minimo', updateStockMinimo);

module.exports = router;

