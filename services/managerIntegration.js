/**
 * Servicio de integración con Manager+
 * Permite crear Órdenes de Compra (OC) y Órdenes de Compra de Importación (OCI)
 */

const axios = require('axios');
const { logInfo, logWarning, logError } = require('../utils/logger');
const { getAuthHeaders } = require('../utils/auth');
const { getPrismaClient } = require('../prisma/client');
const prisma = getPrismaClient();

async function getNextOrderNumber(type) {
    const key = `ultimo_numero_${type.toLowerCase()}`;

    try {
        const headers = await getAuthHeaders();
        // Consultar los últimos documentos de este tipo en Manager+
        // Usamos un rango de fechas de los últimos 6 meses para asegurar que pescamos los últimos
        const today = new Date();
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(today.getMonth() - 6);

        // Formato para la API: yyyyMMdd
        const df = formatDate(sixMonthsAgo).split('/').reverse().join('');
        const dt = formatDate(today).split('/').reverse().join('');

        // CORRECCIÓN: El endpoint correcto para listar OCs es con modalidad 'C' (Compra/Comercial)
        // y el campo que contiene el número de documento es 'folio'.
        const url = `${ERP_BASE_URL}/documents/${RUT_EMPRESA}/${type}/C?df=${df}&dt=${dt}`;

        logInfo(`[${type}] Consultando últimos documentos en Manager+ para correlativo...`);
        const response = await axios.get(url, { headers, timeout: 15000 });
        const docs = response.data.data || response.data || [];

        let lastNum = 0;
        if (Array.isArray(docs) && docs.length > 0) {
            // Encontrar el folio más alto
            docs.forEach(doc => {
                const num = parseInt(doc.folio, 10);
                if (!isNaN(num) && num > lastNum) {
                    lastNum = num;
                }
            });
            logInfo(`[${type}] Último número encontrado en ERP (folio): ${lastNum}`);
        } else {
            logWarning(`[${type}] No se encontraron documentos en el ERP. Usando respaldo local.`);
            const config = await prisma.configuracion.findUnique({ where: { clave: key } });
            lastNum = config ? parseInt(config.valor, 10) : 0;
        }

        const nextNum = lastNum + 1;

        // Actualizar respaldo local en la tabla de configuración
        await prisma.configuracion.upsert({
            where: { clave: key },
            update: { valor: String(nextNum) },
            create: {
                clave: key,
                valor: String(nextNum),
                descripcion: `Último número correlativo (ERP) para ${type}`
            }
        });

        return String(nextNum);
    } catch (error) {
        logError(`[${type}] Error obteniendo correlativo del ERP: ${error.message}. Usando respaldo local.`);
        // Fallback al local si falla la API
        return await prisma.$transaction(async (tx) => {
            const config = await tx.configuracion.findUnique({ where: { clave: key } });
            const currentVal = config ? parseInt(config.valor, 10) : 1;
            const nextNum = currentVal + 1;
            await tx.configuracion.upsert({
                where: { clave: key },
                update: { valor: String(nextNum) },
                create: { clave: key, valor: "1", descripcion: `Respaldo correlatvio ${type}` }
            });
            return String(nextNum);
        });
    }
}

// Flag para habilitar/deshabilitar integración real
// En producción debería estar en true o controlado por variable de entorno
const INTEGRATION_ENABLED = process.env.ENABLE_ERP_INTEGRATION === 'true' || true;

const RUT_EMPRESA = process.env.RUT_EMPRESA;
const ERP_BASE_URL = process.env.ERP_BASE_URL;

// Códigos de configuración obtenidos de validación con API
const MANAGER_CONFIG = {
    COD_UNIDNEGOCIO: "UNEG-001",
    CEN_COS: "A06",
    FALLBACK_PROVIDER_RUT: "96604460-8", // ECOLAB SPA
    FALLBACK_PROVIDER_NAME: "ECOLAB SPA"
};

function formatDate(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

/**
 * Crea una Orden de Compra en Manager+
 * @param {Object} data - Datos de la OC
 * @returns {Object} - Resultado de la operación
 */
async function createPurchaseOrder(data) {
    const {
        proveedor,
        items,
        observaciones = '',
        fechaEntrega
    } = data;

    logInfo(`[OC] Iniciando creación de Orden de Compra Nacional para ${proveedor.nombre || proveedor}`);

    if (!INTEGRATION_ENABLED) {
        return {
            success: true,
            mock: true,
            message: 'Simulación: Integración deshabilitada',
            data: { codigo: `MOCK-OC-${Date.now()}` }
        };
    }

    try {
        const headers = await getAuthHeaders();
        const url = `${ERP_BASE_URL}/import/create-document/?emitir=0&docnumreg=1`;

        // Obtener número correlativo
        const numDoc = await getNextOrderNumber('OC');
        logInfo(`[OC] Usando número correlativo: ${numDoc}`);

        // Fechas
        const today = new Date();
        const vctoDate = new Date(today);
        vctoDate.setDate(vctoDate.getDate() + 30); // Default 30 días

        // Validar RUT proveedor
        // Si no tenemos RUT (ej. proveedor es solo nombre), usar fallback
        const rutCliente = proveedor.rut || MANAGER_CONFIG.FALLBACK_PROVIDER_RUT;

        // Calcular totales
        const totalNeto = items.reduce((sum, item) => sum + Math.round((item.precioUnit || 0) * item.cantidad), 0);
        const iva = Math.round(totalNeto * 0.19);
        const total = totalNeto + iva;

        // Construir Payload
        const payload = {
            rut_empresa: RUT_EMPRESA,
            tipodocumento: "OC",
            num_doc: numDoc,
            fecha_doc: formatDate(today),
            fecha_ref: "",
            fecha_vcto: formatDate(vctoDate),
            modalidad: "S",
            cod_unidnegocio: MANAGER_CONFIG.COD_UNIDNEGOCIO,
            rut_cliente: rutCliente,
            dire_cliente: "",
            rut_facturador: "",
            cod_vendedor: "",
            cod_comisionista: "",
            lista_precio: "",
            plazo_pago: "30",
            stock: "R",
            cod_moneda: "CLP",
            tasa_cambio: "1",
            afecto: String(totalNeto),
            exento: "0",
            iva: String(iva),
            imp_esp: "",
            iva_ret: "",
            imp_ret: "",
            tipo_desc_global: "",
            monto_desc_global: "",
            total: String(total),
            deuda_pendiente: "0",
            glosa: observaciones || "Generado desde AXAM Dashboard",
            ajuste_iva: "0",
            iva_proporcional: "A",
            detalles: items.map(p => ({
                cod_producto: p.sku,
                cantidad: String(p.cantidad),
                unidad: p.unidad || "U",
                precio_unit: String(Math.round(p.precioUnit || 0)),
                moneda_det: "CLP",
                tasa_cambio_det: "1",
                nro_serie: "",
                num_lote: "",
                fecha_vec: "",
                cen_cos: MANAGER_CONFIG.CEN_COS,
                tipo_desc: "",
                descuento: "",
                ubicacion: "",
                bodega: "",
                concepto1: "",
                concepto2: "",
                concepto3: "",
                concepto4: "",
                descrip: p.descripcion ? p.descripcion.substring(0, 60) : "",
                desc_adic: "",
                comentario1: "",
                comentario2: "",
                comentario3: "",
                comentario4: "",
                comentario5: "",
                cod_impesp1: "",
                mon_impesp1: "",
                cod_impesp2: "",
                mon_impesp2: "",
                fecha_comp: "",
                porc_retencion: ""
            }))
        };

        logInfo('[OC] Enviando payload a Manager+...');
        const response = await axios.post(url, payload, { headers, timeout: 30000 });

        if (response.data && response.data.retorno) {
            logInfo(`[OC] Éxito: ${JSON.stringify(response.data.mensaje)}`);
            return {
                success: true,
                message: 'Orden creada exitosamente en Manager+',
                data: response.data
            };
        } else {
            console.error('Error API Manager:', JSON.stringify(response.data, null, 2));
            throw new Error(JSON.stringify(response.data.mensaje || 'Error desconocido de API'));
        }

    } catch (error) {
        const errMsg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
        logError(`[OC] Error creando orden: ${errMsg}`);
        return {
            success: false,
            message: `Error al crear orden en Manager+: ${errMsg}`
        };
    }
}

/**
 * Crea una Orden de Compra de Importación en Manager+
 * @param {Object} data - Datos de la OCI
 * @returns {Object} - Resultado de la operación
 */
async function createImportOrder(data) {
    const {
        proveedor,
        items,
        moneda = 'USD',
        tipoCambio = 950,
        observaciones = '',
        fechaEmbarque,
        diasImportacion
    } = data;

    logInfo(`[OCI] Iniciando creación de Orden de Compra Importación para ${proveedor.nombre || proveedor}`);

    if (!INTEGRATION_ENABLED) {
        return {
            success: true,
            mock: true,
            message: 'Simulación: Integración deshabilitada',
            data: { codigo: `MOCK-OCI-${Date.now()}` }
        };
    }

    try {
        const headers = await getAuthHeaders();
        const url = `${ERP_BASE_URL}/import/create-document/?emitir=0&docnumreg=1`;

        const today = new Date();
        const vctoDate = new Date(today);
        vctoDate.setDate(vctoDate.getDate() + 60); // Default 60 días para importación

        const rutCliente = proveedor.rut || MANAGER_CONFIG.FALLBACK_PROVIDER_RUT;

        // Calcular totales en moneda extranjera
        const totalExento = items.reduce((sum, item) => sum + ((item.precioUnit || 0) * item.cantidad), 0);
        // OCI es exenta de IVA localmente, se paga en internación
        const total = totalExento;

        const payload = {
            rut_empresa: RUT_EMPRESA,
            tipodocumento: "OCI",
            num_doc: String(Date.now()).slice(-6),
            fecha_doc: formatDate(today),
            fecha_ref: "",
            fecha_vcto: formatDate(vctoDate),
            modalidad: "S",
            cod_unidnegocio: MANAGER_CONFIG.COD_UNIDNEGOCIO,
            rut_cliente: rutCliente,
            dire_cliente: "",
            rut_facturador: "",
            cod_vendedor: "",
            cod_comisionista: "",
            lista_precio: "",
            plazo_pago: "60",
            stock: "0", // OCI no mueve stock inmediatamente
            cod_moneda: moneda,
            tasa_cambio: String(tipoCambio),
            afecto: String(totalExento), // En Manager OCI suele ir en afecto o exento según configuración, usaremos afecto del monto total USD
            exento: "0",
            iva: "0",
            imp_esp: "",
            iva_ret: "",
            imp_ret: "",
            tipo_desc_global: "",
            monto_desc_global: "",
            total: String(total),
            deuda_pendiente: "0",
            glosa: observaciones || "Generado desde AXAM Dashboard (Importación)",
            ajuste_iva: "0",
            iva_proporcional: "A",
            detalles: items.map(p => ({
                cod_producto: p.sku,
                cantidad: String(p.cantidad),
                unidad: p.unidad || "U",
                precio_unit: String(p.precioUnit || 0),
                moneda_det: moneda,
                tasa_cambio_det: "1", // Tasa detalle 1 si moneda coincide con doc
                nro_serie: "",
                num_lote: "",
                fecha_vec: "",
                cen_cos: MANAGER_CONFIG.CEN_COS,
                tipo_desc: "",
                descuento: "",
                ubicacion: "",
                bodega: "",
                concepto1: "",
                concepto2: "",
                concepto3: "",
                concepto4: "",
                descrip: p.descripcion ? p.descripcion.substring(0, 60) : "",
                desc_adic: "",
                comentario1: "",
                comentario2: "",
                comentario3: "",
                comentario4: "",
                comentario5: "",
                cod_impesp1: "",
                mon_impesp1: "",
                cod_impesp2: "",
                mon_impesp2: "",
                fecha_comp: "",
                porc_retencion: ""
            }))
        };

        logInfo('[OCI] Enviando payload a Manager+...');
        const response = await axios.post(url, payload, { headers, timeout: 30000 });

        if (response.data && response.data.retorno) {
            logInfo(`[OCI] Éxito: ${JSON.stringify(response.data.mensaje)}`);
            return {
                success: true,
                message: 'Orden de Importación creada exitosamente en Manager+',
                data: response.data
            };
        } else {
            console.error('Error API Manager:', JSON.stringify(response.data, null, 2));
            throw new Error(JSON.stringify(response.data.mensaje || 'Error desconocido de API'));
        }

    } catch (error) {
        const errMsg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
        logError(`[OCI] Error creando orden importación: ${errMsg}`);
        return {
            success: false,
            message: `Error al crear OCI en Manager+: ${errMsg}`
        };
    }
}

/**
 * Verifica el estado de la integración
 * @returns {Object} - Estado de la integración
 */
function getIntegrationStatus() {
    return {
        enabled: INTEGRATION_ENABLED,
        message: INTEGRATION_ENABLED
            ? 'Integración con Manager+ habilitada'
            : 'Integración desactivada (Modo simulación)',
        config: {
            unidadNegocio: MANAGER_CONFIG.COD_UNIDNEGOCIO,
            centroCosto: MANAGER_CONFIG.CEN_COS
        }
    };
}

module.exports = {
    createPurchaseOrder,
    createImportOrder,
    getIntegrationStatus,
    INTEGRATION_ENABLED
};
