"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchVentasDashboard } from "@/lib/api";
import { Sidebar } from "@/components/sidebar";
import { KPICard } from "@/components/kpi-card";
import { Pagination } from "@/components/pagination";
import { useState, useMemo } from "react";
import { DollarSign, TrendingUp, Package, Calendar, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
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

const getCurrentMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const getPastMonth = (monthsAgo: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() - monthsAgo);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function VentasPage() {
    // Filtros state
    // Filtros state
    const [marca, setMarca] = useState("");

    // State del Periodo
    const [periodMode, setPeriodMode] = useState<"preset" | "custom">("preset");
    const [meses, setMeses] = useState(3);
    const [customRange, setCustomRange] = useState({
        start: getPastMonth(3),
        end: getCurrentMonth()
    });

    const [busqueda, setBusqueda] = useState("");

    const [salesStatus, setSalesStatus] = useState<'all' | 'with_sales' | 'without_sales'>('with_sales');

    // Sorting state
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>({ key: "total", direction: "desc" });

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // Data fetching
    // Params computados para la API
    const apiParams = useMemo(() => {
        if (periodMode === "preset") {
            return { meses };
        } else {
            return { start: customRange.start, end: customRange.end };
        }
    }, [periodMode, meses, customRange]);

    // Data fetching
    const { data, isLoading, error, refetch, isFetching } = useQuery({
        queryKey: ["ventas-dashboard", apiParams, marca],
        queryFn: () => fetchVentasDashboard(apiParams, marca || undefined),
    });

    // Filtrado local
    const productosFiltered = useMemo(() => {
        if (!data?.productos) return [];

        let result = [...data.productos];

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

        // Sorting
        if (sortConfig) {
            result.sort((a, b) => {
                let aValue: any;
                let bValue: any;

                if (sortConfig.key === "producto") {
                    aValue = a.producto.sku;
                    bValue = b.producto.sku;
                } else if (sortConfig.key === "total") {
                    aValue = a.totalMonto;
                    bValue = b.totalMonto;
                } else if (sortConfig.key === "promedio") {
                    aValue = a.promedioMonto;
                    bValue = b.promedioMonto;
                } else if (sortConfig.key.startsWith("mes-")) {
                    const index = parseInt(sortConfig.key.split("-")[1]);
                    aValue = a.ventasMeses[index]?.montoNeto || 0;
                    bValue = b.ventasMeses[index]?.montoNeto || 0;
                }

                if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [data?.productos, busqueda, salesStatus, sortConfig]);

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

    // Handle pagination changes
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

        // Encontrar producto con mayores ventas en el período filtrado actual
        let topProd = { monto: 0, nombre: "N/A" };
        if (productosFiltered.length > 0) {
            const top = [...productosFiltered].sort((a, b) => b.totalMonto - a.totalMonto)[0];
            if (top) {
                topProd = { monto: top.totalMonto, nombre: top.producto.sku };
            }
        }

        return {
            totalVentas: data.meta.totalMontoPeriodo,
            promedioPeriodo: data.meta.promedioMontoPeriodo,
            topProducto: topProd.nombre,
            // Calc active products locally since meta.totalProductos is now the Universe size
            productosConVentas: data.productos.filter(p => p.totalMonto > 0).length
        };
    }, [data, productosFiltered]);

    const lastUpdate = data?.meta?.generadoEn
        ? new Date(data.meta.generadoEn).toLocaleTimeString("es-CL")
        : undefined;

    return (
        <div className="flex h-screen bg-slate-100">
            <Sidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header simplificado */}
                <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                            <DollarSign className="h-6 w-6 text-blue-600" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">Reporte de Ingresos</h1>
                            <p className="text-xs text-slate-500">Visualización de montos netos en CLP</p>
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

                        <div className="h-8 w-px bg-slate-200 mx-2"></div>
                        <a
                            href="/ventas/graficos"
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
                        >
                            <TrendingUp className="h-4 w-4" />
                            Ver Análisis de Mercado
                        </a>
                    </div>
                </header>

                <main className="flex-1 overflow-auto p-6">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <KPICard
                            title={`Ventas Totales (${data?.meta.mesesConsultados || meses} meses)`}
                            value={formatCLP(kpis.totalVentas)}
                            icon={DollarSign}
                            trend="neutral"
                        />
                        <KPICard
                            title="Promedio Mensual"
                            value={formatCLP(kpis.promedioPeriodo)}
                            subtitle="Promedio del período seleccionado"
                            icon={Calendar}
                        />
                        <KPICard
                            title="Productos con Ventas"
                            value={kpis.productosConVentas || 0}
                            icon={Package}
                        />
                        <KPICard
                            title="Top Producto (Ingresos)"
                            value={kpis.topProducto}
                            subtitle="Mayor venta en el período"
                            icon={TrendingUp}
                        />
                    </div>

                    {/* Filters */}
                    <FiltersBar
                        marca={marca}
                        onMarcaChange={handleFilterChange(setMarca)}
                        // Meses ahora se maneja arriba en el header custom
                        meses={meses}
                        onMesesChange={() => { }}
                        hidePeriodSelector={true} // Deshabilitado aqui para usar el header custom si se desea, o lo mantengo? Usuario pidio "agregar que el periodo sea seleccionable... con los mismos estilos"
                        // Voy a ocultar el selector de meses de la barra de filtros si colisiona con el header custom,
                        // Pero la barra de filtros es generica.
                        // La peticion dice "nos pida de la misma forma seleccionar fecha desde hasta con los mismos estilos".
                        // En Graficos page el selector esta en el Header.
                        // Asi que voy a poner el selector en el Header y posiblemente quitarlo de la FiltersBar o ignorarlo.
                        // Sin embargo, FiltersBar tiene el selector de meses integrado.
                        // Si el usuario quiere "los mismos estilos" que en graficos, debe estar en el header.
                        // Dejare el selector de FiltersBar como 'controlled' pero quizas deba quitarlo de FiltersBar para esta vista si choca.
                        // Por ahora pasare meses pero su control esta duplicado, mejor lo ignoramos visualmente si ponemos el del header?
                        // El usuario quiere "agregar... tal como lo hacemos en analisis de mercado".
                        // En analisis de mercado (graficos) NO se usa FiltersBar.
                        // Aqui usare el estilo de graficos en el header y dejare FiltersBar para marca/busqueda.
                        busqueda={busqueda}
                        onBusquedaChange={handleFilterChange(setBusqueda)}

                        salesStatus={salesStatus}
                        onSalesStatusChange={handleFilterChange(setSalesStatus)}
                        estadosSeleccionados={[]}
                        onEstadosChange={() => { }} // No usado aquí
                        totalProductos={data?.meta.totalProductos || 0}
                        productosVisibles={productosFiltered.length}
                        className="mb-4"
                        hideStockStatus={true} // Nuevo prop que deberíamos agregar a FiltersBar si queremos ocultar el filtro de estados
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

                    {/* Table */}
                    {isLoading ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                        </div>
                    ) : error ? (
                        <div className="flex items-center justify-center h-64 text-red-600">
                            Error al cargar datos: {(error as Error).message}
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                                        <tr>
                                            <th className="px-4 py-3 sticky left-0 bg-slate-50 z-10 w-64">
                                                <button
                                                    onClick={() => handleSort("producto")}
                                                    className="flex items-center gap-1 hover:text-slate-900 group"
                                                >
                                                    Producto
                                                    {sortConfig?.key === "producto" ? (
                                                        sortConfig.direction === "asc" ? <ChevronUp className="h-4 w-4 text-indigo-600" /> : <ChevronDown className="h-4 w-4 text-indigo-600" />
                                                    ) : (
                                                        <ChevronsUpDown className="h-4 w-4 text-slate-300 group-hover:text-slate-500" />
                                                    )}
                                                </button>
                                            </th>
                                            {data?.meta.columnas.map((col, idx) => (
                                                <th key={idx} className="px-4 py-3 text-right whitespace-nowrap min-w-[120px]">
                                                    <button
                                                        onClick={() => handleSort(`mes-${idx}`)}
                                                        className="flex items-center justify-end gap-1 w-full hover:text-slate-900 group"
                                                    >
                                                        {col}
                                                        {sortConfig?.key === `mes-${idx}` ? (
                                                            sortConfig.direction === "asc" ? <ChevronUp className="h-4 w-4 text-indigo-600" /> : <ChevronDown className="h-4 w-4 text-indigo-600" />
                                                        ) : (
                                                            <ChevronsUpDown className="h-4 w-4 text-slate-300 group-hover:text-slate-500" />
                                                        )}
                                                    </button>
                                                </th>
                                            ))}
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
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {paginatedProducts.map((row) => (
                                            <tr key={row.producto.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3 sticky left-0 bg-white z-10 border-r border-slate-100">
                                                    <div>
                                                        <div className="font-medium text-slate-900">{row.producto.sku}</div>
                                                        <div className="text-xs text-slate-500 truncate max-w-[200px]" title={row.producto.descripcion}>
                                                            {row.producto.descripcion}
                                                        </div>
                                                    </div>
                                                </td>
                                                {row.ventasMeses.map((venta, idx) => (
                                                    <td key={idx} className="px-4 py-3 text-right font-mono text-slate-600">
                                                        {venta.montoNeto > 0 ? (
                                                            <span>{formatCLP(venta.montoNeto)}</span>
                                                        ) : (
                                                            <span className="text-slate-300">-</span>
                                                        )}
                                                        {venta.montoNeto > 0 && (
                                                            <div className="text-[10px] text-slate-400">
                                                                ({venta.cantidad} un.)
                                                            </div>
                                                        )}
                                                    </td>
                                                ))}
                                                <td className="px-4 py-3 text-right font-bold font-mono text-slate-900 bg-slate-50">
                                                    {formatCLP(row.totalMonto)}
                                                </td>
                                                <td className="px-4 py-3 text-right font-bold font-mono text-indigo-700 bg-indigo-50/50">
                                                    {formatCLP(row.promedioMonto)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Pagination - Bottom */}
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
