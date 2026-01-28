import axios from "axios";

// En desarrollo, Next.js usa un proxy; en producción, apunta al mismo servidor
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

// Aumentar timeout a 5 minutos (300000 ms) para soportar sincronizaciones largas
export const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        "Content-Type": "application/json",
    },
    timeout: 300000,
});

// Types
export interface ProductoInfo {
    id: number;
    sku: string;
    descripcion: string;
    familia?: string;
    stockMinimo?: number | null;
}

export interface MesVenta {
    label: string;
    cantidad: number;
}

export interface MesActual {
    ventaActual: number;
    stockActual: number;
}

export interface ProductoDashboard {
    producto: ProductoInfo;
    ventasMeses: MesVenta[];
    mesActual: MesActual;
    promedio: number;
    compraSugerida: number;
    compraRealizar: number | null;
    bajoMinimo?: boolean;
}

export interface DashboardMeta {
    mesActual: string;
    columnas: string[];
    generadoEn: string;
}

export interface DashboardResponse {
    productos: ProductoDashboard[];
    meta: DashboardMeta;
}

// API Functions
export async function fetchDashboard(meses: number, marca?: string): Promise<DashboardResponse> {
    const params = new URLSearchParams({ meses: meses.toString() });
    if (marca) {
        params.append("marca", marca);
    }
    const { data } = await api.get<DashboardResponse>(`/dashboard?${params}`);
    return data;
}

export interface SaveOrderItem {
    productoId: number;
    cantidad: number;
}

export async function saveOrders(items: SaveOrderItem[]): Promise<void> {
    await api.post("/dashboard/orden", { items });
}

export async function resetOrders(): Promise<void> {
    await api.delete("/dashboard/orden/reset");
}

export async function syncProductsApi(): Promise<void> {
    await api.post("/dashboard/sync-products");
}

// Types para Historial de Sincronización
export interface SyncLog {
    id: number;
    tipo: string;
    mesTarget: number;
    anoTarget: number;
    documentos: number;
    productos: number;
    productosConVentas: number;
    mensaje: string | null;
    createdAt: string;
}

export interface SyncHistoryResponse {
    logs: SyncLog[];
    total: number;
}

export async function fetchSyncHistory(limit: number = 50): Promise<SyncHistoryResponse> {
    const { data } = await api.get<SyncHistoryResponse>(`/dashboard/sync-history?limit=${limit}`);
    return data;
}

// === API VENTAS (MONETARIO) ===

export interface VentasMes {
    ano: number;
    mes: number;
    label: string;
    cantidad: number;
    montoNeto: number;
}

export interface ProductoVentasRow {
    producto: {
        id: number;
        sku: string;
        descripcion: string;
        familia: string;
    };
    ventasMeses: VentasMes[];
    totalMonto: number;
    totalCantidad: number;
    promedioMonto: number;
    promedioCantidad: number;
    mesActual: {
        ano: number;
        mes: number;
        montoVendido: number;
        cantidadVendida: number;
    };
}

export interface VentasDashboardMeta {
    mesesConsultados: number;
    marca: string | null;
    mesActual: { ano: number; mes: number };
    columnas: string[];
    totalProductos: number;
    totalMontoPeriodo: number;
    promedioMontoPeriodo: number;
    generadoEn: string;
}

export interface VentasDashboardResponse {
    meta: VentasDashboardMeta;
    productos: ProductoVentasRow[];
}

export async function fetchVentasDashboard(meses: number, marca?: string): Promise<VentasDashboardResponse> {
    const params = new URLSearchParams({ meses: meses.toString() });
    if (marca) {
        params.append("marca", marca);
    }
    const { data } = await api.get<VentasDashboardResponse>(`/ventas/dashboard?${params}`);
    return data;
}

export interface VentasResumenKPIs {
    totalMonto: number;
    promedioMensual: number;
    crecimiento: number;
    topProducto: {
        producto: { sku: string; descripcion: string };
        totalMonto: number;
        totalCantidad: number;
    } | null;
}

export interface VentasMensualesChart {
    label: string;
    ano: number;
    mes: number;
    montoNeto: number;
    cantidad: number;
}

export interface TopProductoChart {
    producto: { sku: string; descripcion: string };
    totalMonto: number;
    totalCantidad: number;
}

export interface VentasResumenResponse {
    kpis: VentasResumenKPIs;
    ventasMensuales: VentasMensualesChart[];
    topProductos: TopProductoChart[];
    meta: any;
}

export async function fetchVentasResumen(meses: number): Promise<VentasResumenResponse> {
    const { data } = await api.get<VentasResumenResponse>(`/ventas/resumen?meses=${meses}`);
    return data;
}

export interface VentasFamiliaRow {
    familia: string;
    totalMonto: number;
    totalCantidad: number;
}

export interface MarketShareRow {
    name: string;
    value: number;
    percentage: string;
    [key: string]: any;
}

export interface RendimientoAnualRow {
    mes: number;
    mensualActual: number;
    acumuladoActual: number;
    mensualAnterior: number;
    acumuladoAnterior: number;
}

export interface GraficosAvanzadosResponse {
    ventasPorFamilia: VentasFamiliaRow[];
    marketShare: MarketShareRow[];
    rendimientoAnual: RendimientoAnualRow[];
    meta: {
        anoActual: number;
        anoAnterior: number;
        totalVentaAnual: number;
    };
}

export async function fetchGraficosAvanzados(): Promise<GraficosAvanzadosResponse> {
    const { data } = await api.get<GraficosAvanzadosResponse>("/ventas/graficos-avanzados");
    return data;
}


// === API OBJETIVOS Y PROYECCIONES ===

export interface ObjetivoVenta {
    id: number;
    tipo: string;
    entidadId: string;
    ano: number;
    mes: number;
    montoObjetivo: number;
}

export interface ProyeccionVenta {
    id: number;
    vendedorId: string;
    ano: number;
    mes: number;
    montoPropongo: number;
    observacion?: string;
}

export interface TargetsResponse {
    meta: {
        ano: number;
        mes: number;
    };
    objetivos: ObjetivoVenta[];
    proyecciones: ProyeccionVenta[];
}

export async function fetchTargets(ano?: number, mes?: number, vendedorId?: string): Promise<TargetsResponse> {
    const params = new URLSearchParams();
    if (ano) params.append("ano", ano.toString());
    if (mes) params.append("mes", mes.toString());
    if (vendedorId) params.append("vendedorId", vendedorId);

    const { data } = await api.get<TargetsResponse>(`/targets?${params}`);
    return data;
}

export async function saveObjetivo(data: {
    tipo: string;
    entidadId: string;
    ano: number;
    mes: number;
    montoObjetivo: number;
}): Promise<ObjetivoVenta> {
    const response = await api.post<{ success: boolean; objetivo: ObjetivoVenta }>("/targets/objetivo", data);
    return response.data.objetivo;
}


export async function saveProyeccion(data: {
    vendedorId: string;
    ano: number;
    mes: number;
    montoPropongo: number;
    observacion?: string;
}): Promise<ProyeccionVenta> {
    const response = await api.post<{ success: boolean; proyeccion: ProyeccionVenta }>("/targets/proyeccion", data);
    return response.data.proyeccion;
}

export interface StockHistoryPoint {
    fecha: string; // ISO date
    stock: number;
    bodega?: string;
}

export interface StockHistoryResponse {
    sku: string;
    descripcion: string;
    dias: number;
    historial: StockHistoryPoint[];
}

export async function fetchStockHistory(sku: string, dias: number = 30): Promise<StockHistoryResponse> {
    const { data } = await api.get<StockHistoryResponse>(`/productos/historial-stock?sku=${sku}&dias=${dias}`);
    return data;
}

export interface LogisticaUpdate {
    factorEmpaque?: number;
    diasImportacion?: number;
    origen?: string;
    stockOptimo?: number | null;
}

export async function updateLogistica(id: number, data: LogisticaUpdate): Promise<void> {
    await api.patch(`/productos/${id}/logistica`, data);
}
