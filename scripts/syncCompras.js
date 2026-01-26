/**
 * Script para sincronizar COMPRAS (FACE) e Histórico de Precios
 * 
 * Lógica:
 * 1. Obtiene Facturas de Compra (FACE) desde el ERP.
 * 2. Guarda el registro en CompraHistorica (para análisis de evolución de precios).
 * 3. Actualiza el costo actual en la ficha del Producto (precioUltimaCompra).
 */

require('dotenv').config();
const { format, startOfMonth, endOfMonth, getYear, getMonth, isAfter, subMonths, parseISO, isValid } = require('date-fns');
const { getPrismaClient } = require('../prisma/client');
const { logSection, logSuccess, logError, logWarning, logInfo } = require('../utils/logger');
// Reutilizamos el servicio genérico que ya soporta FACE
const { getAllDocuments, getDocumentDetails } = require('../services/faveService');
const { extractProductosFromFAVE } = require('../services/productExtractor'); // Sirve también para FACE

const prisma = getPrismaClient();

// Fecha inicio defecto (1 año atrás o lo que el usuario pida)
const FECHA_INICIO_DEFECTO = subMonths(new Date(), 12);

/**
 * Procesa un lote de Facturas de Compra
 */
async function processFACEs(faces) {
    let procesadas = 0;
    let productosActualizados = 0;
    let comprasGuardadas = 0;
    let errores = 0;

    // Mapa para trackear el precio más reciente por producto en este lote
    // SKU -> { precio, fecha, proveedor }
    const ultimosPrecios = new Map();

    for (const doc of faces) {
        try {
            // Obtener detalles si no vienen
            let fullDoc = doc;
            if (!doc.detalles) {
                fullDoc = await getDocumentDetails('FACE', doc);
            }

            if (!fullDoc) {
                errores++;
                continue;
            }

            const fechaDocStr = fullDoc.fecha_doc || fullDoc.fecha;
            const fechaDoc = parseISO(fechaDocStr);
            if (!isValid(fechaDoc)) {
                logWarning(`  ⚠️ Fecha inválida en FACE ${fullDoc.folio}: ${fechaDocStr}`);
                continue;
            }

            const proveedor = fullDoc.razon_social || fullDoc.nombre_cliente || 'Proveedor Desconocido';
            const rutProveedor = fullDoc.rut_proveedor || fullDoc.rut_cliente || '';

            // Extraer items
            // Usamos extractProductosFromFAVE porque la estructura de detalles es igual
            const items = extractProductosFromFAVE(fullDoc);

            if (items.length > 0) {
                for (const item of items) {
                    // 1. Buscar ID de producto (si existe en nuestra BD)
                    const producto = await prisma.producto.findUnique({
                        where: { sku: item.sku }
                    });

                    if (producto) { // Solo procesamos si el producto existe en nuestra BD (Whitelist)

                        // 2. Guardar en Histórico
                        // Verificamos si ya existe para evitar duplicados exactos (opcional, pero buena práctica)
                        const exists = await prisma.compraHistorica.findFirst({
                            where: {
                                productoId: producto.id,
                                fecha: fechaDoc,
                                folio: String(fullDoc.folio)
                            }
                        });

                        if (!exists) {
                            await prisma.compraHistorica.create({
                                data: {
                                    productoId: producto.id,
                                    fecha: fechaDoc,
                                    cantidad: item.cantidad,
                                    precioUnitario: item.montoNeto / item.cantidad, // Calcular unitario real
                                    proveedor: proveedor,
                                    rutProveedor: rutProveedor,
                                    folio: String(fullDoc.folio)
                                }
                            });
                            comprasGuardadas++;
                        }

                        // 3. Trackear para actualizar "Último Precio"
                        // Si este documento es más reciente que lo que tenemos en memoria para este lote...
                        const currentBest = ultimosPrecios.get(item.sku);
                        if (!currentBest || isAfter(fechaDoc, currentBest.fecha)) {
                            ultimosPrecios.set(item.sku, {
                                precio: item.montoNeto / item.cantidad,
                                fecha: fechaDoc,
                                id: producto.id
                            });
                        }
                    }
                }
            }
            procesadas++;
            if (procesadas % 20 === 0) process.stdout.write('.');

        } catch (error) {
            errores++;
            // logError(`Error processing FACE ${doc.folio}: ${error.message}`);
        }
    }
    console.log(''); // Newline

    // 4. Actualizar Precios en Producto (Batch Update logic)
    // Solo actualizamos si la fecha encontrada es MAYOR a la que ya tiene el producto
    logInfo(`  Actualizando fichas de productos con últimos costos...`);

    for (const [sku, data] of ultimosPrecios) {
        const producto = await prisma.producto.findUnique({
            where: { id: data.id },
            select: { fechaUltimaCompra: true }
        });

        if (!producto.fechaUltimaCompra || isAfter(data.fecha, producto.fechaUltimaCompra)) {
            await prisma.producto.update({
                where: { id: data.id },
                data: {
                    precioUltimaCompra: data.precio,
                    fechaUltimaCompra: data.fecha,
                    proveedor: data.proveedor // Opcional: actualizar proveedor por defecto
                }
            });
            productosActualizados++;
        }
    }

    return { procesadas, comprasGuardadas, productosActualizados, errores };
}


async function main() {
    logSection('SINCRONIZACIÓN DE COMPRAS (FACE) E HISTÓRICO DE PRECIOS');

    try {
        const fechaHoy = new Date();
        const fechaInicio = FECHA_INICIO_DEFECTO; // O param

        logInfo(`Obteniendo compras desde ${format(fechaInicio, 'dd/MM/yyyy')}...`);

        // Obtener FACEs
        // Dividimos por año/mes si es mucho, pero getAllDocuments maneja paginación anual.
        // ComoFACEs suelen ser menos que FAVEs, probamos traer todo el rango (si es < 1 año) o por lotes.
        // User faveService getAllDocuments.

        const faces = await getAllDocuments('FACE', fechaInicio, fechaHoy);

        logSuccess(`Total FACEs encontradas: ${faces.length}`);

        if (faces.length > 0) {
            logInfo('Procesando compras...');
            const stats = await processFACEs(faces);

            logSuccess('RESUMEN:');
            logSuccess(`  Facturas Procesadas: ${stats.procesadas}`);
            logSuccess(`  Registros Históricos Guardados: ${stats.comprasGuardadas}`);
            logSuccess(`  Productos con Costo Actualizado: ${stats.productosActualizados}`);
            if (stats.errores > 0) logWarning(`  Errores: ${stats.errores}`);
        } else {
            logWarning('No se encontraron compras en el periodo.');
        }

    } catch (error) {
        logError(`Error global: ${error.message}`);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { main };
