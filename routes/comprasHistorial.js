/**
 * API Routes para Compras Históricas
 */

const express = require('express');
const router = express.Router();
const { getPrismaClient } = require('../prisma/client');

const prisma = getPrismaClient();

/**
 * GET /api/compras/historico
 * Lista compras históricas con filtros
 * Query params: page, pageSize, sku, familia, proveedor, fechaInicio, fechaFin
 */
router.get('/historico', async (req, res) => {
    try {
        const {
            page = 1,
            pageSize = 20,
            sku,
            familia,
            proveedor,
            fechaInicio,
            fechaFin,
            sortBy = "fecha",
            sortOrder = "desc"
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(pageSize);
        const take = parseInt(pageSize);

        // Construir where clause
        const where = {};

        if (sku) {
            where.producto = { sku: { contains: sku } };
        }

        if (familia) {
            where.producto = { ...where.producto, familia };
        }

        if (proveedor) {
            where.proveedor = { contains: proveedor };
        }

        if (fechaInicio || fechaFin) {
            where.fecha = {};
            if (fechaInicio) where.fecha.gte = new Date(fechaInicio);
            if (fechaFin) {
                // Include entire end day by adding one day then using 'lt' instead of 'lte'
                // Or add T23:59:59.999Z to the date string
                where.fecha.lte = new Date(fechaFin + 'T23:59:59.999Z');
            }
        }

        // Construir orderBy
        let orderBy = {};
        const direction = sortOrder === 'asc' ? 'asc' : 'desc';

        switch (sortBy) {
            case 'sku':
                orderBy = { producto: { sku: direction } };
                break;
            case 'descripcion':
                orderBy = { producto: { descripcion: direction } };
                break;
            case 'familia':
                orderBy = { producto: { familia: direction } };
                break;
            case 'cantidad':
                orderBy = { cantidad: direction };
                break;
            case 'precioUnitario':
                orderBy = { precioUnitario: direction };
                break;
            case 'costoUltima':
                orderBy = { producto: { precioUltimaCompra: direction } };
                break;
            case 'proveedor':
                orderBy = { proveedor: direction };
                break;
            case 'folio':
                orderBy = { folio: direction };
                break;
            case 'fecha':
            default:
                orderBy = { fecha: direction };
                break;
        }

        const [compras, total] = await Promise.all([
            prisma.compraHistorica.findMany({
                where,
                include: {
                    producto: {
                        select: {
                            sku: true,
                            descripcion: true,
                            familia: true,
                            precioUltimaCompra: true
                        }
                    }
                },
                orderBy,
                skip,
                take
            }),
            prisma.compraHistorica.count({ where })
        ]);

        res.json({
            compras,
            total,
            page: parseInt(page),
            pageSize: parseInt(pageSize),
            totalPages: Math.ceil(total / parseInt(pageSize))
        });

    } catch (error) {
        console.error('Error al obtener historial de compras:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/compras/resumen
 * Resumen mensual de compras (totales por mes)
 * Query params: meses (default 12)
 */
router.get('/resumen', async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = req.query;
        let meses = parseInt(req.query.meses) || 12;

        const where = {};
        let startDate;

        if (fechaInicio && fechaFin) {
            where.fecha = {
                gte: new Date(fechaInicio),
                lte: new Date(fechaFin + 'T23:59:59.999Z')
            };
        } else {
            // Fallback to "last N months" logic if no specific range provided
            startDate = new Date();
            startDate.setMonth(startDate.getMonth() - meses);
            startDate.setDate(1); // Start of that month
            where.fecha = {
                gte: startDate
            };
        }

        const compras = await prisma.compraHistorica.findMany({
            where,
            select: {
                fecha: true,
                cantidad: true,
                precioUnitario: true
            },
            orderBy: { fecha: 'desc' }
        });

        // Agrupar por mes
        const resumenPorMes = new Map();

        for (const compra of compras) {
            const fecha = new Date(compra.fecha);
            const key = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;

            if (!resumenPorMes.has(key)) {
                resumenPorMes.set(key, {
                    ano: fecha.getFullYear(),
                    mes: fecha.getMonth() + 1,
                    totalCompras: 0,
                    totalMonto: 0,
                    cantidadTotal: 0
                });
            }

            const resumen = resumenPorMes.get(key);
            resumen.totalCompras++;
            resumen.totalMonto += compra.cantidad * compra.precioUnitario;
            resumen.cantidadTotal += compra.cantidad;
        }

        // Convertir a array
        const resultado = Array.from(resumenPorMes.values())
            .sort((a, b) => {
                if (a.ano !== b.ano) return b.ano - a.ano;
                return b.mes - a.mes;
            });
        // Removed specific slice since we filtered by date in DB

        res.json({ resumen: resultado });

    } catch (error) {
        console.error('Error al obtener resumen de compras:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/compras/productos/:sku/evolucion
 * Evolución de precio de compra de un producto específico
 */
router.get('/productos/:sku/evolucion', async (req, res) => {
    try {
        const { sku } = req.params;
        const meses = parseInt(req.query.meses) || 24;

        const producto = await prisma.producto.findUnique({
            where: { sku },
            select: { id: true, sku: true, descripcion: true, familia: true, precioUltimaCompra: true, fechaUltimaCompra: true }
        });

        if (!producto) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        const compras = await prisma.compraHistorica.findMany({
            where: { productoId: producto.id },
            select: {
                fecha: true,
                cantidad: true,
                precioUnitario: true,
                proveedor: true,
                folio: true
            },
            orderBy: { fecha: 'asc' }
        });

        // Agrupar por mes para gráfico
        const evolucionMensual = new Map();

        for (const compra of compras) {
            const fecha = new Date(compra.fecha);
            const key = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;

            if (!evolucionMensual.has(key)) {
                evolucionMensual.set(key, {
                    periodo: key,
                    ano: fecha.getFullYear(),
                    mes: fecha.getMonth() + 1,
                    precioPromedio: 0,
                    precioMin: Infinity,
                    precioMax: 0,
                    cantidadTotal: 0,
                    compras: 0
                });
            }

            const ev = evolucionMensual.get(key);
            ev.compras++;
            ev.cantidadTotal += compra.cantidad;
            ev.precioPromedio = (ev.precioPromedio * (ev.compras - 1) + compra.precioUnitario) / ev.compras;
            ev.precioMin = Math.min(ev.precioMin, compra.precioUnitario);
            ev.precioMax = Math.max(ev.precioMax, compra.precioUnitario);
        }

        // Convertir a array
        const evolucion = Array.from(evolucionMensual.values())
            .map(e => ({
                ...e,
                precioMin: e.precioMin === Infinity ? 0 : e.precioMin
            }))
            .sort((a, b) => a.periodo.localeCompare(b.periodo))
            .slice(-meses);

        res.json({
            producto,
            evolucion,
            totalCompras: compras.length
        });

    } catch (error) {
        console.error('Error al obtener evolución de precios:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/compras/familias/:familia/evolucion
 * Evolución de precio promedio de una familia
 */
router.get('/familias/:familia/evolucion', async (req, res) => {
    try {
        const { familia } = req.params;
        const meses = parseInt(req.query.meses) || 24;

        // Obtener productos de la familia
        const productos = await prisma.producto.findMany({
            where: { familia },
            select: { id: true }
        });

        if (productos.length === 0) {
            return res.status(404).json({ error: 'Familia no encontrada' });
        }

        const productIds = productos.map(p => p.id);

        const compras = await prisma.compraHistorica.findMany({
            where: { productoId: { in: productIds } },
            select: {
                fecha: true,
                cantidad: true,
                precioUnitario: true
            },
            orderBy: { fecha: 'asc' }
        });

        // Agrupar por mes
        const evolucionMensual = new Map();

        for (const compra of compras) {
            const fecha = new Date(compra.fecha);
            const key = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;

            if (!evolucionMensual.has(key)) {
                evolucionMensual.set(key, {
                    periodo: key,
                    ano: fecha.getFullYear(),
                    mes: fecha.getMonth() + 1,
                    precioPromedio: 0,
                    cantidadTotal: 0,
                    montoTotal: 0,
                    compras: 0
                });
            }

            const ev = evolucionMensual.get(key);
            ev.compras++;
            ev.cantidadTotal += compra.cantidad;
            ev.montoTotal += compra.cantidad * compra.precioUnitario;
        }

        // Calcular promedios
        const evolucion = Array.from(evolucionMensual.values())
            .map(e => ({
                ...e,
                precioPromedio: e.cantidadTotal > 0 ? e.montoTotal / e.cantidadTotal : 0
            }))
            .sort((a, b) => a.periodo.localeCompare(b.periodo))
            .slice(-meses);

        res.json({
            familia,
            productosEnFamilia: productos.length,
            evolucion,
            totalCompras: compras.length
        });

    } catch (error) {
        console.error('Error al obtener evolución de familia:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/compras/costos
 * Obtener costo de última compra de todos los productos
 * Con soporte para paginación y búsqueda
 */
router.get('/costos', async (req, res) => {
    try {
        const {
            page = 1,
            pageSize = 50,
            search,
            familia,
            soloConCosto = 'false'
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(pageSize);
        const take = parseInt(pageSize);

        // Construir where clause
        const where = {};

        if (search) {
            where.OR = [
                { sku: { contains: search } },
                { descripcion: { contains: search } }
            ];
        }

        if (familia) {
            where.familia = familia;
        }

        if (soloConCosto === 'true') {
            where.precioUltimaCompra = { not: null };
        }

        const [productos, total] = await Promise.all([
            prisma.producto.findMany({
                where,
                select: {
                    id: true,
                    sku: true,
                    descripcion: true,
                    familia: true,
                    proveedor: true,
                    precioUltimaCompra: true,
                    fechaUltimaCompra: true
                },
                orderBy: [
                    { precioUltimaCompra: 'desc' },
                    { sku: 'asc' }
                ],
                skip,
                take
            }),
            prisma.producto.count({ where })
        ]);

        res.json({
            productos,
            total,
            page: parseInt(page),
            pageSize: parseInt(pageSize),
            totalPages: Math.ceil(total / parseInt(pageSize))
        });

    } catch (error) {
        console.error('Error al obtener costos:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/compras/stats
 * Estadísticas generales de compras
 */
router.get('/stats', async (req, res) => {
    try {
        const [
            totalCompras,
            productosConCosto,
            totalProductos
        ] = await Promise.all([
            prisma.compraHistorica.count(),
            prisma.producto.count({ where: { precioUltimaCompra: { not: null } } }),
            prisma.producto.count()
        ]);

        // Última compra
        const ultimaCompra = await prisma.compraHistorica.findFirst({
            orderBy: { fecha: 'desc' },
            select: { fecha: true }
        });

        res.json({
            totalCompras,
            productosConCosto,
            totalProductos,
            coberturaCostos: totalProductos > 0 ? Math.round((productosConCosto / totalProductos) * 100) : 0,
            ultimaCompra: ultimaCompra?.fecha || null
        });

    } catch (error) {
        console.error('Error al obtener stats de compras:', error);
        res.status(500).json({ error: error.message });
    }
});


/**
 * GET /api/compras/graficos
 * Datos agregados para gráficos de análisis de compras
 * Query params: fechaInicio, fechaFin, familia, proveedor
 */
router.get('/graficos', async (req, res) => {
    try {
        const { fechaInicio, fechaFin, familia, proveedor } = req.query;

        // --- 1. Definir rango de fechas ---
        // Default: Últimos 12 meses
        let startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 12);
        startDate.setDate(1);
        let endDate = new Date();

        if (fechaInicio) startDate = new Date(fechaInicio);
        if (fechaFin) endDate = new Date(fechaFin + 'T23:59:59.999Z');

        // Where base
        const whereBase = {
            fecha: {
                gte: startDate,
                lte: endDate
            }
        };

        if (familia) whereBase.producto = { familia };
        if (proveedor) whereBase.proveedor = { contains: proveedor };

        // --- 2. Market Share & Ranking (Por Familia) ---
        // Prisma no soporta agrupar por relación directamente de forma fácil en groupByKey
        // Así que obtenemos las compras y agregamos en memoria o usamos raw query.
        // Dado que pueden ser muchas, usaremos groupBy de Prisma en CompraHistorica 
        // pero necesitamos la familia del producto.
        // Workaround eficiente: Traer todas las compras selectivas o usar $queryRaw.
        // Por simplicidad y consistencia, usaremos findMany selectivo y agregación en memoria 
        // (asumiendo volumen manejable para analítica, o optimizar después).

        const comprasPeriodo = await prisma.compraHistorica.findMany({
            where: whereBase,
            select: {
                fecha: true,
                cantidad: true,
                precioUnitario: true,
                producto: {
                    select: { familia: true }
                }
            }
        });

        const familyStats = new Map();
        let totalVentaPeriodo = 0;

        for (const c of comprasPeriodo) {
            const fam = c.producto?.familia || 'Sin Familia';
            const monto = c.cantidad * c.precioUnitario;

            totalVentaPeriodo += monto;

            if (!familyStats.has(fam)) {
                familyStats.set(fam, {
                    familia: fam,
                    totalMonto: 0,
                    totalCantidad: 0
                });
            }
            const stat = familyStats.get(fam);
            stat.totalMonto += monto;
            stat.totalCantidad += c.cantidad;
        }

        // Formato para Market Share Chart
        const marketShare = Array.from(familyStats.values())
            .map(s => ({
                name: s.familia,
                value: s.totalMonto,
                percentage: totalVentaPeriodo > 0 ? (s.totalMonto / totalVentaPeriodo) * 100 : 0
            }))
            .sort((a, b) => b.value - a.value);

        // Formato para Ranking Table
        const ventasPorFamilia = Array.from(familyStats.values())
            .sort((a, b) => b.totalMonto - a.totalMonto);


        // --- 3. Rendimiento Anual (Comparativa Año Actual vs Anterior) ---
        // Recuperar años desde query params o defaults
        // yearRef = Año Actual (Azul fuerte)
        // yearComp = Año Anterior (Gris punteado)
        let yearRef = req.query.yearRef ? parseInt(req.query.yearRef) : endDate.getFullYear();
        let yearComp = req.query.yearComp ? parseInt(req.query.yearComp) : yearRef - 1;

        // Validar que sean números
        if (isNaN(yearRef)) yearRef = endDate.getFullYear();
        if (isNaN(yearComp)) yearComp = yearRef - 1;

        // Raw query es más rápido para series de tiempo grandes, pero usaremos group aggregation manual para consistencia
        // Necesitamos datos de TODO el año referencia y TODO el año comparación

        const whereAnual = {};
        if (familia) whereAnual.producto = { familia };
        if (proveedor) whereAnual.proveedor = { contains: proveedor };

        const comprasAnuales = await prisma.compraHistorica.findMany({
            where: {
                ...whereAnual,
                OR: [
                    {
                        fecha: {
                            gte: new Date(yearRef, 0, 1),
                            lte: new Date(yearRef, 11, 31, 23, 59, 59)
                        }
                    },
                    {
                        fecha: {
                            gte: new Date(yearComp, 0, 1),
                            lte: new Date(yearComp, 11, 31, 23, 59, 59)
                        }
                    }
                ]
            },
            select: {
                fecha: true,
                cantidad: true,
                precioUnitario: true
            }
        });

        const rendimientoMensual = new Map();
        // Inicializar meses
        for (let m = 0; m < 12; m++) {
            rendimientoMensual.set(m, {
                mes: m + 1,
                mensualActual: 0,
                mensualAnterior: 0,
                acumuladoActual: 0,
                acumuladoAnterior: 0
            });
        }

        let totalAnualActual = 0; // Para el KPI de Market Share (esto podría ser redundante si usamos el acumulado final, pero lo mantenemos para consistencia)
        let totalAnualAnterior = 0;

        for (const c of comprasAnuales) {
            const d = new Date(c.fecha);
            const y = d.getFullYear();
            const m = d.getMonth();
            const monto = c.cantidad * c.precioUnitario;

            if (rendimientoMensual.has(m)) {
                const stat = rendimientoMensual.get(m);
                if (y === yearRef) {
                    stat.mensualActual += monto;
                    totalAnualActual += monto;
                } else if (y === yearComp) {
                    stat.mensualAnterior += monto;
                    totalAnualAnterior += monto;
                }
            }
        }

        // Calcular acumulados
        let accActual = 0;
        let accAnterior = 0;
        const rendimientoAnual = [];

        for (let m = 0; m < 12; m++) {
            const stat = rendimientoMensual.get(m);
            accActual += stat.mensualActual;
            accAnterior += stat.mensualAnterior;

            stat.acumuladoActual = accActual;
            stat.acumuladoAnterior = accAnterior;

            rendimientoAnual.push(stat);
        }


        // --- 4. Tendencias (Serie de tiempo por familia para el periodo seleccionado) ---
        // Agrupar por Mes-Año y Familia
        const tendenciasMap = new Map();

        for (const c of comprasPeriodo) {
            const d = new Date(c.fecha);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const fam = c.producto?.familia || 'Sin Familia';
            const monto = c.cantidad * c.precioUnitario;

            if (!tendenciasMap.has(key)) {
                tendenciasMap.set(key, {
                    periodo: key,
                    ano: d.getFullYear(),
                    mes: d.getMonth() + 1,
                    familias: {}
                });
            }
            const t = tendenciasMap.get(key);
            if (!t.familias[fam]) t.familias[fam] = 0;
            t.familias[fam] += monto;
        }

        const tendencias = Array.from(tendenciasMap.values())
            .sort((a, b) => a.periodo.localeCompare(b.periodo));


        // --- Respuesta ---
        res.json({
            meta: {
                totalVentaPeriodo,
                totalVentaAnual: totalAnualActual,
                anoActual: yearRef,
                anoAnterior: yearComp
            },
            marketShare,
            ventasPorFamilia,
            rendimientoAnual,
            tendencias
        });

    } catch (error) {
        console.error('Error al obtener gráficos de compras:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

