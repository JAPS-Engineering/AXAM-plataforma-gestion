-- CreateTable
CREATE TABLE "configuraciones" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "descripcion" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ordenes_compra" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "codigo" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'NACIONAL',
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "monto_total" REAL NOT NULL DEFAULT 0,
    "moneda" TEXT NOT NULL DEFAULT 'CLP',
    "observaciones" TEXT,
    "fecha_emision" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_envio" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "orden_compra_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orden_compra_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "cantidad" REAL NOT NULL,
    "precio_unit" REAL NOT NULL DEFAULT 0,
    "subtotal" REAL NOT NULL DEFAULT 0,
    "observaciones" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "orden_compra_items_orden_compra_id_fkey" FOREIGN KEY ("orden_compra_id") REFERENCES "ordenes_compra" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "orden_compra_items_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_productos" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sku" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "familia" TEXT NOT NULL DEFAULT '',
    "proveedor" TEXT NOT NULL DEFAULT '',
    "stock_minimo" REAL,
    "factor_empaque" REAL NOT NULL DEFAULT 1,
    "dias_importacion" INTEGER NOT NULL DEFAULT 0,
    "origen" TEXT NOT NULL DEFAULT 'NACIONAL',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_productos" ("created_at", "descripcion", "familia", "id", "sku", "updated_at") SELECT "created_at", "descripcion", "familia", "id", "sku", "updated_at" FROM "productos";
DROP TABLE "productos";
ALTER TABLE "new_productos" RENAME TO "productos";
CREATE UNIQUE INDEX "productos_sku_key" ON "productos"("sku");
CREATE INDEX "productos_sku_idx" ON "productos"("sku");
CREATE INDEX "productos_familia_idx" ON "productos"("familia");
CREATE INDEX "productos_proveedor_idx" ON "productos"("proveedor");
CREATE INDEX "productos_origen_idx" ON "productos"("origen");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "configuraciones_clave_key" ON "configuraciones"("clave");

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_compra_codigo_key" ON "ordenes_compra"("codigo");

-- CreateIndex
CREATE INDEX "ordenes_compra_proveedor_idx" ON "ordenes_compra"("proveedor");

-- CreateIndex
CREATE INDEX "ordenes_compra_estado_idx" ON "ordenes_compra"("estado");

-- CreateIndex
CREATE INDEX "ordenes_compra_tipo_idx" ON "ordenes_compra"("tipo");

-- CreateIndex
CREATE INDEX "ordenes_compra_fecha_emision_idx" ON "ordenes_compra"("fecha_emision");

-- CreateIndex
CREATE INDEX "orden_compra_items_orden_compra_id_idx" ON "orden_compra_items"("orden_compra_id");

-- CreateIndex
CREATE INDEX "orden_compra_items_producto_id_idx" ON "orden_compra_items"("producto_id");

-- CreateIndex
CREATE UNIQUE INDEX "orden_compra_items_orden_compra_id_producto_id_key" ON "orden_compra_items"("orden_compra_id", "producto_id");
