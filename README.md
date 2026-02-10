# AXAM Dashboard — Sistema de Gestión de Ventas y Compras

Dashboard integral para la gestión de ventas, compras, stock y análisis de productos. Se conecta a **Manager+** (ERP) para sincronizar datos automáticamente y los almacena en una base de datos SQLite local.

## Stack Tecnológico

| Componente | Tecnología |
|---|---|
| Backend / API | Node.js + Express |
| Frontend | Next.js (React/TypeScript) |
| Base de datos | SQLite (via Prisma ORM) |
| Contenedor | Docker + Docker Compose |
| CRON | `node-cron` (dentro del servidor) |
| ERP | Manager+ API REST |

---

## Inicio Rápido

### Requisitos previos

- Docker y Docker Compose
- Archivo `.env` configurado (ver sección Configuración)

### Setup desde cero

```bash
# 1. Copiar y configurar variables de entorno
cp env.example .env
# Editar .env con tus credenciales

# 2. Ejecutar setup completo (DB + migraciones + sync histórico)
chmod +x start_fresh.sh
./start_fresh.sh
```

El script `start_fresh.sh` realiza automáticamente:
1. Detiene servicios y limpia la DB anterior
2. Construye imagen Docker
3. Crea la base de datos con Prisma
4. Levanta el servidor
5. Sincroniza: productos → ventas históricas (desde 2021) → mes actual → ventas semanales (24 semanas) → compras históricas

### Levantar (después del setup)

```bash
docker-compose up -d         # Iniciar
docker-compose down          # Detener
docker logs -f axam-dashboard  # Ver logs
```

**Dashboard:** [http://localhost:3001](http://localhost:3001)

---

## Configuración (.env)

```env
# === Manager+ API ===
ERP_BASE_URL=https://axam.managermas.cl/api
ERP_USERNAME=tu_usuario
ERP_PASSWORD=tu_password
RUT_EMPRESA=12345678-9

# === Base de datos ===
DATABASE_URL="file:../data/dev.db"
DB_PATH=./data/dev.db

# === Email (alertas de stock bajo) ===
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=tu-correo@gmail.com
EMAIL_PASSWORD=xxxx-xxxx-xxxx-xxxx
EMAIL_FROM="Alertas AXAM <tu-correo@gmail.com>"
```

---

## Vistas del Dashboard

| Ruta | Página | Descripción |
|---|---|---|
| `/` | Dashboard principal | KPIs globales, ventas por producto, stock, compra sugerida |
| `/ventas/analisis` | Análisis personalizado | Predicciones, algoritmos de sugerencia, cobertura |
| `/ventas/graficos` | Análisis de mercado | Gráficos de tendencias y ranking de productos |
| `/ventas/ingresos` | Ingresos | Análisis de ventas monetarias (CLP) |
| `/ventas/objetivos` | Objetivos y vendedores | Metas mensuales por vendedor y cumplimiento |
| `/analisis-margenes` | Análisis de márgenes | Márgenes por producto, listas de precios |
| `/historial` | Historial de ventas | Vista detallada mensual/semanal |
| `/historial-compras` | Historial de compras | Compras históricas y estadísticas |
| `/compras` | Compras últimos 12M | Resumen de compras por producto |
| `/ocs-ocis` | OCs y OCIs | Órdenes de compra internas |
| `/logistica` | Logística | Vista de logística |
| `/minimos` | Stock mínimo | Configuración de mínimos y alertas |

---

## Sincronización de Datos

### Tareas CRON Automáticas

El servidor programa automáticamente dos tareas:

#### 🕐 01:00 AM (Chile) — Sincronización diaria

Ejecuta `syncYesterday()` + `syncComprasYesterday()`:

| Paso | Función | Qué sincroniza |
|---|---|---|
| 1 | `syncNewProducts()` | Productos nuevos desde Manager+ |
| 2 | `syncFullMonth()` | Recalcula el mes completo (ventas mensuales) |
| 3 | `syncWeek()` | Actualiza la semana actual (ventas semanales) |
| 4 | `syncCurrentMonthData()` | Stock actual + ventas acumuladas del mes |
| 5 | `syncComprasYesterday()` | Compras del día anterior + costos |

**Datos auto-capturados durante la sincronización:**

| Dato | Cómo se obtiene |
|---|---|
| **Vendedores** | Se crean automáticamente al procesar cada venta (campo `usuario_vendedor` de Manager+) |
| **Proveedores** | Se extraen automáticamente de cada compra histórica (campo `proveedor` + `rutProveedor`) |
| **Costos** | Se actualizan en productos al sincronizar compras (`precioUltimaCompra`) |

#### 🕔 17:00 PM (Chile) — Alerta de stock bajo

Ejecuta `alertaStockBajo.js`: revisa productos bajo mínimo y envía emails de alerta.

### Sincronización Manual

```bash
# Dentro del contenedor Docker:

# Sincronización diaria (la misma que ejecuta el CRON)
docker-compose exec axam-dashboard node scripts/syncDaily.js daily

# Sync completo desde 2021
docker-compose exec axam-dashboard node scripts/syncDaily.js full

# Sync de un mes específico
docker-compose exec axam-dashboard node scripts/syncDaily.js month 2026 2

# Sync últimas N semanas (para filtro semanal)
docker-compose exec axam-dashboard node scripts/syncDaily.js weeks 24

# Solo mes actual (stock + ventas)
docker-compose exec axam-dashboard node scripts/syncDaily.js current

# Solo productos
docker-compose exec axam-dashboard node scripts/syncDaily.js products

# Productos con listas de precios
docker-compose exec axam-dashboard node scripts/syncProductos.js

# Compras completas desde 2021
docker-compose exec axam-dashboard node scripts/syncCompras.js full

# Alerta de stock bajo manual
docker-compose exec axam-dashboard node scripts/alertaStockBajo.js
```

---

## Estructura del Proyecto

```
test-syncVentas/
├── client/                  # Frontend Next.js
│   └── src/app/             # Páginas del dashboard
├── controllers/             # Controladores Express
│   ├── dashboardController.js
│   ├── ventasController.js
│   └── ...
├── routes/                  # Rutas de la API
│   ├── ventas.js
│   ├── dashboard.js
│   ├── sync.js
│   └── ...
├── services/                # Servicios de negocio
│   ├── salesService.js      # Conexión con Manager+ (ventas)
│   ├── providerService.js   # Gestión de proveedores
│   └── rotacionService.js   # Cálculos de rotación
├── scripts/                 # Scripts de sincronización
│   ├── syncDaily.js         # Sync ventas (diario, inicial, semanal)
│   ├── syncCompras.js       # Sync compras históricas
│   ├── syncProductos.js     # Sync productos + listas de precios
│   └── alertaStockBajo.js   # Alertas por email
├── prisma/
│   └── schema.prisma        # Esquema de base de datos
├── utils/                   # Utilidades compartidas
├── data/                    # Base de datos SQLite (dev.db)
├── server.js                # Servidor Express + CRON
├── docker-compose.yml       # Configuración Docker
├── Dockerfile               # Imagen del contenedor
├── start_fresh.sh           # Script de setup completo
└── .env                     # Variables de entorno
```

---

## Base de Datos (Prisma/SQLite)

### Tablas principales

| Tabla | Descripción | Clave única |
|---|---|---|
| `productos` | Catálogo de productos (SKU, descripción, familia, stock) | `sku` |
| `ventas_historicas` | Ventas mensuales por producto y vendedor | `productoId + año + mes + vendedor` |
| `ventas_semanales` | Ventas semanales por producto y vendedor | `productoId + año + semana + vendedor` |
| `ventas_actuales` | Ventas del mes en curso + stock actual | `productoId + vendedor` |
| `compras_historicas` | Compras mensuales por producto | `productoId + año + mes` |
| `vendedores` | Catálogo de vendedores | `codigo` |
| `precios_listas` | Precios por lista (89, 652, 386) | `productoId + listaId` |
| `objetivos_ventas` | Metas mensuales por vendedor | `vendedorId + año + mes` |
| `emails_notificacion` | Destinatarios de alertas | `email` |

---

## API Reference

### Endpoints principales

| Endpoint | Descripción |
|---|---|
| `GET /api/dashboard` | Dashboard principal (KPIs, ventas, stock) |
| `GET /api/ventas/dashboard` | Ventas por producto (filtros: frecuencia, semanas, meses) |
| `GET /api/ventas/resumen` | KPIs y resumen global |
| `GET /api/ventas/tendencias` | Datos de tendencias |
| `GET /api/ventas/graficos` | Gráficos avanzados |
| `GET /api/compras/historial` | Historial de compras |
| `GET /api/compras/historial/stats` | Estadísticas de compras |
| `GET /api/margenes` | Análisis de márgenes |
| `GET /api/productos` | Lista de productos |
| `GET /api/rotacion` | Datos de rotación |
| `GET /api/sync/stream` | Sincronización en vivo (SSE) |

### Filtros comunes

| Parámetro | Valores | Descripción |
|---|---|---|
| `frequency` | `MONTHLY`, `WEEKLY` | Frecuencia temporal |
| `weeks` | 1-24 | Número de semanas (modo semanal) |
| `meses` | 3, 6, 12, 24, 36 | Meses de historia (modo mensual) |
| `marca` | `KC`, `Todas` | Filtro por marca/familia |
| `origen` | `Nacional`, `Internacional`, `Todos` | Origen del producto |

---

## Notificaciones por Email

### Configuración

1. Crear/usar cuenta Gmail con verificación en 2 pasos
2. Generar contraseña de aplicación: https://myaccount.google.com/apppasswords
3. Configurar variables `EMAIL_*` en `.env`
4. Agregar destinatarios desde `/minimos` → "Configurar Notificaciones"

### API de Notificaciones

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/notifications/emails` | GET | Lista emails configurados |
| `/api/notifications/emails` | POST | Agregar email `{ email: "..." }` |
| `/api/notifications/emails/:email` | DELETE | Eliminar email |
| `/api/notifications/test` | POST | Enviar prueba `{ email: "..." }` |
| `/api/notifications/status` | GET | Estado del servicio |

---

## Rebuild y Mantenimiento

```bash
# Reconstruir imagen (después de cambios en código del servidor)
docker-compose down && docker-compose build --no-cache && docker-compose up -d

# Reconstruir frontend solamente (cambios en client/)
docker-compose exec axam-dashboard sh -c "cd client && npm run build"
docker-compose restart

# Reset completo (⚠️ borra todos los datos)
./start_fresh.sh

# Ver estado del contenedor
docker-compose ps

# Ver logs en tiempo real
docker logs -f axam-dashboard
```

---

## Notas Importantes

- **Zona horaria**: El servidor opera en `America/Santiago` (Chile)
- **Puerto**: El dashboard se expone en el puerto `3001` (mapea al `3000` interno)
- **Rate Limiting**: Las peticiones al ERP se ejecutan secuencialmente con pausa de 1s entre tipos de documento para evitar errores HTTP 429
- **Volúmenes Docker**: Los directorios `data/`, `scripts/` y `services/` se montan como volúmenes, permitiendo cambios en caliente sin rebuild
- **Base de datos**: SQLite almacenada en `./data/dev.db`, persiste entre reinicios del contenedor
- **Filtro semanal**: Requiere datos en `ventas_semanales` (poblados por `syncWeeksBack` en setup y `syncWeek` diario)
