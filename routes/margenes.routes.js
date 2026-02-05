const express = require('express');
const router = express.Router();
const { getDatabase } = require('../utils/database'); // Using sqlite database directly for complex queries
const { logError } = require('../utils/logger');

/**
 * GET /api/margenes
 * Obtiene datos para análisis de márgenes
 * Filtros: fechaInicio, fechaFin (YYYY-MM), familia, proveedor, vendedor
 */
router.get('/', async (req, res) => {
    const db = getDatabase();
    try {
        const { fechaInicio, fechaFin, familia, proveedor, vendedor } = req.query;

        // Construir filtros de fecha para ventas
        // fechaInicio y fechaFin vienen como "YYYY-MM"
        let dateFilter = '';
        const params = [];

        if (fechaInicio && fechaFin) {
            const [yearStart, monthStart] = fechaInicio.split('-').map(Number);
            const [yearEnd, monthEnd] = fechaFin.split('-').map(Number);

            // Lógica simple: (ano > startY OR (ano = startY AND mes >= startM)) AND (ano < endY OR (ano = endY AND mes <= endM))
            // Para simplificar en SQL: ano * 100 + mes BETWEEN start AND end
            const startVal = yearStart * 100 + monthStart;
            const endVal = yearEnd * 100 + monthEnd;

            dateFilter = `AND (v.ano * 100 + v.mes) BETWEEN ? AND ?`;
            params.push(startVal, endVal);
        }

        // Filtros adicionales
        let productFilter = '';
        if (familia) {
            productFilter += ` AND p.familia = ?`;
            params.push(familia);
        }
        if (proveedor) {
            productFilter += ` AND p.proveedor = ?`;
            params.push(proveedor);
        }

        // El filtro de vendedor se aplica a las ventas
        let sellerFilter = '';
        if (vendedor) {
            sellerFilter = ` AND v.vendedor = ?`;
            params.push(vendedor);
        }

        // Query Principal
        // 1. Obtener datos básicos de productos + costos
        // 2. Unir precios de listas (PIVOT manual)
        // 3. Unir ventas agregadas

        const query = `
            WITH VentasAgg AS (
                SELECT 
                    producto_id,
                    SUM(cantidad_vendida) as total_cantidad,
                    SUM(monto_neto) as total_monto
                FROM ventas_mensuales v
                WHERE 1=1 ${dateFilter} ${sellerFilter}
                GROUP BY producto_id
            ),
            PreciosPivot AS (
                SELECT 
                    producto_id,
                    MAX(CASE WHEN lista_id = 89 THEN precio_neto END) as precio_89,
                    MAX(CASE WHEN lista_id = 652 THEN precio_neto END) as precio_652,
                    MAX(CASE WHEN lista_id = 386 THEN precio_neto END) as precio_386
                FROM precios_listas
                GROUP BY producto_id
            )
            SELECT 
                p.id,
                p.sku,
                p.descripcion,
                p.familia,
                COALESCE(NULLIF(p.proveedor, ''), p.familia) as proveedor,
                p.precio_ultima_compra as costo,
                pl.precio_89,
                pl.precio_652,
                pl.precio_386,
                COALESCE(va.total_cantidad, 0) as ventas_cantidad,
                COALESCE(va.total_monto, 0) as ventas_monto
            FROM productos p
            LEFT JOIN PreciosPivot pl ON p.id = pl.producto_id
            LEFT JOIN VentasAgg va ON p.id = va.producto_id
            WHERE 1=1 ${productFilter}
            -- Ordenar por ventas descendente por defecto
            ORDER BY va.total_monto DESC
        `;

        const results = db.prepare(query).all(...params);

        // Calcular márgenes en el backend o frontend? Mejor entregar datos crudos y calculados
        // Pero para el frontend es fácil calcular.
        // Enviamos los datos tal cual.

        res.json({
            success: true,
            count: results.length,
            data: results
        });

    } catch (error) {
        logError(`Error en /api/margenes: ${error.message}`);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
