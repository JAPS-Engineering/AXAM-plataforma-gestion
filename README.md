# Sistema de Gesti?n de Ventas - AXAM

Este sistema permite:
1. **Mapear productos** desde Manager+ a una base de datos local (SKU y descripci?n)
2. **Calcular ventas mensuales** desde Facturas de Venta Electr?nica (FAVE) desde enero 2025

## Instalaci?n

```bash
npm install
```

## Configuraci?n

1. Copia el archivo `env.example` a `.env`
2. Configura las credenciales de Manager+ en `.env`

```bash
cp env.example .env
```

Luego edita el archivo `.env` y configura:
- `ERP_BASE_URL`: URL base de la API de Manager+ (por defecto: https://axam.managermas.cl/api)
- `ERP_USERNAME`: Usuario para autenticaci?n en Manager+
- `ERP_PASSWORD`: Contrase?a para autenticaci?n en Manager+
- `RUT_EMPRESA`: RUT de la empresa (formato: 12345678-9)
- `DB_PATH`: Ruta donde se guardar? la base de datos SQLite (por defecto: ./data/ventas.db)

## Uso

### Inicializar Base de Datos

```bash
npm run init:db
```

### Sincronizar Productos

Obtiene todos los productos de Manager+ y los guarda en la base de datos:

```bash
npm run sync:productos
```

### Sincronizar Ventas

Obtiene todas las ventas (FAVE + GDVE + BOVE + NCVE) desde **enero 2021**, calcula las ventas por producto y mes, y las guarda en la base de datos:

```bash
npm run sync:ventas
```

Para ejecutarlo dentro del contenedor Docker:
```bash
docker-compose exec axam-dashboard npm run sync:ventas
```

### Sincronizar Stock

Obtiene el stock actual de todos los productos desde Manager+ y lo sincroniza con la base de datos. El stock se obtiene de la "Bodega General" excluyendo bodegas temporales:

```bash
npm run sync:stock
```

Este script:
- Obtiene todos los productos con stock desde Manager+ usando el endpoint con `con_stock=S`
- Extrae el stock del campo "stock" (array de arrays con campo "saldo")
- Filtra solo las bodegas generales (excluye bodegas temporales)
- Actualiza el campo `stockActual` en la tabla `ventas_actuales` de la base de datos

**⚠️ IMPORTANTE**: Este script debe ejecutarse periódicamente (recomendado cada hora) para mantener el stock actualizado. La vista tipo Excel muestra el stock desde la base de datos, no consulta Manager+ en tiempo real para evitar tiempos de espera largos.

### Sincronizar Ventas del Mes Actual

Obtiene solo las FAVEs del mes actual (desde el inicio del mes hasta hoy), las procesa y actualiza la tabla `ventas_actuales` con las cantidades vendidas:

```bash
npm run sync:ventas:actuales
```

Este script:
- Obtiene solo las FAVEs del mes actual (desde el inicio del mes hasta hoy)
- Procesa las FAVEs y extrae los productos vendidos
- Actualiza la tabla `ventas_actuales` sumando las cantidades vendidas (permite múltiples ejecuciones)
- Permite consultar cuánto se ha vendido actualmente además del stock que queda

**⚠️ IMPORTANTE**: Este script está diseñado para ejecutarse periódicamente (recomendado cada hora) junto con la sincronización de stock, para mantener actualizadas tanto las ventas del mes actual como el stock disponible.

#### Configurar Ejecución Automática Cada Hora

Para ejecutar la sincronización de stock y ventas actuales automáticamente cada hora, puedes usar un cron job:

1. **Abrir el crontab**:
```bash
crontab -e
```

2. **Agregar las siguientes líneas** (ajusta la ruta según tu instalación):
```bash
# Sincronizar stock cada hora
0 * * * * cd /home/jeanf/japs/axam-ordenes-de-compras && /usr/bin/npm run sync:stock >> /home/jeanf/japs/axam-ordenes-de-compras/logs/stock-sync.log 2>&1

# Sincronizar ventas del mes actual cada hora
0 * * * * cd /home/jeanf/japs/axam-ordenes-de-compras && /usr/bin/npm run sync:ventas:actuales >> /home/jeanf/japs/axam-ordenes-de-compras/logs/ventas-actuales-sync.log 2>&1
```

O si prefieres usar la ruta completa de node:
```bash
# Sincronizar stock cada hora
0 * * * * cd /home/jeanf/japs/axam-ordenes-de-compras && /usr/bin/node scripts/actualizarStock.js >> /home/jeanf/japs/axam-ordenes-de-compras/logs/stock-sync.log 2>&1

# Sincronizar ventas del mes actual cada hora
0 * * * * cd /home/jeanf/japs/axam-ordenes-de-compras && /usr/bin/node scripts/syncVentasActuales.js >> /home/jeanf/japs/axam-ordenes-de-compras/logs/ventas-actuales-sync.log 2>&1
```

Esto ejecutará ambas sincronizaciones cada hora (al minuto 0 de cada hora).

**Nota**: Asegúrate de crear el directorio `logs` si no existe:
```bash
mkdir -p logs
```

### Ejecutar Todo

Ejecuta ambos scripts en secuencia:

```bash
npm start
```

### Consultar Ventas

Consulta los datos de ventas guardados en la base de datos:

```bash
# Resumen de ventas por mes
npm run consultar resumen

# Ventas de un producto espec?fico
npm run consultar producto <SKU>

# Top productos por ventas
npm run consultar top [limite]
```

### Test de FAVE

Script de prueba para inspeccionar la estructura de una FAVE y diagnosticar problemas de extracción:

```bash
npm run test:fave
```

Este script:
- Obtiene una FAVE de ejemplo de los últimos 7 días
- Muestra la estructura completa de la FAVE
- Intenta extraer productos y muestra logs detallados
- Ayuda a identificar por qué no se están extrayendo productos correctamente

## Estructura de Base de Datos

### Tabla: productos
- `id`: INTEGER PRIMARY KEY
- `sku`: TEXT UNIQUE (C?digo del producto)
- `descripcion`: TEXT (Descripci?n del producto)
- `created_at`: TEXT (Fecha de creaci?n)
- `updated_at`: TEXT (Fecha de actualizaci?n)

### Tabla: ventas_mensuales
- `id`: INTEGER PRIMARY KEY
- `producto_id`: INTEGER (FK a productos)
- `ano`: INTEGER (A?o de la venta)
- `mes`: INTEGER (Mes de la venta, 1-12)
- `cantidad_vendida`: REAL (Cantidad total vendida en el mes)
- `monto_neto`: REAL (Monto neto total en CLP)
- `created_at`: TEXT (Fecha de creaci?n)
- `updated_at`: TEXT (Fecha de actualizaci?n)
- UNIQUE(producto_id, ano, mes)

## Logs

Los scripts generan logs detallados en la consola mostrando:
- Progreso de sincronizaci?n
- Productos procesados
- FAVEs procesadas
- Errores y advertencias

## Notificaciones por Email - Stock Bajo

El sistema incluye alertas automáticas por email cuando productos tienen stock por debajo del mínimo configurado.

### ¿Cómo funciona?

Todos los días a las **17:00 (hora Chile)**, el sistema:
1. Sincroniza las ventas actuales
2. Consulta productos que tienen stock mínimo configurado
3. Detecta cuáles tienen `stockActual < stockMinimo`
4. Envía un email de alerta a los destinatarios configurados

### Configuración de Email (Gmail)

Para activar las notificaciones necesitas configurar una cuenta Gmail con contraseña de aplicación:

1. **Crear/usar cuenta Gmail** dedicada
2. **Activar verificación en 2 pasos** en la cuenta
3. **Generar contraseña de aplicación**: https://myaccount.google.com/apppasswords
4. **Configurar variables en `.env`**:

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=tu-correo@gmail.com
EMAIL_PASSWORD=xxxx-xxxx-xxxx-xxxx
EMAIL_FROM="Alertas AXAM <tu-correo@gmail.com>"
```

### Configurar Destinatarios

Desde la interfaz web:
1. Ir a `/minimos` (Configuración de Stock Mínimo)
2. Click en botón **"Configurar Notificaciones"**
3. Agregar emails de destinatarios
4. Usar el ícono ✈️ para enviar email de prueba

### API de Notificaciones

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/notifications/emails` | GET | Lista emails configurados |
| `/api/notifications/emails` | POST | Agregar email `{ email: "..." }` |
| `/api/notifications/emails/:email` | DELETE | Eliminar email |
| `/api/notifications/test` | POST | Enviar prueba `{ email: "..." }` |
| `/api/notifications/status` | GET | Estado del servicio |

### Ejecutar Alerta Manualmente

```bash
node scripts/alertaStockBajo.js
```

### Tareas CRON Programadas

El servidor programa automáticamente:
- **01:00 AM (Chile)**: Sincronización diaria de ventas
- **17:00 PM (Chile)**: Alerta de stock bajo
