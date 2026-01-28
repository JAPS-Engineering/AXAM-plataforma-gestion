/**
 * Servicio de exportación de órdenes de compra
 * Genera archivos en formatos específicos para cada proveedor
 */

const ExcelJS = require('exceljs');

/**
 * Genera archivo Excel para Kimberly Clark
 * @param {Array} items - Lista de productos a pedir
 * @returns {Buffer} - Buffer del archivo Excel
 */
/**
 * Genera archivo CSV para Kimberly Clark
 * @param {Array} items - Lista de productos a pedir
 * @returns {string} - Contenido del archivo CSV
 */
function generateKCCSV(items) {
    const headers = ['SKU', 'Descripción', 'Cantidad', 'Stock Actual', 'Promedio Venta', 'Observaciones'];
    const lines = [headers.join(',')];

    items.forEach(item => {
        const row = [
            `"${item.sku}"`,
            `"${(item.descripcion || '').replace(/"/g, '""')}"`,
            item.cantidadSugerida || item.cantidad,
            item.stockActual,
            item.promedioVenta,
            `"${(item.observaciones || '').replace(/"/g, '""')}"`
        ];
        lines.push(row.join(','));
    });

    return lines.join('\n');
}

/**
 * Genera archivo de texto plano para Tork
 * Formato específico requerido por el proveedor
 * @param {Array} items - Lista de productos a pedir
 * @returns {string} - Contenido del archivo
 */
function generateTorkTxt(items) {
    const lines = [];

    // Header
    const fecha = new Date().toISOString().split('T')[0];
    lines.push(`ORDEN_COMPRA_TORK|${fecha}`);
    lines.push('---');

    // Items
    items.forEach((item, index) => {
        const cantidad = item.cantidadSugerida || item.cantidad;
        lines.push(`${index + 1}|${item.sku}|${cantidad}|${item.descripcion}`);
    });

    // Footer
    lines.push('---');
    lines.push(`TOTAL_ITEMS|${items.length}`);
    lines.push(`TOTAL_UNIDADES|${items.reduce((sum, i) => sum + (i.cantidadSugerida || i.cantidad), 0)}`);

    return lines.join('\n');
}

/**
 * Genera CSV genérico para cualquier proveedor
 * @param {Array} items - Lista de productos a pedir
 * @returns {string} - Contenido CSV
 */
function generateGenericCSV(items) {
    const headers = ['SKU', 'Descripcion', 'Cantidad', 'Stock Actual', 'Promedio Venta', 'Observaciones'];
    const lines = [headers.join(',')];

    items.forEach(item => {
        const row = [
            `"${item.sku}"`,
            `"${(item.descripcion || '').replace(/"/g, '""')}"`,
            item.cantidadSugerida || item.cantidad,
            item.stockActual || 0,
            item.promedioVenta || 0,
            `"${(item.observaciones || '').replace(/"/g, '""')}"`
        ];
        lines.push(row.join(','));
    });

    return lines.join('\n');
}

/**
 * Genera archivo Excel con múltiples hojas por proveedor
 * @param {Object} ordenesPorProveedor - { proveedor: items[] }
 * @returns {Buffer} - Buffer del archivo Excel
 */
async function generateMultiProviderExcel(ordenesPorProveedor) {
    const workbook = new ExcelJS.Workbook();

    for (const [proveedor, items] of Object.entries(ordenesPorProveedor)) {
        const worksheet = workbook.addWorksheet(proveedor.substring(0, 30));

        worksheet.columns = [
            { header: 'SKU', key: 'sku', width: 20 },
            { header: 'Descripción', key: 'descripcion', width: 40 },
            { header: 'Cantidad a Pedir', key: 'cantidad', width: 18 },
            { header: 'Stock Actual', key: 'stockActual', width: 15 },
            { header: 'Stock Mínimo', key: 'stockMinimo', width: 15 },
            { header: 'Promedio Venta/Mes', key: 'promedioVenta', width: 18 }
        ];

        // Estilo de encabezados
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF1E3A5F' }
        };
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

        items.forEach(item => {
            const row = worksheet.addRow({
                sku: item.sku,
                descripcion: item.descripcion,
                cantidad: item.cantidadSugerida || item.cantidad,
                stockActual: item.stockActual || 0,
                stockMinimo: item.stockMinimo,
                promedioVenta: item.promedioVenta || 0
            });

            // Resaltar productos en quiebre
            if (item.stockActual < (item.stockMinimo || 0)) {
                row.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFFEE2E2' }
                };
            }
        });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
}

module.exports = {
    generateKCCSV,
    generateTorkTxt,
    generateGenericCSV,
    generateMultiProviderExcel
};
