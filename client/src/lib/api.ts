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
    stockOptimo?: number | null;
    dv?: string | null;
    costo?: number | null;
    factorEmpaque?: number;
    unidad?: string;
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
    tipoCompra?: string; // 'OC' | 'OCI'
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
export async function fetchDashboard(meses: number, marca?: string, frequency: 'MONTHLY' | 'WEEKLY' = 'MONTHLY'): Promise<DashboardResponse> {
    const params = new URLSearchParams({
        meses: meses.toString(),
        frequency
    });
    if (marca) {
        params.append("marca", marca);
    }
    const { data } = await api.get<DashboardResponse>(`/dashboard?${params}`);
    return data;
}

export interface SaveOrderItem {
    productoId: number;
    cantidad: number;
    tipo?: string;
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
        precioUltimaCompra?: number | null;
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
        stockActual: number;
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

export async function fetchVentasDashboard(params: number | DateRangeParams, marca?: string): Promise<VentasDashboardResponse> {
    const query = new URLSearchParams();

    if (typeof params === 'number') {
        query.append("meses", params.toString());
    } else {
        if (params.meses) query.append("meses", params.meses.toString());
        if (params.start) query.append("start", params.start);
        if (params.end) query.append("end", params.end);
    }

    if (marca) {
        query.append("marca", marca);
    }
    const { data } = await api.get<VentasDashboardResponse>(`/ventas/dashboard?${query.toString()}`);
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


export interface DateRangeParams {
    meses?: number;
    start?: string; // YYYY-MM
    end?: string;   // YYYY-MM
}

export async function fetchVentasResumen(params: number | DateRangeParams, marca?: string): Promise<VentasResumenResponse> {
    const query = new URLSearchParams();

    if (typeof params === 'number') {
        query.append("meses", params.toString());
    } else {
        if (params.meses) query.append("meses", params.meses.toString());
        if (params.start) query.append("start", params.start);
        if (params.end) query.append("end", params.end);
    }

    if (marca) {
        query.append("marca", marca);
    }

    const { data } = await api.get<VentasResumenResponse>(`/ventas/resumen?${query.toString()}`);
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
    ventasPorVendedor: MarketShareRow[];
    rendimientoAnual: RendimientoAnualRow[];
    meta: {
        anoActual: number;
        anoAnterior: number;
        totalVentaAnual?: number; // Deprecated by totalVentaPeriodo
        totalVentaPeriodo?: number;
    };
}

export async function fetchGraficosAvanzados(params?: { start?: string; end?: string; marca?: string; yearRef?: number; yearComp?: number }): Promise<GraficosAvanzadosResponse> {
    const query = new URLSearchParams();
    if (params?.start) query.append("start", params.start);
    if (params?.end) query.append("end", params.end);
    if (params?.marca) query.append("marca", params.marca);
    if (params?.yearRef) query.append("yearRef", params.yearRef.toString());
    if (params?.yearComp) query.append("yearComp", params.yearComp.toString());

    const { data } = await api.get<GraficosAvanzadosResponse>(`/ventas/graficos-avanzados?${query.toString()}`);
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

// === API TENDENCIAS ===

export interface TendenciaDataPoint {
    monto: number;
    cantidad: number;
}

export interface TendenciaRow {
    label: string;
    [familia: string]: TendenciaDataPoint | string;
}

export interface VentasTendenciasResponse {
    tendencias: TendenciaRow[];
    familias: string[];
}

export async function fetchVentasTendencias(params: number | DateRangeParams = 6, marca?: string): Promise<VentasTendenciasResponse> {
    const query = new URLSearchParams();

    if (typeof params === 'number') {
        query.append("meses", params.toString());
    } else {
        if (params.meses) query.append("meses", params.meses.toString());
        if (params.start) query.append("start", params.start);
        if (params.end) query.append("end", params.end);
    }

    if (marca) {
        query.append("marca", marca);
    }

    const { data } = await api.get<VentasTendenciasResponse>(`/ventas/tendencias?${query.toString()}`);
    return data;
}

// === API VENDEDORES ===

export interface Vendedor {
    id: number;
    codigo: string;
    nombre: string | null;
    activo: boolean;
    oculto: boolean;
}

export async function fetchVendedores(): Promise<Vendedor[]> {
    const { data } = await api.get<Vendedor[]>("/vendedores");
    return data;
}

export async function updateVendedor(id: number, data: Partial<Vendedor>): Promise<Vendedor> {
    const response = await api.put<Vendedor>(`/vendedores/${id}`, data);
    return response.data;
}

// === API COMPRAS GRÁFICOS ===

export interface ComprasGraficosResponse {
    meta: {
        totalVentaPeriodo: number;
        totalVentaAnual: number;
        anoActual: number;
        anoAnterior: number;
    };
    marketShare: MarketShareRow[];
    ventasPorFamilia: VentasFamiliaRow[];
    rendimientoAnual: RendimientoAnualRow[];
    tendencias: any[]; // Usar estructura similar a ventas tendencias internamente o adaptar
}

export async function fetchComprasGraficos(params?: { fechaInicio?: string; fechaFin?: string; familia?: string; proveedor?: string; yearRef?: number; yearComp?: number; origen?: string }): Promise<ComprasGraficosResponse> {
    const query = new URLSearchParams();
    if (params?.fechaInicio) query.append("fechaInicio", params.fechaInicio);
    if (params?.fechaFin) query.append("fechaFin", params.fechaFin);
    if (params?.familia) query.append("familia", params.familia);
    if (params?.proveedor) query.append("proveedor", params.proveedor);
    if (params?.yearRef) query.append("yearRef", params.yearRef.toString());
    if (params?.yearComp) query.append("yearComp", params.yearComp.toString());
    if (params?.origen) query.append("origen", params.origen);

    const { data } = await api.get<ComprasGraficosResponse>(`/compras/graficos?${query.toString()}`);
    return data;
}

