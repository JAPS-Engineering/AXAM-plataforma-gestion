"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Sidebar } from "@/components/sidebar";
import { KPICard } from "@/components/kpi-card";
import { Pagination } from "@/components/pagination";
import { SortButton } from "@/components/sort-button";
import { useState, useMemo } from "react";
import {
    DollarSign,
    TrendingUp,
    Package,
    Calendar,
    Search,
    ChevronUp,
    ChevronDown,
    ChevronsUpDown,
    LineChart as LineChartIcon,
    BarChart3,
    Table as TableIcon
} from "lucide-react";
import { PurchaseCharts } from "./components/purchase-charts";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from "recharts";

// Formateador de moneda CLP
const formatCLP = (amount: number) => {
    return new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: "CLP",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
};

const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
};

// API functions
async function fetchComprasHistorico(params: Record<string, string | number>) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== "") {
            searchParams.set(key, String(value));
        }
    });
    const res = await fetch(`/api/compras/historico?${searchParams}`);
    if (!res.ok) throw new Error("Error al obtener historial de compras");
    return res.json();
}

async function fetchComprasStats() {
    const res = await fetch("/api/compras/stats");
    if (!res.ok) throw new Error("Error al obtener estadísticas");
    return res.json();
}

async function fetchComprasResumen(params: { fechaInicio: string; fechaFin: string }) {
    const searchParams = new URLSearchParams(params);
    const res = await fetch(`/api/compras/resumen?${searchParams}`);
    if (!res.ok) throw new Error("Error al obtener resumen");
    return res.json();
}

async function fetchProductoEvolucion(sku: string) {
    const res = await fetch(`/api/compras/productos/${encodeURIComponent(sku)}/evolucion`);
    if (!res.ok) throw new Error("Error al obtener evolución");
    return res.json();
}

interface CompraHistorica {
    id: number;
    fecha: string;
    cantidad: number;
    precioUnitario: number;
    proveedor: string | null;
    folio: string | null;
    producto: {
        sku: string;
        descripcion: string;
        familia: string;
        precioUltimaCompra: number | null;
    };
}

const getCurrentMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const getPastMonth = (monthsAgo: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() - monthsAgo);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function HistorialComprasPage() {
    // Time period filters
    const [periodMode, setPeriodMode] = useState<"preset" | "custom">("preset");
    const [meses, setMeses] = useState(6);
    const [customRange, setCustomRange] = useState({
        start: getPastMonth(6),
        end: getCurrentMonth()
    });

    // View Mode State
    const [viewMode, setViewMode] = useState<"table" | "charts">("table");

    // Filters
    const [busqueda, setBusqueda] = useState("");
    const [familia, setFamilia] = useState("");
    const [proveedor, setProveedor] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>({ key: "fecha", direction: "desc" });

    // Selected product for evolution chart
    const [selectedSku, setSelectedSku] = useState<string | null>(null);

    // Calculate date range based on period mode
    const dateRange = useMemo(() => {
        if (periodMode === "preset") {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setMonth(startDate.getMonth() - meses);
            return {
                fechaInicio: startDate.toISOString().split('T')[0],
                fechaFin: endDate.toISOString().split('T')[0]
            };
        } else {
            // For custom range, calculate last day of end month
            const [year, month] = customRange.end.split('-').map(Number);
            const endOfMonth = new Date(year, month, 0); // Day 0 of next month = last day of current month
            return {
                fechaInicio: `${customRange.start}-01`,
                fechaFin: endOfMonth.toISOString().split('T')[0]
            };
        }
    }, [periodMode, meses, customRange]);

    // Stats query
    const { data: stats } = useQuery({
        queryKey: ["compras-stats"],
        queryFn: fetchComprasStats,
    });

    // Resumen mensual query
    const { data: resumen } = useQuery({
        queryKey: ["compras-resumen", dateRange],
        queryFn: () => fetchComprasResumen({
            fechaInicio: dateRange.fechaInicio,
            fechaFin: dateRange.fechaFin
        }),
    });

    // Historial query (Server-Side Sorting & Pagination)
    const { data: historial, isLoading, error } = useQuery({
        queryKey: ["compras-historial", currentPage, pageSize, busqueda, familia, proveedor, dateRange, sortConfig],
        queryFn: () => fetchComprasHistorico({
            page: currentPage,
            pageSize,
            sku: busqueda,
            familia,
            proveedor,
            fechaInicio: dateRange.fechaInicio,
            fechaFin: dateRange.fechaFin,
            sortBy: sortConfig?.key || "fecha",
            sortOrder: sortConfig?.direction || "desc"
        }),
        placeholderData: keepPreviousData
    });

    // Evolución query (cuando hay un SKU seleccionado)
    const { data: evolucion } = useQuery({
        queryKey: ["compras-evolucion", selectedSku],
        queryFn: () => fetchProductoEvolucion(selectedSku!),
        enabled: !!selectedSku,
    });

    // Use server-side sorted data directly
    const comprasSorted = historial?.compras || [];

    const handleSort = (key: string) => {
        setSortConfig((current) => {
            if (current?.key === key) {
                // Toggle direction
                if (current.direction === "desc") return { key, direction: "asc" };
                return { key, direction: "desc" };
            }
            // New key, default to desc
            return { key, direction: "desc" };
        });
        setCurrentPage(1); // Reset to page 1 on sort change
    };

    const handlePageSizeChange = (size: number) => {
        setPageSize(size);
        setCurrentPage(1);
    };

    // Transform resumen for chart (filling missing months)
    const chartData = useMemo(() => {
        if (!resumen?.resumen) return [];

        const dataMap = new Map();
        resumen.resumen.forEach((r: { ano: number; mes: number; totalMonto: number }) => {
            const key = `${r.ano}-${String(r.mes).padStart(2, '0')}`;
            dataMap.set(key, r.totalMonto);
        });

        const start = new Date(dateRange.fechaInicio);
        const end = new Date(dateRange.fechaFin);
        const result = [];

        // Iterate month by month from start to end (inclusive)
        const current = new Date(start);
        // Set to first day to avoid overflow issues (e.g. going from Jan 31 to Feb)
        current.setDate(1);

        while (current <= end) {
            const year = current.getFullYear();
            const month = current.getMonth() + 1;
            const key = `${year}-${String(month).padStart(2, '0')}`;

            result.push({
                periodo: `${month}/${year}`,
                monto: dataMap.get(key) || 0
            });

            current.setMonth(current.getMonth() + 1);
        }

        return result;
    }, [resumen, dateRange]);

    // KPIs
    const kpis = {
        totalCompras: stats?.totalCompras || 0,
        productosConCosto: stats?.productosConCosto || 0,
        cobertura: stats?.coberturaCostos || 0,
        ultimaCompra: stats?.ultimaCompra ? formatDate(stats.ultimaCompra) : "N/A"
    };

    // Sort logic adapter for SortButton
    const currentSort = useMemo(() => ({
        column: sortConfig?.key || null,
        direction: sortConfig?.direction || null
    }), [sortConfig]);

    return (
        <div className="flex h-screen bg-slate-100">
            <Sidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 rounded-lg">
                            <DollarSign className="h-6 w-6 text-green-600" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">Historial de Compras</h1>
                            <p className="text-xs text-slate-500">Análisis de costos y evolución de precios (FACE)</p>
                        </div>
                    </div>

                    {/* Time Filter Controls */}
                    {/* Header Controls */}
                    <div className="flex items-center gap-3">
                        {/* View Toggle */}
                        <div className="bg-slate-100 p-1 rounded-lg flex items-center border border-slate-200">
                            <button
                                onClick={() => setViewMode("table")}
                                className={`p-1.5 rounded-md transition-all ${viewMode === "table" ? "bg-white shadow-sm text-slate-900" : "text-slate-400 hover:text-slate-600"}`}
                                title="Vista de Tabla"
                            >
                                <TableIcon className="h-4 w-4" />
                            </button>
                            <button
                                onClick={() => setViewMode("charts")}
                                className={`p-1.5 rounded-md transition-all ${viewMode === "charts" ? "bg-white shadow-sm text-indigo-600" : "text-slate-400 hover:text-slate-600"}`}
                                title="Vista de Gráficos"
                            >
                                <BarChart3 className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="h-8 w-px bg-slate-200 mx-2"></div>

                        <div className="bg-slate-50 rounded-lg p-1 flex items-center border border-slate-200 gap-1">
                            <button
                                onClick={() => setPeriodMode("preset")}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${periodMode === "preset" ? "bg-white text-green-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                            >
                                Predefinido
                            </button>
                            <button
                                onClick={() => setPeriodMode("custom")}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${periodMode === "custom" ? "bg-white text-green-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                            >
                                Específico
                            </button>
                        </div>

                        {periodMode === "preset" ? (
                            <select
                                value={meses}
                                onChange={(e) => { setMeses(Number(e.target.value)); setCurrentPage(1); }}
                                className="px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-200 font-medium text-slate-700 cursor-pointer"
                            >
                                <option value={1}>Mes Actual</option>
                                <option value={3}>Últimos 3 meses</option>
                                <option value={6}>Últimos 6 meses</option>
                                <option value={12}>Último año</option>
                                <option value={24}>Últimos 2 años</option>
                                <option value={36}>Últimos 3 años</option>
                                <option value={48}>Últimos 4 años</option>
                                <option value={60}>Últimos 5 años</option>
                            </select>
                        ) : (
                            <div className="flex items-center gap-2">
                                <input
                                    type="month"
                                    value={customRange.start}
                                    onChange={(e) => { setCustomRange(p => ({ ...p, start: e.target.value })); setCurrentPage(1); }}
                                    className="px-2 py-1 text-sm bg-white border border-slate-200 rounded focus:outline-none text-slate-700 font-medium"
                                />
                                <span className="text-slate-400">→</span>
                                <input
                                    type="month"
                                    value={customRange.end}
                                    onChange={(e) => { setCustomRange(p => ({ ...p, end: e.target.value })); setCurrentPage(1); }}
                                    className="px-2 py-1 text-sm bg-white border border-slate-200 rounded focus:outline-none text-slate-700 font-medium"
                                />
                            </div>
                        )}
                    </div>
                </header>

                <main className="flex-1 overflow-auto p-6">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <KPICard
                            title="Total Compras Registradas"
                            value={kpis.totalCompras.toLocaleString()}
                            icon={Package}
                        />
                        <KPICard
                            title="Productos con Costo"
                            value={kpis.productosConCosto}
                            icon={DollarSign}
                        />
                        <KPICard
                            title="Cobertura de Costos"
                            value={`${kpis.cobertura}%`}
                            icon={TrendingUp}
                            tooltip={
                                <div>
                                    <p className="font-bold mb-1">Porcentaje de Cobertura</p>
                                    <p>Indica qué proporción de tus productos tiene un costo de última compra registrado.</p>
                                    <p className="mt-2 text-slate-400 font-mono text-[10px]">Fórmula: (Productos con Costo / Total Productos) * 100</p>
                                </div>
                            }
                        />
                        <KPICard
                            title="Última Compra"
                            value={kpis.ultimaCompra}
                            icon={Calendar}
                        />
                    </div>

                    {/* Monthly Chart */}
                    {chartData.length > 0 && (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                            <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                                <LineChartIcon className="h-5 w-5 text-green-600" />
                                Evolución de Compras Mensuales
                            </h2>
                            <ResponsiveContainer width="100%" height={250}>
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="periodo" tick={{ fontSize: 12 }} stroke="#64748b" />
                                    <YAxis tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`} tick={{ fontSize: 12 }} stroke="#64748b" />
                                    <Tooltip
                                        formatter={(value) => [formatCLP(value as number), "Monto"]}
                                        labelStyle={{ color: "#1e293b" }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="monto"
                                        stroke="#16a34a"
                                        strokeWidth={2}
                                        dot={{ fill: "#16a34a", strokeWidth: 2 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* Selected Product Evolution */}
                    {selectedSku && evolucion && (
                        <div className="bg-white rounded-xl shadow-sm border border-green-200 p-6 mb-6">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold text-slate-800">
                                    📈 Evolución de Precio: <span className="text-green-600">{selectedSku}</span>
                                </h2>
                                <button
                                    onClick={() => setSelectedSku(null)}
                                    className="text-sm text-slate-500 hover:text-slate-700"
                                >
                                    ✕ Cerrar
                                </button>
                            </div>
                            <p className="text-sm text-slate-600 mb-4">{evolucion.producto?.descripcion}</p>

                            {evolucion.evolucion?.length > 0 ? (
                                <ResponsiveContainer width="100%" height={200}>
                                    <LineChart data={evolucion.evolucion}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis dataKey="periodo" tick={{ fontSize: 11 }} stroke="#64748b" />
                                        <YAxis tickFormatter={(v) => `$${v.toLocaleString()}`} tick={{ fontSize: 11 }} stroke="#64748b" />
                                        <Tooltip formatter={(value) => [formatCLP(value as number), "Precio"]} />
                                        <Line type="monotone" dataKey="precioPromedio" stroke="#16a34a" strokeWidth={2} name="Precio Promedio" />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <p className="text-slate-500 text-center py-8">Sin datos de evolución</p>
                            )}
                        </div>
                    )}

                    {viewMode === "charts" ? (
                        <PurchaseCharts
                            startDate={new Date(dateRange.fechaInicio)}
                            endDate={new Date(dateRange.fechaFin)}
                        />
                    ) : (
                        <>
                            {/* Filters */}
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4">
                                <div className="flex flex-wrap gap-4 items-center">
                                    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                                        <Search className="h-4 w-4 text-slate-400" />
                                        <input
                                            type="text"
                                            value={busqueda}
                                            onChange={(e) => { setBusqueda(e.target.value); setCurrentPage(1); }}
                                            placeholder="Buscar por SKU..."
                                            className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                                        />
                                    </div>
                                    <input
                                        type="text"
                                        value={familia}
                                        onChange={(e) => { setFamilia(e.target.value); setCurrentPage(1); }}
                                        placeholder="Familia..."
                                        className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 w-32"
                                    />
                                    <input
                                        type="text"
                                        value={proveedor}
                                        onChange={(e) => { setProveedor(e.target.value); setCurrentPage(1); }}
                                        placeholder="Proveedor..."
                                        className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 w-40"
                                    />
                                </div>
                            </div>

                            {/* Pagination Top */}
                            <Pagination
                                currentPage={currentPage}
                                totalPages={historial?.totalPages || 1}
                                pageSize={pageSize}
                                totalItems={historial?.total || 0}
                                onPageChange={setCurrentPage}
                                onPageSizeChange={handlePageSizeChange}
                                className="mb-4"
                            />

                            {/* Table */}
                            {isLoading ? (
                                <div className="flex items-center justify-center h-64">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
                                </div>
                            ) : error ? (
                                <div className="flex items-center justify-center h-64 text-red-600">
                                    Error: {(error as Error).message}
                                </div>
                            ) : (
                                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                                                <tr>
                                                    <th className="px-4 py-3 sticky left-0 bg-slate-50 z-10 w-28 text-center border-r border-slate-200 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)]">
                                                        <div className="flex items-center justify-center gap-1 group">
                                                            Fecha
                                                            <SortButton column="fecha" currentSort={currentSort} onSort={handleSort} />
                                                        </div>
                                                    </th>
                                                    <th className="px-4 py-3 sticky left-28 bg-slate-50 z-10 w-32 border-r border-slate-200 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)]">
                                                        <div className="flex items-center gap-1 group">
                                                            SKU
                                                            <SortButton column="sku" currentSort={currentSort} onSort={handleSort} />
                                                        </div>
                                                    </th>
                                                    <th className="px-4 py-3 min-w-[200px]">
                                                        <div className="flex items-center gap-1 group">
                                                            Descripción
                                                            <SortButton column="descripcion" currentSort={currentSort} onSort={handleSort} />
                                                        </div>
                                                    </th>
                                                    <th className="px-4 py-3 whitespace-nowrap">
                                                        <div className="flex items-center gap-1 group">
                                                            Familia
                                                            <SortButton column="familia" currentSort={currentSort} onSort={handleSort} />
                                                        </div>
                                                    </th>
                                                    <th className="px-4 py-3 text-right">
                                                        <div className="flex items-center justify-end gap-1 w-full group">
                                                            Cant.
                                                            <SortButton column="cantidad" currentSort={currentSort} onSort={handleSort} isNumeric />
                                                        </div>
                                                    </th>
                                                    <th className="px-4 py-3 text-right">
                                                        <div className="flex items-center justify-end gap-1 w-full group">
                                                            Precio Unit.
                                                            <SortButton column="precioUnitario" currentSort={currentSort} onSort={handleSort} isNumeric />
                                                        </div>
                                                    </th>
                                                    <th className="px-4 py-3 text-right text-green-700 bg-green-50/50">
                                                        <div className="flex items-center justify-end gap-1 w-full group">
                                                            Costo Última
                                                            <SortButton column="costoUltima" currentSort={currentSort} onSort={handleSort} isNumeric />
                                                        </div>
                                                    </th>
                                                    <th className="px-4 py-3 text-center">Evolución</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {comprasSorted.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                                                            No se encontraron compras en el período seleccionado
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    comprasSorted.map((compra: CompraHistorica) => (
                                                        <tr key={compra.id} className="hover:bg-slate-50 transition-colors group">
                                                            <td className="px-4 py-3 whitespace-nowrap text-slate-600 sticky left-0 bg-white group-hover:bg-slate-50 border-r border-slate-100 font-medium text-center shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)]">
                                                                {formatDate(compra.fecha)}
                                                            </td>
                                                            <td className="px-4 py-3 font-medium text-slate-900 sticky left-28 bg-white group-hover:bg-slate-50 border-r border-slate-100 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)]">
                                                                {compra.producto?.sku}
                                                            </td>
                                                            <td className="px-4 py-3 text-slate-600 max-w-[240px] truncate" title={compra.producto?.descripcion}>
                                                                {compra.producto?.descripcion}
                                                            </td>
                                                            <td className="px-4 py-3 whitespace-nowrap">
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
                                                                    {compra.producto?.familia || "S/F"}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-right font-mono text-slate-600">
                                                                {compra.cantidad.toLocaleString()}
                                                            </td>
                                                            <td className="px-4 py-3 text-right font-mono text-slate-600">
                                                                {formatCLP(compra.precioUnitario)}
                                                            </td>
                                                            <td className="px-4 py-3 text-right font-bold font-mono text-green-700 bg-green-50/30">
                                                                {compra.producto?.precioUltimaCompra ? formatCLP(compra.producto.precioUltimaCompra) : "-"}
                                                            </td>
                                                            <td className="px-4 py-3 text-center">
                                                                <button
                                                                    onClick={() => setSelectedSku(compra.producto?.sku)}
                                                                    className="p-1.5 hover:bg-green-100 rounded text-green-600 transition-colors"
                                                                    title="Ver historial de precios"
                                                                >
                                                                    <LineChartIcon className="h-4 w-4" />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Pagination Bottom */}
                            <Pagination
                                currentPage={currentPage}
                                totalPages={historial?.totalPages || 1}
                                pageSize={pageSize}
                                totalItems={historial?.total || 0}
                                onPageChange={setCurrentPage}
                                onPageSizeChange={handlePageSizeChange}
                                className="mt-4"
                            />
                        </>
                    )}
                </main>
            </div>
        </div>
    );
}
