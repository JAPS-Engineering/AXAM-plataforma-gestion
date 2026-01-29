/**
 * Rutas de Ventas Monetarias
 */

const express = require('express');
const router = express.Router();
const { getVentasDashboard, getVentasResumen, getGraficosAvanzados, getVentasTendencias } = require('../controllers/ventasController');

// GET /api/ventas/dashboard - Dashboard de ventas por producto
router.get('/dashboard', getVentasDashboard);

// GET /api/ventas/resumen - KPIs y resumen global
router.get('/resumen', getVentasResumen);

// GET /api/ventas/graficos-avanzados - Datos agregados para gráficos específicos
router.get('/graficos-avanzados', getGraficosAvanzados);

// GET /api/ventas/tendencias - Datos para gráfico stacked de tendencias
router.get('/tendencias', getVentasTendencias);

module.exports = router;
