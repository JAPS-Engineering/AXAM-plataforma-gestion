/**
 * Script de Alerta de Stock Bajo
 * 
 * Se ejecuta a las 5 PM (hora Chile) para:
 * 1. Sincronizar datos del mes actual
 * 2. Detectar productos bajo stock mínimo
 * 3. Enviar notificaciones por email
 * 
 * Uso: node scripts/alertaStockBajo.js
 */

require('dotenv').config();
const { getPrismaClient } = require('../prisma/client');
const { logSection, logSuccess, logError, logWarning, logInfo } = require('../utils/logger');
const { syncCurrentMonthData } = require('./syncDaily');
const { sendLowStockAlert } = require('../services/emailService');

const prisma = getPrismaClient();

/**
 * Obtener productos con stock bajo el mínimo configurado
 * @returns {Promise<Array>} Lista de productos bajo stock
 */
async function getProductosBajoStock() {
    // Obtener productos con stockMinimo configurado
    const productos = await prisma.producto.findMany({
        where: {
            stockMinimo: {
                not: null
            }
        },
        select: {
            id: true,
            sku: true,
            descripcion: true,
            stockMinimo: true
        }
    });

    if (productos.length === 0) {
        logInfo('No hay productos con stock mínimo configurado');
        return [];
    }

    logInfo(`Verificando ${productos.length} productos con stock mínimo configurado...`);

    // Obtener stock actual de VentaActual (agrupado por producto)
    const stockActual = await prisma.ventaActual.groupBy({
        by: ['productoId'],
        _max: {
            stockActual: true
        }
    });

    const stockMap = new Map(stockActual.map(s => [s.productoId, s._max?.stockActual || 0]));

    // Filtrar productos bajo stock
    const productosBajoStock = productos.filter(p => {
        const stock = stockMap.get(p.id) || 0;
        return stock < (p.stockMinimo || 0);
    }).map(p => ({
        ...p,
        stockActual: stockMap.get(p.id) || 0
    }));

    return productosBajoStock;
}

/**
 * Obtener lista de emails destinatarios activos
 * @returns {Promise<Array<string>>}
 */
async function getEmailDestinatarios() {
    const emails = await prisma.emailNotificacion.findMany({
        where: {
            activo: true,
            tipo: 'STOCK_BAJO'
        },
        select: {
            email: true
        }
    });

    return emails.map(e => e.email);
}

/**
 * Ejecutar alerta de stock bajo
 */
async function ejecutarAlertaStockBajo() {
    logSection('ALERTA DE STOCK BAJO');

    try {
        // 1. Sincronizar datos del mes actual (con datos de hoy)
        logInfo('Sincronizando datos actuales...');
        await syncCurrentMonthData(true); // includeToday = true

        // 2. Obtener productos bajo stock
        const productosBajoStock = await getProductosBajoStock();

        if (productosBajoStock.length === 0) {
            logSuccess('✅ No hay productos bajo stock mínimo');
            return { success: true, productosEnAlerta: 0 };
        }

        logWarning(`⚠️ ${productosBajoStock.length} producto(s) bajo stock mínimo`);

        // Mostrar resumen
        productosBajoStock.slice(0, 5).forEach(p => {
            logInfo(`  - ${p.sku}: ${Math.round(p.stockActual)} / ${Math.round(p.stockMinimo)} (mínimo)`);
        });
        if (productosBajoStock.length > 5) {
            logInfo(`  ... y ${productosBajoStock.length - 5} más`);
        }

        // 3. Obtener destinatarios
        const destinatarios = await getEmailDestinatarios();

        if (destinatarios.length === 0) {
            logWarning('⚠️ No hay destinatarios configurados para las alertas de email');
            return { success: true, productosEnAlerta: productosBajoStock.length, emailEnviado: false };
        }

        logInfo(`Enviando alerta a ${destinatarios.length} destinatario(s)...`);

        // 4. Enviar email
        const resultado = await sendLowStockAlert(destinatarios, productosBajoStock);

        if (resultado.success) {
            logSuccess(`✅ Alerta enviada exitosamente`);
        } else {
            logError(`❌ Error al enviar alerta: ${resultado.error}`);
        }

        return {
            success: true,
            productosEnAlerta: productosBajoStock.length,
            emailEnviado: resultado.success,
            destinatarios: destinatarios.length
        };

    } catch (error) {
        logError(`Error en alerta de stock bajo: ${error.message}`);
        throw error;
    }
}

// CLI
if (require.main === module) {
    ejecutarAlertaStockBajo()
        .then(result => {
            logSection('RESULTADO');
            logInfo(`Productos en alerta: ${result.productosEnAlerta}`);
            if (result.emailEnviado !== undefined) {
                logInfo(`Email enviado: ${result.emailEnviado ? 'Sí' : 'No'}`);
            }
            process.exit(0);
        })
        .catch(error => {
            logError(`Error fatal: ${error.message}`);
            process.exit(1);
        })
        .finally(() => {
            prisma.$disconnect();
        });
}

module.exports = {
    ejecutarAlertaStockBajo,
    getProductosBajoStock,
    getEmailDestinatarios
};
