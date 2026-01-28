"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchVentasDashboard } from "@/lib/api";
import { Sidebar } from "@/components/sidebar";
import { KPICard } from "@/components/kpi-card";
import { Pagination } from "@/components/pagination";
import { useState, useMemo } from "react";
import { DollarSign, TrendingUp, Package, Calendar } from "lucide-react";
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

export default function VentasPage() {
    // Filtros state
    const [marca, setMarca] = useState("");
    const [meses, setMeses] = useState(3);
    const [busqueda, setBusqueda] = useState("");
    const [ocultarCero, setOcultarCero] = useState(true);
    const [salesStatus, setSalesStatus] = useState<'all' | 'with_sales' | 'without_sales'>('all');

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);

    // Data fetching
    const { data, isLoading, error, refetch, isFetching } = useQuery({
        queryKey: ["ventas-dashboard", meses, marca],
        queryFn: () => fetchVentasDashboard(meses, marca || undefined),
    });

    // Filtrado local
    const productosFiltered = useMemo(() => {
        if (!data?.productos) return [];

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
        if (salesStatus === 'with_sales' || ocultarCero) {
            result = result.filter((p) => (p.totalMonto || 0) > 0);
        } else if (salesStatus === 'without_sales') {
            result = result.filter((p) => (p.totalMonto || 0) === 0);
        }

        return result;
    }, [data?.productos, busqueda, ocultarCero, salesStatus]);

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
            topProducto: topProd.nombre
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
                            <h1 className="text-xl font-bold text-slate-900">Análisis de Ingresos</h1>
                            <p className="text-xs text-slate-500">Visualización de montos netos en CLP</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {lastUpdate && (
                            <span className="text-xs text-slate-400">
                                Actualizado: {lastUpdate}
                            </span>
                        )}
                        <div className="h-8 w-px bg-slate-200 mx-2"></div>
                        <a
                            href="/ventas/graficos"
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
                        >
                            <TrendingUp className="h-4 w-4" />
                            Ver Gráficos
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
                            value={data?.meta.totalProductos || 0}
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
                        meses={meses}
                        onMesesChange={handleFilterChange(setMeses)}
                        busqueda={busqueda}
                        onBusquedaChange={handleFilterChange(setBusqueda)}
                        ocultarCero={ocultarCero}
                        onOcultarCeroChange={handleFilterChange(setOcultarCero)}
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
                                            <th className="px-4 py-3 sticky left-0 bg-slate-50 z-10 w-64">Producto</th>
                                            {data?.meta.columnas.map((col, idx) => (
                                                <th key={idx} className="px-4 py-3 text-right whitespace-nowrap min-w-[120px]">
                                                    {col}
                                                </th>
                                            ))}
                                            <th className="px-4 py-3 text-right font-bold text-slate-800 bg-slate-100 min-w-[120px]">
                                                Total
                                            </th>
                                            <th className="px-4 py-3 text-right font-bold text-indigo-700 bg-indigo-50 min-w-[120px]">
                                                Promedio
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
