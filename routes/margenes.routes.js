const express = require('express');
const router = express.Router();
const { getPrismaClient } = require('../prisma/client');
const { logError } = require('../utils/logger');

const prisma = getPrismaClient();

/**
 * GET /api/margenes
 * Obtiene datos para análisis de márgenes
 * Filtros: fechaInicio, fechaFin (YYYY-MM), familia, proveedor, vendedor
 */
router.get('/', async (req, res) => {
    try {
        const { fechaInicio, fechaFin, familia, proveedor, vendedor } = req.query;

        // Construir filtros de fecha para ventas
        let ventasWhere = {};

        if (fechaInicio && fechaFin) {
            const [yearStart, monthStart] = fechaInicio.split('-').map(Number);
            const [yearEnd, monthEnd] = fechaFin.split('-').map(Number);

            ventasWhere = {
                OR: []
            };

            // Create date range filter
            for (let y = yearStart; y <= yearEnd; y++) {
                const mStart = y === yearStart ? monthStart : 1;
                const mEnd = y === yearEnd ? monthEnd : 12;
                for (let m = mStart; m <= mEnd; m++) {
                    ventasWhere.OR.push({ ano: y, mes: m });
                }
            }
        }

        if (vendedor) {
            ventasWhere.vendedor = vendedor;
        }

        // Filtros de producto
        let productWhere = {};
        if (familia) productWhere.familia = familia;
        if (proveedor) productWhere.proveedor = proveedor;

        // Obtener productos con ventas y precios
        const productos = await prisma.producto.findMany({
            where: productWhere,
            include: {
                ventasHistoricas: {
                    where: Object.keys(ventasWhere).length > 0 ? ventasWhere : undefined
                },
                preciosListas: true
            }
        });

        // Procesar resultados
        const results = productos.map(p => {
            // Agregar ventas
            const totalCantidad = p.ventasHistoricas.reduce((sum, v) => sum + v.cantidadVendida, 0);
            const totalMonto = p.ventasHistoricas.reduce((sum, v) => sum + v.montoNeto, 0);

            // Pivot precios
            const precio89 = p.preciosListas.find(pl => pl.listaId === 89)?.precioNeto || null;
            const precio652 = p.preciosListas.find(pl => pl.listaId === 652)?.precioNeto || null;
            const precio386 = p.preciosListas.find(pl => pl.listaId === 386)?.precioNeto || null;

            return {
                id: p.id,
                sku: p.sku,
                descripcion: p.descripcion,
                familia: p.familia,
                proveedor: p.proveedor || p.familia,
                costo: p.precioUltimaCompra,
                precio_89: precio89,
                precio_652: precio652,
                precio_386: precio386,
                ventas_cantidad: totalCantidad,
                ventas_monto: totalMonto
            };
        });

        // Ordenar por ventas descendente
        results.sort((a, b) => b.ventas_monto - a.ventas_monto);

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
