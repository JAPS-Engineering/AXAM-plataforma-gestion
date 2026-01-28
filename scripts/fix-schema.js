/**
 * Script para corregir el esquema de la base de datos SQLite
 * Agrega las columnas faltantes si ya existe la tabla
 */

require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || './data/ventas.db';
const db = new Database(DB_PATH);

console.log(`Checking schema for: ${DB_PATH}`);

function addColumnIfNotExists(table, column, type) {
    try {
        db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
        console.log(`✅ Column '${column}' added to table '${table}'`);
    } catch (error) {
        if (error.message.includes('duplicate column name')) {
            console.log(`ℹ️ Column '${column}' already exists in table '${table}'`);
        } else {
            console.error(`❌ Error adding column '${column}': ${error.message}`);
        }
    }
}

// Agregar columnas a productos
addColumnIfNotExists('productos', 'familia', "TEXT DEFAULT ''");
addColumnIfNotExists('productos', 'proveedor', "TEXT DEFAULT ''");

// Agregar columna a ventas_mensuales
addColumnIfNotExists('ventas_mensuales', 'vendedor', "TEXT DEFAULT ''");

// Nota: El UNIQUE constraint no se puede alterar fácilmente en SQLite
// Si se requiere cambiar el UNIQUE (producto_id, ano, mes) -> (producto_id, ano, mes, vendedor)
// habría que recrear la tabla. Por ahora, si falla el UNIQUE, lo manejaremos.
// Pero para BI básico, el vendedor en productos o en la venta es clave.

db.close();
console.log('Done.');
