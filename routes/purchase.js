/**
 * Rutas para endpoints de compras sugeridas
 */

const express = require('express');
const router = express.Router();
const { getPrismaClient } = require('../prisma/client');
const {
    ALGORITMOS,
    calculateSuggestedPurchase,
    checkStockBreach,
    getProductosEnQuiebre,
    generateSuggestedPurchases
} = require('../services/purchaseLogic');
const {
    generateKCExcel,
    generateTorkTxt,
    generateGenericCSV,
    generateMultiProviderExcel
} = require('../services/exporterService');
const {
    createPurchaseOrder,
    createImportOrder,
    getIntegrationStatus
} = require('../services/managerIntegration');
const { logError } = require('../utils/logger');

const prisma = getPrismaClient();

/**
 * GET /api/purchase/suggested
 * Obtiene compras sugeridas con filtros
 * Query params: proveedor, tipoFiltro, algoritmo, meses, mesesCobertura, soloEnQuiebre
 */
router.get('/suggested', async (req, res) => {
    try {
        const {
            proveedor,
            tipoFiltro = 'proveedor',
            algoritmo = ALGORITMOS.LINEAL,
            meses = 6,
            mesesCobertura = 2,
            soloEnQuiebre = false
        } = req.query;

        if (!proveedor) {
            return res.status(400).json({ error: 'Se requiere el parámetro proveedor' });
        }

        const sugerencias = await generateSuggestedPurchases(proveedor, {
            algoritmo,
            meses: parseInt(meses, 10),
            mesesCobertura: parseInt(mesesCobertura, 10),
            soloEnQuiebre: soloEnQuiebre === 'true',
            tipoFiltro
        });

        res.json({
            proveedor,
            tipoFiltro,
            algoritmo,
            meses: parseInt(meses, 10),
            mesesCobertura: parseInt(mesesCobertura, 10),
            totalItems: sugerencias.length,
            totalUnidades: sugerencias.reduce((sum, s) => sum + s.cantidadSugerida, 0),
            items: sugerencias
        });

    } catch (error) {
        logError(`Error en GET /api/purchase/suggested: ${error.message}`);
        res.status(500).json({ error: 'Error al calcular compras sugeridas', message: error.message });
    }
});

/**
 * GET /api/purchase/quiebre
 * Obtiene productos en quiebre de stock
 */
router.get('/quiebre', async (req, res) => {
    try {
        const { proveedor, origen } = req.query;

        const productosEnQuiebre = await getProductosEnQuiebre({ proveedor, origen });

        res.json({
            totalEnQuiebre: productosEnQuiebre.length,
            productos: productosEnQuiebre
        });

    } catch (error) {
        logError(`Error en GET /api/purchase/quiebre: ${error.message}`);
        res.status(500).json({ error: 'Error al obtener productos en quiebre', message: error.message });
    }
});

/**
 * GET /api/purchase/proveedores
 * Lista todos los proveedores únicos (o familias si no hay proveedores)
 */
router.get('/proveedores', async (req, res) => {
    try {
        let proveedoresFiltrados = [];

        // Intentar obtener proveedores (puede fallar si el campo no existe aún)
        try {
            const proveedores = await prisma.producto.groupBy({
                by: ['proveedor'],
                _count: { id: true },
                orderBy: { proveedor: 'asc' }
            });

            // Filtrar proveedores vacíos o null
            proveedoresFiltrados = proveedores.filter(p => p.proveedor && p.proveedor.trim() !== '');
        } catch (e) {
            // Si falla (campo no existe), continuar con familias
            logError(`Campo proveedor no disponible, usando familias: ${e.message}`);
        }

        // Si hay proveedores válidos, devolverlos
        if (proveedoresFiltrados.length > 0) {
            return res.json({
                total: proveedoresFiltrados.length,
                tipo: 'proveedor',
                proveedores: proveedoresFiltrados.map(p => ({
                    nombre: p.proveedor,
                    productosCount: p._count.id
                }))
            });
        }

        // Si no hay proveedores, usar familias
        const familias = await prisma.producto.groupBy({
            by: ['familia'],
            _count: { id: true },
            orderBy: { familia: 'asc' }
        });

        const familiasFiltradas = familias.filter(f => f.familia && f.familia.trim() !== '');

        res.json({
            total: familiasFiltradas.length,
            tipo: 'familia',
            proveedores: familiasFiltradas.map(f => ({
                nombre: f.familia,
                productosCount: f._count.id
            }))
        });

    } catch (error) {
        logError(`Error en GET /api/purchase/proveedores: ${error.message}`);
        res.status(500).json({ error: 'Error al obtener proveedores', message: error.message });
    }
});

/**
 * POST /api/purchase/generate
 * Crea una orden de compra en la BD local
 */
router.post('/generate', async (req, res) => {
    try {
        const { proveedor, tipo = 'NACIONAL', items, observaciones = '' } = req.body;

        if (!proveedor || !items || items.length === 0) {
            return res.status(400).json({ error: 'Se requiere proveedor e items' });
        }

        // Generar código único
        const fecha = new Date();
        const codigo = `${tipo === 'NACIONAL' ? 'OC' : 'OCI'}-${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, '0')}${String(fecha.getDate()).padStart(2, '0')}-${Date.now().toString(36).toUpperCase()}`;

        // Calcular monto total
        const montoTotal = items.reduce((sum, item) => sum + (item.precioUnit || 0) * item.cantidad, 0);

        // Crear orden en BD
        const orden = await prisma.ordenCompra.create({
            data: {
                codigo,
                proveedor,
                tipo,
                estado: 'PENDIENTE',
                montoTotal,
                moneda: tipo === 'NACIONAL' ? 'CLP' : 'USD',
                observaciones,
                items: {
                    create: items.map(item => ({
                        productoId: item.productoId,
                        cantidad: item.cantidad,
                        precioUnit: item.precioUnit || 0,
                        subtotal: (item.precioUnit || 0) * item.cantidad,
                        observaciones: item.observaciones
                    }))
                }
            },
            include: {
                items: {
                    include: {
                        producto: {
                            select: { sku: true, descripcion: true }
                        }
                    }
                }
            }
        });

        res.json({
            success: true,
            orden
        });

    } catch (error) {
        logError(`Error en POST /api/purchase/generate: ${error.message}`);
        res.status(500).json({ error: 'Error al generar orden', message: error.message });
    }
});

/**
 * POST /api/purchase/export/:format
 * Exporta orden a archivo (kc-excel, tork-txt, csv)
 */
router.post('/export/:format', async (req, res) => {
    try {
        const { format } = req.params;
        const { items } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ error: 'Se requieren items para exportar' });
        }

        let buffer, filename, contentType;

        switch (format.toLowerCase()) {
            case 'kc-excel':
                buffer = await generateKCExcel(items);
                filename = `OC_KimberlyClark_${new Date().toISOString().split('T')[0]}.xlsx`;
                contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                break;

            case 'tork-txt':
                buffer = generateTorkTxt(items);
                filename = `OC_Tork_${new Date().toISOString().split('T')[0]}.txt`;
                contentType = 'text/plain';
                break;

            case 'csv':
                buffer = generateGenericCSV(items);
                filename = `OC_${new Date().toISOString().split('T')[0]}.csv`;
                contentType = 'text/csv';
                break;

            default:
                return res.status(400).json({ error: `Formato no soportado: ${format}` });
        }

        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', contentType);
        res.send(buffer);

    } catch (error) {
        logError(`Error en POST /api/purchase/export: ${error.message}`);
        res.status(500).json({ error: 'Error al exportar', message: error.message });
    }
});

/**
 * GET /api/purchase/integration-status
 * Verifica el estado de la integración con Manager+
 */
router.get('/integration-status', (req, res) => {
    res.json(getIntegrationStatus());
});

/**
 * POST /api/purchase/send-to-erp
 * Envía orden a Manager+ (DESACTIVADO)
 */
router.post('/send-to-erp', async (req, res) => {
    try {
        const { ordenId, tipo = 'NACIONAL' } = req.body;

        // Obtener orden de la BD
        const orden = await prisma.ordenCompra.findUnique({
            where: { id: ordenId },
            include: {
                items: {
                    include: {
                        producto: true
                    }
                }
            }
        });

        if (!orden) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        // Preparar datos
        const data = {
            proveedor: orden.proveedor,
            items: orden.items.map(i => ({
                sku: i.producto.sku,
                descripcion: i.producto.descripcion,
                cantidad: i.cantidad,
                precioUnit: i.precioUnit
            })),
            observaciones: orden.observaciones
        };

        // Llamar al servicio (mock por ahora)
        const result = tipo === 'NACIONAL'
            ? await createPurchaseOrder(data)
            : await createImportOrder(data);

        res.json(result);

    } catch (error) {
        logError(`Error en POST /api/purchase/send-to-erp: ${error.message}`);
        res.status(500).json({ error: 'Error al enviar a ERP', message: error.message });
    }
});

/**
 * GET /api/purchase/ordenes
 * Lista órdenes de compra
 */
router.get('/ordenes', async (req, res) => {
    try {
        const { estado, tipo, proveedor, page = 1, pageSize = 20 } = req.query;

        const where = {};
        if (estado) where.estado = estado;
        if (tipo) where.tipo = tipo;
        if (proveedor) where.proveedor = { contains: proveedor };

        const [ordenes, total] = await Promise.all([
            prisma.ordenCompra.findMany({
                where,
                include: {
                    items: {
                        select: { id: true, cantidad: true }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip: (parseInt(page, 10) - 1) * parseInt(pageSize, 10),
                take: parseInt(pageSize, 10)
            }),
            prisma.ordenCompra.count({ where })
        ]);

        res.json({
            ordenes: ordenes.map(o => ({
                ...o,
                itemsCount: o.items.length,
                totalUnidades: o.items.reduce((sum, i) => sum + i.cantidad, 0)
            })),
            total,
            page: parseInt(page, 10),
            totalPages: Math.ceil(total / parseInt(pageSize, 10))
        });

    } catch (error) {
        logError(`Error en GET /api/purchase/ordenes: ${error.message}`);
        res.status(500).json({ error: 'Error al listar órdenes', message: error.message });
    }
});

module.exports = router;
