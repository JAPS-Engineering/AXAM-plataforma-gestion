const express = require('express');
const router = express.Router();
const { getPrismaClient } = require('../prisma/client');
const { logError } = require('../utils/logger');
const { getYear, getMonth } = require('date-fns');

const prisma = getPrismaClient();

/**
 * GET /api/margenes
 * Obtiene datos para análisis de márgenes
 * Filtros: fechaInicio, fechaFin (YYYY-MM), familia, proveedor, vendedor
 *
 * CORRECCIONES:
 *  - Usa groupBy + _sum para agregar correctamente (evita duplicados por vendedor)
 *  - Incluye ventaActual del mes en curso cuando está dentro del rango
 *  - Excluye el mes actual de ventaHistorica para no doblar contabilizarlo
 */
router.get('/', async (req, res) => {
    try {
        const { fechaInicio, fechaFin, familia, proveedor, vendedor } = req.query;

        // ── Rango de fechas ──────────────────────────────────────────────────
        let yearStart = null, monthStart = null, yearEnd = null, monthEnd = null;

        if (fechaInicio && fechaFin) {
            [yearStart, monthStart] = fechaInicio.split('-').map(Number);
            [yearEnd, monthEnd] = fechaFin.split('-').map(Number);
        }

        // ── Mes actual del sistema ───────────────────────────────────────────
        const now = new Date();
        const anoActual = getYear(now);
        const mesActual = getMonth(now) + 1;

        // Determinar si el rango incluye el mes actual
        const startInt = yearStart ? yearStart * 100 + monthStart : 0;
        const endInt   = yearEnd   ? yearEnd   * 100 + monthEnd   : 999999;
        const currentInt = anoActual * 100 + mesActual;
        const incluirActual = currentInt >= startInt && currentInt <= endInt;

        // ── Filtro de fechas para ventaHistorica (excluye el mes actual) ────
        let histWhere = {};
        if (yearStart && yearEnd) {
            const orConditions = [];
            for (let y = yearStart; y <= yearEnd; y++) {
                const mStart = y === yearStart ? monthStart : 1;
                const mEnd   = y === yearEnd   ? monthEnd   : 12;
                for (let m = mStart; m <= mEnd; m++) {
                    if (!(y === anoActual && m === mesActual)) {
                        orConditions.push({ ano: y, mes: m });
                    }
                }
            }
            histWhere = orConditions.length > 0
                ? { OR: orConditions }
                : { ano: -1 }; // fuerza sin resultados si solo es el mes actual
        }

        if (vendedor) histWhere.vendedor = vendedor;

        // ── Filtro de producto ───────────────────────────────────────────────
        let productWhere = {};
        if (familia) productWhere.familia = familia;
        if (proveedor) productWhere.proveedor = proveedor;

        // ── 1. Ventas históricas agrupadas por producto ──────────────────────
        const histGrouped = await prisma.ventaHistorica.groupBy({
            by: ['productoId'],
            _sum: { cantidadVendida: true, montoNeto: true },
            where: Object.keys(histWhere).length > 0 ? histWhere : undefined,
        });

        const histMap = new Map();
        for (const row of histGrouped) {
            histMap.set(row.productoId, {
                cantidad: row._sum.cantidadVendida || 0,
                monto:    row._sum.montoNeto       || 0
            });
        }

        // ── 2. Ventas actuales del mes en curso ──────────────────────────────
        const actualMap = new Map();
        if (incluirActual) {
            const ventasActualesFiltro = {};
            if (vendedor) ventasActualesFiltro.vendedor = vendedor;

            const actualesGrouped = await prisma.ventaActual.groupBy({
                by: ['productoId'],
                _sum: { cantidadVendida: true, montoNeto: true },
                where: Object.keys(ventasActualesFiltro).length > 0 ? ventasActualesFiltro : undefined
            });
            for (const row of actualesGrouped) {
                actualMap.set(row.productoId, {
                    cantidad: row._sum.cantidadVendida || 0,
                    monto:    row._sum.montoNeto       || 0
                });
            }
        }

        // ── 3. Productos con precios ─────────────────────────────────────────
        const productos = await prisma.producto.findMany({
            where: productWhere,
            include: { preciosListas: true },
            orderBy: { sku: 'asc' }
        });

        // ── 4. Merge y formatear resultado ───────────────────────────────────
        const results = productos.map(p => {
            const hist = histMap.get(p.id)   || { cantidad: 0, monto: 0 };
            const act  = actualMap.get(p.id) || { cantidad: 0, monto: 0 };

            const totalCantidad = hist.cantidad + act.cantidad;
            const totalMonto    = hist.monto    + act.monto;

            const precio89  = p.preciosListas.find(pl => pl.listaId === 89)?.precioNeto  || null;
            const precio652 = p.preciosListas.find(pl => pl.listaId === 652)?.precioNeto || null;
            const precio386 = p.preciosListas.find(pl => pl.listaId === 386)?.precioNeto || null;

            return {
                id:          p.id,
                sku:         p.sku,
                descripcion: p.descripcion,
                familia:     p.familia,
                proveedor:   p.proveedor || p.familia,
                costo:       p.precioUltimaCompra,
                precio_89:   precio89,
                precio_652:  precio652,
                precio_386:  precio386,
                ventas_cantidad: totalCantidad,
                ventas_monto:    totalMonto
            };
        });

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
