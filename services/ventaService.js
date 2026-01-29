/**
 * Servicio para guardar ventas en la base de datos
 */

const { logWarning } = require('../utils/logger');

/**
 * Obtener o crear ID de producto por SKU
 */
function getProductIdBySku(db, sku) {
    const stmt = db.prepare('SELECT id FROM productos WHERE sku = ?');
    const result = stmt.get(sku);
    return result ? result.id : null;
}

/**
 * Guardar o actualizar venta mensual
 */
function saveVentaMensual(db, productoId, ano, mes, cantidad, montoNeto, vendedor = '') {
    try {
        // Intentar actualizar primero
        const update = db.prepare(`
            UPDATE ventas_mensuales 
            SET cantidad_vendida = cantidad_vendida + ?,
                monto_neto = monto_neto + ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE producto_id = ? AND ano = ? AND mes = ? AND vendedor = ?
        `);

        const result = update.run(cantidad, montoNeto, productoId, ano, mes, vendedor || '');

        // Si no se actualizó nada, insertar
        if (result.changes === 0) {
            const insert = db.prepare(`
                INSERT INTO ventas_mensuales (producto_id, ano, mes, vendedor, cantidad_vendida, monto_neto, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `);
            insert.run(productoId, ano, mes, vendedor || '', cantidad, montoNeto);
        }
    } catch (error) {
        throw new Error(`Error al guardar venta: ${error.message}`);
    }
}

/**
 * Guardar ventas de múltiples productos para un mes
 */
function saveVentasMensuales(db, ventasPorProducto, ano, mes) {
    let guardadas = 0;
    let noEncontrados = 0;

    for (const [key, venta] of Object.entries(ventasPorProducto)) {
        // La clave ahora es "sku|vendedor"
        const [sku, vendedor] = key.split('|');
        const productoId = getProductIdBySku(db, sku);

        if (!productoId) {
            noEncontrados++;
            continue;
        }

        saveVentaMensual(
            db,
            productoId,
            ano,
            mes,
            venta.cantidad,
            venta.montoNeto,
            vendedor
        );
        guardadas++;
    }

    if (noEncontrados > 0) {
        logWarning(`  ${noEncontrados} productos no encontrados en la BD (ejecuta sync:productos primero)`);
    }

    return { guardadas, noEncontrados };
}

module.exports = {
    getProductIdBySku,
    saveVentaMensual,
    saveVentasMensuales
};
