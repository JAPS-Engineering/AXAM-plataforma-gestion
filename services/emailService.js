/**
 * Servicio de Email para notificaciones
 * 
 * Usa nodemailer con Gmail SMTP para enviar alertas de stock bajo
 */

require('dotenv').config();
const nodemailer = require('nodemailer');
const { logInfo, logSuccess, logError, logWarning } = require('../utils/logger');

// Configuración del transporter
let transporter = null;

/**
 * Inicializar el transporter de nodemailer
 * @returns {Object|null} Transporter configurado o null si falta configuración
 */
function getTransporter() {
    if (transporter) return transporter;

    const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASSWORD } = process.env;

    if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASSWORD) {
        logWarning('⚠️ Configuración de email incompleta. Variables requeridas: EMAIL_HOST, EMAIL_USER, EMAIL_PASSWORD');
        return null;
    }

    transporter = nodemailer.createTransport({
        host: EMAIL_HOST,
        port: parseInt(EMAIL_PORT) || 587,
        secure: false, // true para 465, false para otros puertos
        auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASSWORD
        }
    });

    return transporter;
}

/**
 * Verificar conexión con el servidor de email
 * @returns {Promise<boolean>}
 */
async function verifyConnection() {
    const transport = getTransporter();
    if (!transport) return false;

    try {
        await transport.verify();
        logSuccess('✅ Conexión con servidor de email verificada');
        return true;
    } catch (error) {
        logError(`❌ Error al verificar conexión de email: ${error.message}`);
        return false;
    }
}

/**
 * Generar HTML del email de alerta de stock bajo
 * @param {Array} products - Lista de productos bajo stock
 * @returns {string} HTML del email
 */
function generateLowStockEmailHTML(products) {
    const fecha = new Date().toLocaleDateString('es-CL', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const productRows = products.map(p => `
        <tr>
            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-weight: 600; color: #334155;">
                ${p.sku}
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #475569;">
                ${p.descripcion}
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #dc2626; font-weight: 600;">
                ${Math.round(p.stockActual).toLocaleString('es-CL')}
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #059669; font-weight: 600;">
                ${Math.round(p.stockMinimo).toLocaleString('es-CL')}
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #dc2626; font-weight: 600;">
                ${Math.round(p.stockMinimo - p.stockActual).toLocaleString('es-CL')}
            </td>
        </tr>
    `).join('');

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    <div style="max-width: 800px; margin: 0 auto; padding: 20px;">
        <!-- Header -->
        <div style="background-color: #dc2626; border-radius: 12px 12px 0 0; padding: 24px; text-align: center;">
            <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                ⚠️ Alerta de Stock Bajo
            </h1>
            <p style="margin: 8px 0 0 0; color: #fecaca; font-size: 14px;">
                ${fecha}
            </p>
        </div>

        <!-- Content -->
        <div style="background: white; padding: 24px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
            <p style="margin: 0 0 20px 0; color: #475569; font-size: 15px; line-height: 1.6;">
                Se han detectado <strong style="color: #dc2626;">${products.length} producto${products.length !== 1 ? 's' : ''}</strong> 
                con stock por debajo del mínimo configurado. Se recomienda tomar acción para evitar quiebres de stock.
            </p>

            <!-- Table -->
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                    <thead>
                        <tr style="background-color: #f8fafc;">
                            <th style="padding: 12px; text-align: left; font-weight: 600; color: #64748b; border-bottom: 2px solid #e2e8f0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">
                                SKU
                            </th>
                            <th style="padding: 12px; text-align: left; font-weight: 600; color: #64748b; border-bottom: 2px solid #e2e8f0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">
                                Descripción
                            </th>
                            <th style="padding: 12px; text-align: center; font-weight: 600; color: #64748b; border-bottom: 2px solid #e2e8f0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">
                                Stock Actual
                            </th>
                            <th style="padding: 12px; text-align: center; font-weight: 600; color: #64748b; border-bottom: 2px solid #e2e8f0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">
                                Stock Mínimo
                            </th>
                            <th style="padding: 12px; text-align: center; font-weight: 600; color: #64748b; border-bottom: 2px solid #e2e8f0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">
                                Faltante
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        ${productRows}
                    </tbody>
                </table>
            </div>

            <!-- Footer -->
            <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0; color: #94a3b8; font-size: 13px; text-align: center;">
                    Este es un correo automático generado por el sistema AXAM Dashboard.<br>
                    Para configurar las notificaciones, visita la sección de Stock Mínimo.
                </p>
            </div>
        </div>
    </div>
</body>
</html>
    `;
}

/**
 * Enviar email de alerta de stock bajo
 * @param {Array<string>} recipients - Lista de emails destinatarios
 * @param {Array} products - Lista de productos bajo stock
 * @returns {Promise<Object>} Resultado del envío
 */
async function sendLowStockAlert(recipients, products) {
    if (!recipients || recipients.length === 0) {
        logWarning('⚠️ No hay destinatarios configurados para la alerta de stock bajo');
        return { success: false, error: 'No hay destinatarios configurados' };
    }

    if (!products || products.length === 0) {
        logInfo('✅ No hay productos bajo stock mínimo');
        return { success: true, message: 'No hay productos bajo stock mínimo' };
    }

    const transport = getTransporter();
    if (!transport) {
        return { success: false, error: 'Configuración de email incompleta' };
    }

    const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    const subject = `⚠️ Alerta: ${products.length} producto${products.length !== 1 ? 's' : ''} bajo stock mínimo`;

    try {
        const info = await transport.sendMail({
            from: fromEmail,
            to: recipients.join(', '),
            subject: subject,
            html: generateLowStockEmailHTML(products)
        });

        logSuccess(`✅ Email de alerta enviado a ${recipients.length} destinatario(s): ${info.messageId}`);
        return { success: true, messageId: info.messageId, recipients: recipients.length };

    } catch (error) {
        logError(`❌ Error al enviar email de alerta: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Enviar email de prueba
 * @param {string} recipient - Email destinatario
 * @returns {Promise<Object>} Resultado del envío
 */
async function sendTestEmail(recipient) {
    const transport = getTransporter();
    if (!transport) {
        return { success: false, error: 'Configuración de email incompleta. Revisa las variables EMAIL_HOST, EMAIL_USER, EMAIL_PASSWORD.' };
    }

    const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;

    // Generar productos de ejemplo para el test
    const testProducts = [
        { sku: 'TEST-001', descripcion: 'Producto de Prueba 1', stockActual: 5, stockMinimo: 20 },
        { sku: 'TEST-002', descripcion: 'Producto de Prueba 2', stockActual: 10, stockMinimo: 50 },
    ];

    try {
        const info = await transport.sendMail({
            from: fromEmail,
            to: recipient,
            subject: '🧪 [PRUEBA] Alerta de Stock Bajo - AXAM Dashboard',
            html: generateLowStockEmailHTML(testProducts)
        });

        logSuccess(`✅ Email de prueba enviado a ${recipient}: ${info.messageId}`);
        return { success: true, messageId: info.messageId };

    } catch (error) {
        logError(`❌ Error al enviar email de prueba: ${error.message}`);
        return { success: false, error: error.message };
    }
}

module.exports = {
    getTransporter,
    verifyConnection,
    sendLowStockAlert,
    sendTestEmail,
    generateLowStockEmailHTML
};
