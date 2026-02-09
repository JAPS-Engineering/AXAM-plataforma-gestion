
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'ventas.db');
const db = new Database(dbPath, { readonly: true });

try {
    console.log("--- PRODUCTOS (Muestra) ---");
    const products = db.prepare("SELECT sku, descripcion, proveedor FROM productos LIMIT 5").all();
    console.table(products);

    console.log("\n--- COMPRAS HISTORICAS (Muestra) ---");
    const compras = db.prepare("SELECT producto_id, fecha, proveedor, rut_proveedor FROM compras_historicas ORDER BY fecha DESC LIMIT 5").all();
    console.table(compras);

    console.log("\n--- TOTAL COMPRAS CON PROVEEDOR ---");
    const count = db.prepare("SELECT COUNT(*) as total FROM compras_historicas WHERE proveedor IS NOT NULL OR rut_proveedor IS NOT NULL").get();
    console.log(count);

} catch (e) {
    console.error(e);
} finally {
    db.close();
}
