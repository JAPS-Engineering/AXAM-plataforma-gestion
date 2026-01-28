/**
 * Servidor Express para la API de órdenes de compra
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
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
const productosRoutes = require('./routes/productos');
const pedidosRoutes = require('./routes/pedidos');
const rotacionRoutes = require('./routes/rotacion');
const dashboardRoutes = require('./routes/dashboard');
const purchaseRoutes = require('./routes/purchase');
const ventasRoutes = require('./routes/ventas');
const targetRoutes = require('./routes/targets');
const syncRoutes = require('./routes/sync');

app.use('/api/productos', productosRoutes);
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/rotacion', rotacionRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/purchase', purchaseRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/targets', targetRoutes);
app.use('/api/sync', syncRoutes);

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

    app.use(express.static(staticDir));

    // Fallback para SPA (Single Page Application)
    // Cualquier ruta no manejada por API devuelve index.html
    // Usamos app.use como fallback universal (funciona en Express 4 y 5)
    app.use((req, res) => {
        // Solo servir index.html para peticiones GET, para otras devolver 404
        if (req.method === 'GET') {
            res.sendFile(path.join(staticDir, 'index.html'));
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
                await syncYesterday();
                logSuccess('✅ Sincronización diaria programada completada');
            } catch (error) {
                logError(`❌ Error en sincronización diaria programada: ${error.message}`);
            }
        });

        logInfo('🕒 Tarea CRON programada: Sincronización diaria a las 01:00 AM');

        const server = app.listen(PORT, () => {
            logSuccess(`🚀 Servidor iniciado en http://localhost:${PORT}`);
            logInfo(`📊 API de Órdenes de Compra - AXAM`);
            if (isProduction) {
                logInfo(`🌐 Frontend Next.js sirviendo en http://localhost:${PORT}`);
            } else {
                logInfo(`   API disponible en http://localhost:${PORT}/`);
                logInfo(`   Frontend dev server: cd client && npm run dev`);
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
