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
    updateStockMinimo,
    updateLogistica,
    getHistorialStock
} = require('../controllers/productosController');

// GET /api/productos/ventas-historicas?meses=12&marca=KC
router.get('/ventas-historicas', getVentasHistoricas);

// GET /api/productos/ventas-actuales?marca=KC
router.get('/ventas-actuales', getVentasActuales);

// GET /api/productos/completo?meses=12&marca=KC
router.get('/completo', getProductosCompleto);

// GET /api/productos/minimos?page=1&pageSize=20&search=&filter=todos
router.get('/minimos', getProductosMinimos);

// GET /api/productos/historial-stock?sku=XXX&dias=30
router.get('/historial-stock', getHistorialStock);

// PATCH /api/productos/:id/minimo - Actualizar stock mínimo
router.patch('/:id/minimo', updateStockMinimo);

// PATCH /api/productos/:id/logistica - Actualizar parámetros logísticos
router.patch('/:id/logistica', updateLogistica);

module.exports = router;

