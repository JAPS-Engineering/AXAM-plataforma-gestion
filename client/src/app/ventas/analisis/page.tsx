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
    Minus
} from "lucide-react";
import { FiltersBar } from "@/components/filters-bar";

// Formateador de moneda CLP
const formatCLP = (amount: number) => {
    return new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: "CLP",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
};

export default function AnalisisVentasPage() {
    // Filtros state
    const [marca, setMarca] = useState("");
    const [meses, setMeses] = useState(6);
    const [busqueda, setBusqueda] = useState("");
    const [ocultarCero, setOcultarCero] = useState(true);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);

    // Data fetching
    const { data, isLoading, error } = useQuery({
        queryKey: ["ventas-analytics", meses, marca],
        queryFn: () => fetchVentasDashboard(meses, marca || undefined),
    });

    // Filtrado local y Ranking
    const { productosFiltered, rankingData } = useMemo(() => {
        if (!data?.productos) return { productosFiltered: [], rankingData: [] };

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

        // Hide zero amount
        if (ocultarCero) {
            result = result.filter((p) => p.totalMonto > 0);
        }

        // Ordenar por Monto Total Descendente (Ranking)
        result.sort((a, b) => b.totalMonto - a.totalMonto);

        // Calcular % del total
        const grandTotal = result.reduce((sum, item) => sum + item.totalMonto, 0);

        const enrichedResult = result.map((item, index) => ({
            ...item,
            rank: index + 1,
            share: grandTotal > 0 ? (item.totalMonto / grandTotal) * 100 : 0
        }));

        return {
            productosFiltered: enrichedResult,
            rankingData: enrichedResult
        };
    }, [data?.productos, busqueda, ocultarCero]);

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
        if (!data?.meta) return { totalVentas: 0, promedioPeriodo: 0, topProducto: "N/A" };

        const grandTotal = productosFiltered.reduce((sum, item) => sum + item.totalMonto, 0);

        return {
            totalVentas: grandTotal,
            promedioPeriodo: grandTotal / meses,
            topProducto: productosFiltered[0]?.producto.sku || "N/A"
        };
    }, [data, productosFiltered, meses]);

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
                            <h1 className="text-xl font-bold text-slate-900">Analítica Detallada</h1>
                            <p className="text-xs text-slate-500">Ranking y Desempeño por SKU</p>
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-auto p-6">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <KPICard
                            title={`Ventas Totales (${meses} meses)`}
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
                            value={productosFiltered.length}
                            icon={Package}
                        />
                        <KPICard
                            title="Top SKU (Ingresos)"
                            value={kpis.topProducto}
                            icon={TrendingUp}
                        />
                    </div>

                    {/* Filters */}
                    <FiltersBar
                        marca={marca}
                        onMarcaChange={handleFilterChange(setMarca)}
                        meses={meses}
                        onMesesChange={handleFilterChange(setMeses)}
                        busqueda={busqueda}
                        onBusquedaChange={handleFilterChange(setBusqueda)}
                        ocultarCero={ocultarCero}
                        onOcultarCeroChange={handleFilterChange(setOcultarCero)}
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
                                            <th className="px-4 py-3 w-16 text-center">#</th>
                                            <th className="px-4 py-3">Producto</th>
                                            <th className="px-4 py-3 text-right">Total ({meses} m)</th>
                                            <th className="px-4 py-3 text-right">Promedio/Mes</th>
                                            <th className="px-4 py-3 text-right">% Part.</th>
                                            {data?.meta.columnas.slice(0, 3).map((col, idx) => (
                                                <th key={idx} className="px-4 py-3 text-right text-xs uppercase tracking-wider text-slate-400">
                                                    {col}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {paginatedProducts.map((row) => (
                                            <tr key={row.producto.id} className="hover:bg-slate-50 transition-colors group">
                                                <td className="px-4 py-3 text-center font-bold text-slate-400 group-hover:text-purple-600">
                                                    {row.rank}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div>
                                                        <div className="font-medium text-slate-900">{row.producto.sku}</div>
                                                        <div className="text-xs text-slate-500 truncate max-w-[200px]" title={row.producto.descripcion}>
                                                            {row.producto.descripcion}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right font-bold text-slate-800">
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
                                                {row.ventasMeses.slice(0, 3).map((venta, idx) => (
                                                    <td key={idx} className="px-4 py-3 text-right text-slate-500 text-xs">
                                                        {venta.montoNeto > 0 ? (
                                                            formatCLP(venta.montoNeto)
                                                        ) : (
                                                            "-"
                                                        )}
                                                    </td>
                                                ))}
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
