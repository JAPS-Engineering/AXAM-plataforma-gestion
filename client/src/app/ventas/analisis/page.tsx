"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchVentasDashboard } from "@/lib/api";
import { Sidebar } from "@/components/sidebar";
import { KPICard } from "@/components/kpi-card";
import { Pagination } from "@/components/pagination";
import { useState, useMemo } from "react";
import {
    DollarSign,
    TrendingUp,
    Package,
    Calendar,
    BarChart3,
    ArrowUp,
    ArrowDown,
    Minus,
    ChevronUp,
    ChevronDown,
    ChevronsUpDown
} from "lucide-react";
import { FiltersBar } from "@/components/filters-bar";
import { ClassificationBadge, TrendBadge, CoverageBadge } from "@/components/ranking-badges";
import { cn } from "@/lib/utils";

// Formateador de moneda CLP
const formatCLP = (amount: number) => {
    return new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: "CLP",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
};

const getMonthDifference = (start: string, end: string) => {
    const [sY, sM] = start.split('-').map(Number);
    const [eY, eM] = end.split('-').map(Number);
    return (eY - sY) * 12 + (eM - sM) + 1;
};

const getCurrentMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const getPastMonth = (monthsAgo: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() - monthsAgo);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function AnalisisVentasPage() {
    // Filtros state
    const [marca, setMarca] = useState("");

    // State del Periodo
    const [periodMode, setPeriodMode] = useState<"preset" | "custom">("preset");
    const [meses, setMeses] = useState(6);
    const [customRange, setCustomRange] = useState({
        start: getPastMonth(6),
        end: getCurrentMonth()
    });

    const [busqueda, setBusqueda] = useState("");

    const [salesStatus, setSalesStatus] = useState<'all' | 'with_sales' | 'without_sales'>('with_sales');

    // Computed effective months for KPIs and averages
    const effectiveMeses = useMemo(() => {
        if (periodMode === "preset") return meses;
        return getMonthDifference(customRange.start, customRange.end);
    }, [periodMode, meses, customRange]);

    // Sorting state
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>({ key: "total", direction: "desc" });

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // Data fetching
    const apiParams = useMemo(() => {
        if (periodMode === "preset") {
            return { meses, marca };
        } else {
            return { start: customRange.start, end: customRange.end, marca };
        }
    }, [periodMode, meses, customRange, marca]);

    const { data, isLoading, error } = useQuery({
        queryKey: ["ventas-analytics", apiParams, marca],
        queryFn: () => fetchVentasDashboard(apiParams, marca || undefined),
    });

    // Filtrado local y Ranking
    const { productosFiltered, absoluteTopSKU } = useMemo(() => {
        if (!data?.productos) return { productosFiltered: [], absoluteTopSKU: "N/A" };

        let result = data.productos;

        // Search filter
        if (busqueda.trim()) {
            const term = busqueda.toLowerCase();
            result = result.filter((p) => {
                const sku = p.producto.sku.toLowerCase();
                const desc = p.producto.descripcion.toLowerCase();
                const fam = (p.producto.familia || "").toLowerCase();
                return sku.includes(term) || desc.includes(term) || fam.includes(term);
            });
        }

        // Unified sales filter logic
        if (salesStatus === 'with_sales') {
            result = result.filter((p) => (p.totalMonto || 0) > 0);
        } else if (salesStatus === 'without_sales') {
            result = result.filter((p) => (p.totalMonto || 0) === 0);
        }

        // 1. Calculate TOP SKU from the filtered list BEFORE sorting by table column
        const sortedByMonto = [...result].sort((a, b) => b.totalMonto - a.totalMonto);
        const topSKU = sortedByMonto[0]?.producto.sku || "N/A";

        // 1.1 Calcular métricas adicionales (ABC, Tendencia, Cobertura)
        const grandTotal = result.reduce((sum, item) => sum + item.totalMonto, 0);

        // Sort by Total Descending for ABC calculation (must be done on the full result set first)
        const abcSorted = [...result].sort((a, b) => b.totalMonto - a.totalMonto);
        let accumulated = 0;
        const abcMap = new Map<number, "A" | "B" | "C">();

        abcSorted.forEach((item) => {
            accumulated += item.totalMonto;
            const percentage = grandTotal > 0 ? (accumulated / grandTotal) * 100 : 0;
            if (percentage <= 80) abcMap.set(item.producto.id, "A");
            else if (percentage <= 95) abcMap.set(item.producto.id, "B");
            else abcMap.set(item.producto.id, "C");
        });

        // 2. Enhance items with new metrics
        let enrichedResult = result.map((item) => {
            // Fix Trend Calculation: If last month is current month (incomplete), use previous month
            const currentMonthKey = getCurrentMonth(); // "YYYY-MM"
            const lastMonthData = item.ventasMeses[item.ventasMeses.length - 1];

            let compareSale = lastMonthData?.montoNeto || 0;

            if (lastMonthData) {
                const key = `${lastMonthData.ano}-${String(lastMonthData.mes).padStart(2, '0')}`;
                if (key === currentMonthKey && item.ventasMeses.length > 1) {
                    compareSale = item.ventasMeses[item.ventasMeses.length - 2].montoNeto || 0;
                }
            }

            const lastMonthSale = compareSale;
            const avgSale = item.promedioMonto || 0;
            const trend = avgSale > 0 ? ((lastMonthSale - avgSale) / avgSale) * 100 : 0;

            const totalUnits = item.ventasMeses.reduce((sum, m) => sum + (m.cantidad || 0), 0);
            const avgUnits = effectiveMeses > 0 ? totalUnits / effectiveMeses : 0;
            const currentStock = item.mesActual?.stockActual || 0;
            const coverage = avgUnits > 0 ? currentStock / avgUnits : 0;

            return {
                ...item,
                share: grandTotal > 0 ? (item.totalMonto / grandTotal) * 100 : 0,
                abcClass: abcMap.get(item.producto.id) || "C",
                trend,
                coverage
            };
        });

        // 3. Apply Sorting
        if (sortConfig) {
            enrichedResult.sort((a, b) => {
                let aValue: any;
                let bValue: any;

                switch (sortConfig.key) {
                    case "familia":
                        aValue = (a.producto.familia || "").toLowerCase();
                        bValue = (b.producto.familia || "").toLowerCase();
                        break;
                    case "sku":
                        aValue = a.producto.sku.toLowerCase();
                        bValue = b.producto.sku.toLowerCase();
                        break;
                    case "descripcion":
                        aValue = a.producto.descripcion.toLowerCase();
                        bValue = b.producto.descripcion.toLowerCase();
                        break;
                    case "total":
                        aValue = a.totalMonto;
                        bValue = b.totalMonto;
                        break;
                    case "promedio":
                        aValue = a.promedioMonto;
                        bValue = b.promedioMonto;
                        break;
                    case "abc":
                        aValue = a.abcClass;
                        bValue = b.abcClass;
                        break;
                    case "trend":
                        aValue = a.trend;
                        bValue = b.trend;
                        break;
                    case "coverage":
                        aValue = a.coverage;
                        bValue = b.coverage;
                        break;
                    default:
                        aValue = 0; bValue = 0;
                }

                if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
                return 0;
            });
        } else {
            enrichedResult.sort((a, b) => b.totalMonto - a.totalMonto);
        }

        // 4. Add Rank (after sort)
        const finalResult = enrichedResult.map((item, index) => ({
            ...item,
            rank: index + 1
        }));

        return {
            productosFiltered: finalResult,
            absoluteTopSKU: topSKU
        };
    }, [data?.productos, busqueda, salesStatus, sortConfig, effectiveMeses]);

    const handleSort = (key: string) => {
        setSortConfig((current) => {
            if (current?.key === key) {
                if (current.direction === "asc") return { key, direction: "desc" };
                return null;
            }
            return { key, direction: "asc" };
        });
    };

    // Paginación
    const { paginatedProducts, totalPages } = useMemo(() => {
        const total = Math.ceil(productosFiltered.length / pageSize);
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;

        return {
            paginatedProducts: productosFiltered.slice(start, end),
            totalPages: total || 1,
        };
    }, [productosFiltered, currentPage, pageSize]);

    const handlePageSizeChange = (size: number) => {
        setPageSize(size);
        setCurrentPage(1);
    };

    const handleFilterChange = <T,>(setter: (v: T) => void) => (value: T) => {
        setter(value);
        setCurrentPage(1);
    };

    // KPIs calculados
    const kpis = useMemo(() => {
        if (!data?.meta) return { totalVentas: 0, promedioPeriodo: 0, topProducto: "N/A", productosConVentas: 0 };

        const grandTotal = productosFiltered.reduce((sum, item) => sum + item.totalMonto, 0);

        return {
            totalVentas: grandTotal,
            promedioPeriodo: effectiveMeses > 0 ? grandTotal / effectiveMeses : 0,
            topProducto: absoluteTopSKU,
            productosConVentas: productosFiltered.filter(p => p.totalMonto > 0).length
        };
    }, [data, productosFiltered, effectiveMeses, absoluteTopSKU]);

    return (
        <div className="flex h-screen bg-slate-100">
            <Sidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 rounded-lg">
                            <BarChart3 className="h-6 w-6 text-purple-600" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">Ranking de Productos</h1>
                            <p className="text-xs text-slate-500">Analítica detallada y desempeño por SKU</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="bg-slate-50 rounded-lg p-1 flex items-center border border-slate-200 gap-1">
                            {/* Toggle Mode */}
                            <button
                                onClick={() => setPeriodMode("preset")}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${periodMode === "preset" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                            >
                                Períodos
                            </button>
                            <button
                                onClick={() => setPeriodMode("custom")}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${periodMode === "custom" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                            >
                                Personalizado
                            </button>
                        </div>

                        {periodMode === "preset" ? (
                            <div className="bg-slate-50 rounded-lg p-1 flex items-center border border-slate-200 ml-2">
                                <span className="text-xs font-semibold px-2 text-slate-500">Meses:</span>
                                <select
                                    value={meses}
                                    onChange={(e) => setMeses(Number(e.target.value))}
                                    className="px-2 py-1 text-sm bg-transparent border-none focus:outline-none focus:ring-0 text-slate-700 font-medium cursor-pointer"
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
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 ml-2">
                                <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1">
                                    <span className="text-[10px] uppercase font-bold text-slate-400 mr-2">Desde</span>
                                    <input
                                        type="month"
                                        value={customRange.start}
                                        onChange={(e) => setCustomRange(prev => ({ ...prev, start: e.target.value }))}
                                        className="text-sm font-medium text-slate-700 focus:outline-none bg-transparent"
                                    />
                                </div>
                                <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1">
                                    <span className="text-[10px] uppercase font-bold text-slate-400 mr-2">Hasta</span>
                                    <input
                                        type="month"
                                        value={customRange.end}
                                        onChange={(e) => setCustomRange(prev => ({ ...prev, end: e.target.value }))}
                                        className="text-sm font-medium text-slate-700 focus:outline-none bg-transparent"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </header>

                <main className="flex-1 overflow-auto p-6">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <KPICard
                            title={`Ventas Totales (${effectiveMeses} meses)`}
                            value={formatCLP(kpis.totalVentas)}
                            icon={DollarSign}
                        />
                        <KPICard
                            title="Promedio Mensual"
                            value={formatCLP(kpis.promedioPeriodo)}
                            icon={Calendar}
                        />
                        <KPICard
                            title="SKUs con Movimiento"
                            value={kpis.productosConVentas || 0}
                            icon={Package}
                        />
                        <KPICard
                            title={`Top SKU Período (${effectiveMeses}m)`}
                            value={kpis.topProducto}
                            icon={TrendingUp}
                        />
                    </div>

                    {/* Filters */}
                    <FiltersBar
                        marca={marca}
                        onMarcaChange={handleFilterChange(setMarca)}
                        meses={effectiveMeses}
                        onMesesChange={() => { }}
                        hidePeriodSelector={true}
                        busqueda={busqueda}
                        onBusquedaChange={handleFilterChange(setBusqueda)}

                        salesStatus={salesStatus}
                        onSalesStatusChange={handleFilterChange(setSalesStatus)}
                        estadosSeleccionados={[]}
                        onEstadosChange={() => { }}
                        totalProductos={data?.meta.totalProductos || 0}
                        productosVisibles={productosFiltered.length}
                        className="mb-4"
                        hideStockStatus={true}
                    />

                    {/* Pagination - Top */}
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        pageSize={pageSize}
                        totalItems={productosFiltered.length}
                        onPageChange={setCurrentPage}
                        onPageSizeChange={handlePageSizeChange}
                        className="mb-4"
                    />

                    {/* Ranking Table */}
                    {isLoading ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
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
                                            <th className="px-4 py-3 sticky left-0 bg-slate-50 z-10 w-16 text-center">#</th>
                                            <th className="px-4 py-3 sticky left-16 bg-slate-50 z-10 w-40">
                                                <button
                                                    onClick={() => handleSort("familia")}
                                                    className="flex items-center gap-1 hover:text-slate-900 group"
                                                >
                                                    Familia
                                                    {sortConfig?.key === "familia" ? (
                                                        sortConfig.direction === "asc" ? <ChevronUp className="h-4 w-4 text-indigo-600" /> : <ChevronDown className="h-4 w-4 text-indigo-600" />
                                                    ) : (
                                                        <ChevronsUpDown className="h-4 w-4 text-slate-300 group-hover:text-slate-500" />
                                                    )}
                                                </button>
                                            </th>
                                            <th className="px-4 py-3 sticky left-56 bg-slate-50 z-10 w-32">
                                                <button
                                                    onClick={() => handleSort("sku")}
                                                    className="flex items-center gap-1 hover:text-slate-900 group"
                                                >
                                                    SKU
                                                    {sortConfig?.key === "sku" ? (
                                                        sortConfig.direction === "asc" ? <ChevronUp className="h-4 w-4 text-indigo-600" /> : <ChevronDown className="h-4 w-4 text-indigo-600" />
                                                    ) : (
                                                        <ChevronsUpDown className="h-4 w-4 text-slate-300 group-hover:text-slate-500" />
                                                    )}
                                                </button>
                                            </th>
                                            <th className="px-4 py-3 w-64">
                                                <button
                                                    onClick={() => handleSort("descripcion")}
                                                    className="flex items-center gap-1 hover:text-slate-900 group"
                                                >
                                                    Descripción
                                                    {sortConfig?.key === "descripcion" ? (
                                                        sortConfig.direction === "asc" ? <ChevronUp className="h-4 w-4 text-indigo-600" /> : <ChevronDown className="h-4 w-4 text-indigo-600" />
                                                    ) : (
                                                        <ChevronsUpDown className="h-4 w-4 text-slate-300 group-hover:text-slate-500" />
                                                    )}
                                                </button>
                                            </th>

                                            {/* NEW METRICS COLUMNS */}
                                            <th className="px-4 py-3 text-center min-w-[100px]">
                                                <button
                                                    onClick={() => handleSort("abc")}
                                                    className="flex items-center justify-center gap-1 w-full hover:text-slate-900 group"
                                                >
                                                    Clasif.
                                                    {sortConfig?.key === "abc" ? (
                                                        sortConfig.direction === "asc" ? <ChevronUp className="h-4 w-4 text-indigo-600" /> : <ChevronDown className="h-4 w-4 text-indigo-600" />
                                                    ) : (
                                                        <ChevronsUpDown className="h-4 w-4 text-slate-300 group-hover:text-slate-500" />
                                                    )}
                                                </button>
                                            </th>
                                            <th className="px-4 py-3 text-center min-w-[120px]">
                                                <button
                                                    onClick={() => handleSort("trend")}
                                                    className="flex items-center justify-center gap-1 w-full hover:text-slate-900 group"
                                                >
                                                    Tendencia
                                                    {sortConfig?.key === "trend" ? (
                                                        sortConfig.direction === "asc" ? <ChevronUp className="h-4 w-4 text-indigo-600" /> : <ChevronDown className="h-4 w-4 text-indigo-600" />
                                                    ) : (
                                                        <ChevronsUpDown className="h-4 w-4 text-slate-300 group-hover:text-slate-500" />
                                                    )}
                                                </button>
                                            </th>
                                            <th className="px-4 py-3 text-center min-w-[100px]">
                                                <button
                                                    onClick={() => handleSort("coverage")}
                                                    className="flex items-center justify-center gap-1 w-full hover:text-slate-900 group"
                                                >
                                                    Cobertura
                                                    {sortConfig?.key === "coverage" ? (
                                                        sortConfig.direction === "asc" ? <ChevronUp className="h-4 w-4 text-indigo-600" /> : <ChevronDown className="h-4 w-4 text-indigo-600" />
                                                    ) : (
                                                        <ChevronsUpDown className="h-4 w-4 text-slate-300 group-hover:text-slate-500" />
                                                    )}
                                                </button>
                                            </th>
                                            <th className="px-4 py-3 text-right font-bold text-slate-800 bg-slate-100 min-w-[120px]">
                                                <button
                                                    onClick={() => handleSort("total")}
                                                    className="flex items-center justify-end gap-1 w-full hover:text-slate-900 group"
                                                >
                                                    Total
                                                    {sortConfig?.key === "total" ? (
                                                        sortConfig.direction === "asc" ? <ChevronUp className="h-4 w-4 text-indigo-600" /> : <ChevronDown className="h-4 w-4 text-indigo-600" />
                                                    ) : (
                                                        <ChevronsUpDown className="h-4 w-4 text-slate-300 group-hover:text-slate-500" />
                                                    )}
                                                </button>
                                            </th>
                                            <th className="px-4 py-3 text-right font-bold text-indigo-700 bg-indigo-50 min-w-[120px]">
                                                <button
                                                    onClick={() => handleSort("promedio")}
                                                    className="flex items-center justify-end gap-1 w-full hover:text-indigo-900 group"
                                                >
                                                    Promedio
                                                    {sortConfig?.key === "promedio" ? (
                                                        sortConfig.direction === "asc" ? <ChevronUp className="h-4 w-4 text-indigo-600" /> : <ChevronDown className="h-4 w-4 text-indigo-600" />
                                                    ) : (
                                                        <ChevronsUpDown className="h-4 w-4 text-slate-300 group-hover:text-slate-500" />
                                                    )}
                                                </button>
                                            </th>
                                            <th className="px-4 py-3 text-right font-bold text-slate-600 bg-slate-50 min-w-[100px]">
                                                % Part.
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {paginatedProducts.map((row) => (
                                            <tr key={row.producto.id} className="hover:bg-slate-50 transition-colors group">
                                                <td className="px-4 py-3 text-center font-bold text-slate-400 group-hover:text-purple-600">
                                                    {row.rank}
                                                </td>
                                                <td className="px-4 py-3 text-slate-500">
                                                    {row.producto.familia || "-"}
                                                </td>
                                                <td className="px-4 py-3 font-medium text-slate-900">
                                                    {row.producto.sku}
                                                </td>
                                                <td className="px-4 py-3 text-slate-500 truncate max-w-[200px]" title={row.producto.descripcion}>
                                                    {row.producto.descripcion}
                                                </td>

                                                {/* METRICS BODY */}
                                                <td className="px-4 py-3 text-center">
                                                    <ClassificationBadge classification={row.abcClass} />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex justify-center">
                                                        <TrendBadge value={row.trend} />
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <CoverageBadge value={row.coverage} />
                                                </td>
                                                <td className="px-4 py-3 text-right font-bold text-slate-900 bg-slate-50">
                                                    {formatCLP(row.totalMonto)}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-purple-700 bg-purple-50/30">
                                                    {formatCLP(row.promedioMonto)}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <span className="text-xs">{row.share.toFixed(1)}%</span>
                                                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full bg-purple-500 rounded-full"
                                                                style={{ width: `${Math.min(row.share * 5, 100)}%` }} // Escala visual exagerada para ver diferencias pequeñas
                                                            ></div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && !error && productosFiltered.length > 0 && (
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            pageSize={pageSize}
                            totalItems={productosFiltered.length}
                            onPageChange={setCurrentPage}
                            onPageSizeChange={handlePageSizeChange}
                            className="mt-4"
                        />
                    )}
                </main>
            </div>
        </div>
    );
}
