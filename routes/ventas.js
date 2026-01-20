/**
 * Rutas de Ventas Monetarias
 */

const express = require('express');
const router = express.Router();
const { getVentasDashboard, getVentasResumen, getGraficosAvanzados } = require('../controllers/ventasController');

// GET /api/ventas/dashboard - Dashboard de ventas por producto
router.get('/dashboard', getVentasDashboard);

// GET /api/ventas/resumen - KPIs y resumen global
router.get('/resumen', getVentasResumen);

// GET /api/ventas/graficos-avanzados - Datos agregados para gráficos específicos
router.get('/graficos-avanzados', getGraficosAvanzados);

module.exports = router;
