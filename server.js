/**
 * Servidor Express para la API de órdenes de compra
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const { logInfo, logSuccess, logError } = require('./utils/logger');
const { necesitaRotacion, ejecutarRotacionCompleta } = require('./services/rotacionService');
const { syncYesterday } = require('./scripts/syncDaily');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Middlewares
app.use(cors({
    origin: ['https://axam.managermas.cl', /localhost:/] // Permitir Manager+ y desarrollo local
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware de logging desactivado para reducir ruido en consola
// Descomentar para debug:
// app.use((req, res, next) => {
//     logInfo(`${req.method} ${req.path}`);
//     next();
// });

// Rutas de API (deben ir antes de los archivos estáticos)
const { authMiddleware } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const usuariosRoutes = require('./routes/usuarios');
const productosRoutes = require('./routes/productos');
const pedidosRoutes = require('./routes/pedidos');
const rotacionRoutes = require('./routes/rotacion');
const dashboardRoutes = require('./routes/dashboard');
const purchaseRoutes = require('./routes/purchase');
const ventasRoutes = require('./routes/ventas');
const targetRoutes = require('./routes/targets');
const syncRoutes = require('./routes/sync');
const vendedoresRoutes = require('./routes/vendedores');
const notificationsRoutes = require('./routes/notifications');
const comprasHistorialRoutes = require('./routes/comprasHistorial');
const margenesRoutes = require('./routes/margenes.routes');
const { ejecutarAlertaStockBajo } = require('./scripts/alertaStockBajo');
const { seedDefaultUser } = require('./scripts/seedDefaultUser');
const { syncYesterday: syncComprasYesterday } = require('./scripts/syncCompras');

// Rutas públicas (sin autenticación)
app.use('/api/auth', authRoutes);

// Proteger todas las rutas /api/* con JWT (excepto /api/auth y /api/sync/pendientes)
app.use('/api', (req, res, next) => {
    // El endpoint de sincronización de pendientes desde el worker debe ser público
    if (req.path === '/sync/pendientes' && req.method === 'POST') {
        return next();
    }
    authMiddleware(req, res, next);
});

// Rutas protegidas
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/rotacion', rotacionRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/purchase', purchaseRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/targets', targetRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/vendedores', vendedoresRoutes);
app.use('/api/compras', comprasHistorialRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/margenes', margenesRoutes);

// Ruta de salud
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

// Servir archivos estáticos según el entorno
if (isProduction) {
    // En producción: servir el build estático de Next.js
    const staticDir = path.join(__dirname, 'client/out');

    app.use(express.static(staticDir, { extensions: ['html'] }));

    // Fallback para rutas de Next.js (static export)
    // Busca el archivo HTML correspondiente a la ruta solicitada
    // Por ejemplo: /ventas/graficos → /ventas/graficos.html
    app.use((req, res) => {
        // Solo servir archivos HTML para peticiones GET o HEAD
        if (req.method === 'GET' || req.method === 'HEAD') {
            const urlPath = req.path === '/' ? '/index' : req.path;

            // Remover trailing slash si existe
            const cleanPath = urlPath.endsWith('/') ? urlPath.slice(0, -1) : urlPath;

            // Intentar encontrar el archivo HTML correspondiente
            const htmlFilePath = path.join(staticDir, `${cleanPath}.html`);
            const indexFilePath = path.join(staticDir, cleanPath, 'index.html');

            if (fs.existsSync(htmlFilePath)) {
                // Archivo .html encontrado (ej: /ventas/graficos.html)
                res.sendFile(htmlFilePath);
            } else if (fs.existsSync(indexFilePath)) {
                // Archivo index.html en subdirectorio (ej: /ventas/graficos/index.html)
                res.sendFile(indexFilePath);
            } else {
                // Fallback a index.html para rutas no encontradas
                res.sendFile(path.join(staticDir, 'index.html'));
            }
        } else {
            res.status(404).json({ error: 'Ruta no encontrada' });
        }
    });

    logInfo('Modo producción: sirviendo frontend estático (Next.js export)');
} else {
    // En desarrollo: servir public viejo (el frontend NextJS corre en otro puerto)
    app.use(express.static('public'));

    // Ruta raíz para desarrollo/legacy
    app.get('/', (req, res) => {
        res.json({
            message: 'API de Órdenes de Compra - AXAM',
            version: '1.0.0',
            frontend: 'http://localhost:3001 (Next.js dev server)',
            endpoints: {
                productos: {
                    ventasHistoricas: 'GET /api/productos/ventas-historicas?meses=12&marca=KC',
                    ventasActuales: 'GET /api/productos/ventas-actuales?marca=KC',
                    completo: 'GET /api/productos/completo?meses=12&marca=KC'
                },
                pedidos: {
                    listar: 'GET /api/pedidos?productoId=1&ano=2026&mes=1&marca=KC',
                    porProducto: 'GET /api/pedidos/:productoId',
                    crearActualizar: 'PUT /api/pedidos/:productoId',
                    crearActualizarActual: 'PUT /api/pedidos/:productoId/actual',
                    eliminar: 'DELETE /api/pedidos/:productoId/:ano/:mes'
                },
                rotacion: {
                    ejecutar: 'POST /api/rotacion/ejecutar',
                    verificar: 'GET /api/rotacion/verificar'
                }
            }
        });
    });
}

// Manejo de errores
app.use((err, req, res, next) => {
    logError(`Error no manejado: ${err.message}`);
    res.status(err.status || 500).json({
        error: 'Error interno del servidor',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Error interno'
    });
});

// Verificar y ejecutar rotación al iniciar (si es necesario)
async function verificarRotacionInicial() {
    try {
        const necesita = await necesitaRotacion();
        if (necesita) {
            logInfo('Se detectó cambio de mes, ejecutando rotación automática...');
            await ejecutarRotacionCompleta();
            logSuccess('Rotación automática completada');
        }
    } catch (error) {
        logError(`Error en rotación inicial: ${error.message}`);
        // No detener el servidor si falla la rotación inicial
    }
}

// Iniciar servidor
async function startServer() {
    const { getPrismaClient } = require('./prisma/client');
    const prisma = getPrismaClient();

    try {
        // Seed usuario por defecto
        await seedDefaultUser();

        // Verificar rotación antes de iniciar
        await verificarRotacionInicial();

        // Verificar si hay datos en VentaActual (si está vacía, sincronizar)
        const ventaActualCount = await prisma.ventaActual.count();
        if (ventaActualCount === 0) {
            logInfo('📊 VentaActual vacía. Ejecutando sincronización inicial...');
            try {
                await syncYesterday();
                logSuccess('✅ Sincronización inicial completada');
            } catch (error) {
                logError(`❌ Error en sincronización inicial: ${error.message}`);
                // Continuamos sin datos - el usuario puede usar el botón manual
            }
        } else {
            logInfo(`📊 VentaActual contiene ${ventaActualCount} registros`);
        }

        // Programar sincronización diaria a las 01:00 AM
        cron.schedule('0 1 * * *', async () => {
            logInfo('⏰ Ejecutando sincronización diaria programada (01:00 AM)...');
            try {
                // Sincronizar ventas del día anterior
                await syncYesterday();
                logSuccess('✅ Sincronización de ventas completada');

                // Sincronizar compras del día anterior
                await syncComprasYesterday();
                logSuccess('✅ Sincronización de compras completada');
            } catch (error) {
                logError(`❌ Error en sincronización diaria programada: ${error.message}`);
            }
        }, { timezone: 'America/Santiago' });

        // Programar alerta de stock bajo a las 17:00 (5 PM) hora Chile
        cron.schedule('0 17 * * *', async () => {
            logInfo('⏰ Ejecutando alerta de stock bajo programada (17:00 Chile)...');
            try {
                await ejecutarAlertaStockBajo();
                logSuccess('✅ Alerta de stock bajo completada');
            } catch (error) {
                logError(`❌ Error en alerta de stock bajo: ${error.message}`);
            }
        }, { timezone: 'America/Santiago' });

        logInfo('🕒 Tareas CRON programadas:');
        logInfo('   - Sincronización diaria (ventas + compras): 01:00 AM (Chile)');
        logInfo('   - Alerta stock bajo: 17:00 PM (Chile)');

        const server = app.listen(PORT, () => {
            logSuccess(`🚀 Servidor iniciado en http://localhost:${PORT}`);
            if (isProduction) {
                logInfo(`🌐 Frontend: http://localhost:${PORT}`);
            } else {
                logInfo(`🌐 API: http://localhost:${PORT} | Frontend Dev: cd client && npm run dev`);
            }
        });

        // Aumentar timeout del servidor a 5 minutos (300000ms) para soportar sincronizaciones largas
        server.setTimeout(300000);

    } catch (error) {
        logError(`Error al iniciar servidor: ${error.message}`);
        process.exit(1);
    }
}

// Manejar cierre graceful
process.on('SIGTERM', async () => {
    logInfo('SIGTERM recibido, cerrando servidor...');
    process.exit(0);
});

process.on('SIGINT', async () => {
    logInfo('SIGINT recibido, cerrando servidor...');
    process.exit(0);
});

// Iniciar
if (require.main === module) {
    startServer();
}

module.exports = app;
