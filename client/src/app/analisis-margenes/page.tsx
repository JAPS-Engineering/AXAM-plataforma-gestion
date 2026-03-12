"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Sidebar } from "@/components/sidebar";
import { Pagination } from "@/components/pagination";
import { SortButton } from "@/components/sort-button";
import { useState, useMemo } from "react";
import {
    Percent,
    Search
} from "lucide-react";
import { api } from "@/lib/api";

// Helper Functions
const formatCLP = (amount: number) => {
    return new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: "CLP",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
};

const formatPercent = (value: number) => {
    return new Intl.NumberFormat("es-CL", {
        style: "percent",
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    }).format(value);
};

// API Fetcher
async function fetchMargenes(params: Record<string, string | number | undefined>) {
    const res = await api.get("/margenes", { params });
    return res.data;
}

interface ProductoMargen {
    id: number;
    sku: string;
    descripcion: string;
    familia: string;
    proveedor: string;
    costo: number | null;
    precio_89: number | null;
    precio_652: number | null;
    precio_386: number | null;
    ventas_cantidad: number;
    ventas_monto: number;
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

export default function AnalisisMargenesPage() {
    // Filters
    const [busqueda, setBusqueda] = useState("");
    const [familia, setFamilia] = useState("");
    const [proveedor, setProveedor] = useState("");
    const [costoFilter, setCostoFilter] = useState<"all" | "with_cost" | "without_cost">("all");

    // Time period filters
    const [periodMode, setPeriodMode] = useState<"preset" | "custom">("preset");
    const [meses, setMeses] = useState(3);
    const [customRange, setCustomRange] = useState({
        start: getPastMonth(3),
        end: getCurrentMonth()
    });

    // Pagination & Sorting
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>({ key: "ventas_monto", direction: "desc" });

    // Calculate date range based on period mode
    const range = useMemo(() => {
        if (periodMode === "preset") {
            const now = new Date();
            const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            if (meses === 1) {
                // Mes Actual: solo el mes en curso
                return { start: currentMonth, end: currentMonth };
            }

            // Últimos N meses: desde hace N meses hasta el mes actual (inclusive)
            const startDate = new Date(now.getFullYear(), now.getMonth() - (meses - 1), 1);
            const startMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
            return { start: startMonth, end: currentMonth };
        } else {
            return customRange;
        }
    }, [periodMode, meses, customRange]);

    // Query
    const { data: response, isLoading, error } = useQuery({
        queryKey: ["margenes", range, familia, proveedor],
        queryFn: () => fetchMargenes({
            fechaInicio: range.start,
            fechaFin: range.end,
            familia,
            proveedor
        }),
        placeholderData: keepPreviousData
    });

    // Process Data (Client-side filtering & sorting)
    const processedData = useMemo(() => {
        if (!response?.data) return [];

        let data = [...response.data] as ProductoMargen[];

        // Client-side text search (SKU/Desc)
        if (busqueda) {
            const lowerQuery = busqueda.toLowerCase();
            data = data.filter(p =>
                p.sku.toLowerCase().includes(lowerQuery) ||
                p.descripcion.toLowerCase().includes(lowerQuery)
            );
        }

        // Cost Filter
        if (costoFilter === "with_cost") {
            data = data.filter(p => p.costo && p.costo > 0);
        } else if (costoFilter === "without_cost") {
            data = data.filter(p => !p.costo || p.costo === 0);
        }

        // Sorting
        if (sortConfig) {
            data.sort((a, b) => {
                let valA: any = a[sortConfig.key as keyof ProductoMargen];
                let valB: any = b[sortConfig.key as keyof ProductoMargen];

                if (typeof valA === 'string') valA = valA.toLowerCase();
                if (typeof valB === 'string') valB = valB.toLowerCase();

                // Handle string comparisons
                if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
                if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
                return 0;
            });
        }

        return data;
    }, [response, busqueda, sortConfig, costoFilter]);

    // Pagination Logic
    const totalItems = processedData.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const paginatedData = processedData.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
    );

    const handleSort = (key: string) => {
        setSortConfig((current) => {
            if (current?.key === key) {
                return { key, direction: current.direction === "desc" ? "asc" : "desc" };
            }
            return { key, direction: "desc" };
        });
        setCurrentPage(1);
    };

    const currentSort = useMemo(() => ({
        column: sortConfig?.key || null,
        direction: sortConfig?.direction || null
    }), [sortConfig]);

    // Helper to render margin cell
    const renderMarginCell = (price: number | null, cost: number | null) => {
        if (!price || !cost) return <span className="text-slate-300">-</span>;

        const margin = price - cost;
        const marginPct = margin / price;

        // Color coding
        let colorClass = "text-green-600";
        if (marginPct < 0.15) colorClass = "text-red-600 font-bold";
        else if (marginPct < 0.25) colorClass = "text-yellow-600";

        return (
            <div className="flex flex-col items-end">
                <span className="text-xs text-slate-500">{formatCLP(price)}</span>
                <div className={`flex items-center gap-1 ${colorClass}`}>
                    <span className="font-mono text-xs">{formatCLP(margin)}</span>
                    <span className="font-bold text-xs bg-slate-100 px-1 rounded">
                        {formatPercent(marginPct)}
                    </span>
                </div>
            </div>
        );
    };

    return (
        <div className="flex h-screen bg-slate-100">
            <Sidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 rounded-lg">
                            <Percent className="h-6 w-6 text-indigo-600" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">Análisis de Márgenes</h1>
                            <p className="text-xs text-slate-500">Comparativa de costos vs listas de precios (89, 652, 386)</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="bg-slate-50 rounded-lg p-1 flex items-center border border-slate-200 gap-1">
                            <button
                                onClick={() => setPeriodMode("preset")}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${periodMode === "preset" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                            >
                                Predefinido
                            </button>
                            <button
                                onClick={() => setPeriodMode("custom")}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${periodMode === "custom" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                            >
                                Específico
                            </button>
                        </div>

                        {periodMode === "preset" ? (
                            <select
                                value={meses}
                                onChange={(e) => { setMeses(Number(e.target.value)); setCurrentPage(1); }}
                                className="px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 font-medium text-slate-700 cursor-pointer"
                            >
                                <option value={1}>Mes Actual</option>
                                <option value={3}>Últimos 3 meses</option>
                                <option value={6}>Últimos 6 meses</option>
                                <option value={12}>Último año</option>
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
                    {/* Filters */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4">
                        <div className="flex flex-wrap gap-4 items-center">
                            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                                <Search className="h-4 w-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={busqueda}
                                    onChange={(e) => { setBusqueda(e.target.value); setCurrentPage(1); }}
                                    placeholder="Buscar por SKU, Nombre..."
                                    className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <input
                                type="text"
                                value={familia}
                                onChange={(e) => setFamilia(e.target.value)}
                                placeholder="Familia"
                                className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-32"
                            />
                            <input
                                type="text"
                                value={proveedor}
                                onChange={(e) => setProveedor(e.target.value)}
                                placeholder="Proveedor"
                                className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-40"
                            />

                            <select
                                value={costoFilter}
                                onChange={(e) => { setCostoFilter(e.target.value as any); setCurrentPage(1); }}
                                className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                            >
                                <option value="all">Todos los Costos</option>
                                <option value="with_cost">Con Precio Compra</option>
                                <option value="without_cost">Sin Precio Compra</option>
                            </select>
                        </div>
                    </div>

                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        pageSize={pageSize}
                        totalItems={totalItems}
                        onPageChange={setCurrentPage}
                        onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
                        className="mb-4"
                    />

                    {/* Table */}
                    {isLoading ? (
                        <div className="flex justify-center p-12">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                                        <tr>
                                            <th className="px-4 py-3 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                                <div className="flex items-center gap-1">SKU <SortButton column="sku" currentSort={currentSort} onSort={handleSort} /></div>
                                            </th>
                                            <th className="px-4 py-3 max-w-[200px]">
                                                <div className="flex items-center gap-1">Descripción <SortButton column="descripcion" currentSort={currentSort} onSort={handleSort} /></div>
                                            </th>
                                            <th className="px-4 py-3">
                                                <div className="flex items-center gap-1">Proveedor <SortButton column="proveedor" currentSort={currentSort} onSort={handleSort} /></div>
                                            </th>
                                            <th className="px-4 py-3 text-right text-indigo-700 bg-indigo-50/30">
                                                <div className="flex justify-end gap-1">Costo Última Compra <SortButton column="costo" currentSort={currentSort} onSort={handleSort} /></div>
                                            </th>

                                            {/* List 89 */}
                                            <th className="px-4 py-3 text-center border-l border-slate-200 bg-slate-50/50">
                                                <div className="flex flex-col items-center">
                                                    <span className="text-xs text-slate-400">Mayorista</span>
                                                    <div className="flex items-center gap-1 font-bold">Lista 89 <SortButton column="precio_89" currentSort={currentSort} onSort={handleSort} /></div>
                                                </div>
                                            </th>

                                            {/* List 652 */}
                                            <th className="px-4 py-3 text-center border-l border-slate-200 bg-slate-50/50">
                                                <div className="flex flex-col items-center">
                                                    <span className="text-xs text-slate-400">Ecommerce</span>
                                                    <div className="flex items-center gap-1 font-bold">Lista 652 <SortButton column="precio_652" currentSort={currentSort} onSort={handleSort} /></div>
                                                </div>
                                            </th>

                                            {/* List 386 */}
                                            <th className="px-4 py-3 text-center border-l border-slate-200 bg-slate-50/50">
                                                <div className="flex flex-col items-center">
                                                    <span className="text-xs text-slate-400">Merc. Libre</span>
                                                    <div className="flex items-center gap-1 font-bold">Lista 386 <SortButton column="precio_386" currentSort={currentSort} onSort={handleSort} /></div>
                                                </div>
                                            </th>

                                            {/* Sales Context */}
                                            <th className="px-4 py-3 text-right border-l border-slate-200">
                                                <div className="flex justify-end gap-1">Ventas <SortButton column="ventas_monto" currentSort={currentSort} onSort={handleSort} /></div>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {paginatedData.map((p) => (
                                            <tr key={p.id} className="hover:bg-slate-50 group transition-colors">
                                                <td className="px-4 py-3 font-medium text-slate-900 sticky left-0 bg-white group-hover:bg-slate-50 border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                                    {p.sku}
                                                    <div className="text-[10px] text-slate-400 font-normal">{p.familia}</div>
                                                </td>
                                                <td className="px-4 py-3 text-slate-600 truncate max-w-[200px]" title={p.descripcion}>
                                                    {p.descripcion}
                                                </td>
                                                <td className="px-4 py-3 text-slate-600 text-xs truncate max-w-[150px]" title={p.proveedor}>
                                                    {p.proveedor}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono font-medium text-indigo-700 bg-indigo-50/10">
                                                    {p.costo ? formatCLP(p.costo) : <span className="text-red-300 text-xs">Sin Costo</span>}
                                                </td>

                                                {/* 89 */}
                                                <td className="px-4 py-3 text-right border-l border-slate-100">
                                                    {renderMarginCell(p.precio_89, p.costo)}
                                                </td>

                                                {/* 652 */}
                                                <td className="px-4 py-3 text-right border-l border-slate-100">
                                                    {renderMarginCell(p.precio_652, p.costo)}
                                                </td>

                                                {/* 386 */}
                                                <td className="px-4 py-3 text-right border-l border-slate-100">
                                                    {renderMarginCell(p.precio_386, p.costo)}
                                                </td>

                                                <td className="px-4 py-3 text-right border-l border-slate-100">
                                                    <div className="flex flex-col">
                                                        <span className="font-mono text-slate-700">{formatCLP(p.ventas_monto)}</span>
                                                        <span className="text-xs text-slate-400">{p.ventas_cantidad} un.</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
