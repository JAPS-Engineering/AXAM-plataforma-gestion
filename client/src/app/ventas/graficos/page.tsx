"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchVentasResumen, fetchGraficosAvanzados } from "@/lib/api";
import { Sidebar } from "@/components/sidebar";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, ComposedChart
} from "recharts";
import { useState, useMemo, useEffect } from "react";
import { ChevronLeft, DollarSign, Activity, TrendingUp, PieChart as PieIcon, BarChart3, Calendar, Filter, CheckSquare, Square, X } from "lucide-react";
import Link from "next/link";
import { TargetsSection } from "@/components/targets-section";

// Formateadores
const formatCLP = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
    return `$${value}`;
};

const formatTooltipCLP = (value: number) => {
    return new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: "CLP",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value);
};

// Paleta para gráficos circulares
const PIE_COLORS = ['#4f46e5', '#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1', '#14b8a6'];

export default function GraficosVentasPage() {
    const [meses, setMeses] = useState(6); // Default 6 meses para gráficas resumen

    const { data, isLoading, error } = useQuery({
        queryKey: ["ventas-resumen", meses],
        queryFn: () => fetchVentasResumen(meses),
    });

    const { data: advancedData, isLoading: isLoadingAdv } = useQuery({
        queryKey: ["graficos-avanzados"],
        queryFn: fetchGraficosAvanzados,
    });

    const isLoadingAll = isLoading || isLoadingAdv;

    // --- Lógica de Filtros por Familia ---
    const [showFilterDropdown, setShowFilterDropdown] = useState(false);
    const allFamilies = useMemo(() => {
        if (!advancedData?.marketShare) return [];
        return advancedData.marketShare.map(m => m.name).sort();
    }, [advancedData]);

    const [selectedFamilies, setSelectedFamilies] = useState<string[]>([]);

    // Inicializar con todas las familias la primera vez que cargan los datos
    useEffect(() => {
        if (allFamilies.length > 0 && selectedFamilies.length === 0) {
            setSelectedFamilies(allFamilies);
        }
    }, [allFamilies]);

    const toggleFamily = (family: string) => {
        setSelectedFamilies(prev =>
            prev.includes(family)
                ? prev.filter(f => f !== family)
                : [...prev, family]
        );
    };

    const selectAll = () => setSelectedFamilies(allFamilies);
    const clearAll = () => setSelectedFamilies([]);

    // Datos filtrados para los gráficos
    const filteredMarketShare = useMemo(() => {
        if (!advancedData?.marketShare) return [];
        return advancedData.marketShare.filter(m => selectedFamilies.includes(m.name));
    }, [advancedData?.marketShare, selectedFamilies]);

    const filteredVentasPorFamilia = useMemo(() => {
        if (!advancedData?.ventasPorFamilia) return [];
        return advancedData.ventasPorFamilia.filter(f => selectedFamilies.includes(f.familia));
    }, [advancedData?.ventasPorFamilia, selectedFamilies]);

    const totalFiltrado = useMemo(() => {
        return filteredMarketShare.reduce((acc, curr) => acc + curr.value, 0);
    }, [filteredMarketShare]);

    return (
        <div className="flex h-screen bg-slate-100">
            <Sidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm z-10">
                    <div className="flex items-center gap-3">
                        <Link
                            href="/ventas"
                            className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </Link>
                        <div className="p-2 bg-indigo-100 rounded-lg">
                            <TrendingUp className="h-6 w-6 text-indigo-600" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">Gráficos y Objetivos</h1>
                            <p className="text-xs text-slate-500">Visualización de tendencias, market share y metas</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="bg-slate-50 rounded-lg p-1 flex items-center border border-slate-200">
                            <span className="text-xs font-semibold px-2 text-slate-500">Periodo:</span>
                            <select
                                value={meses}
                                onChange={(e) => setMeses(Number(e.target.value))}
                                className="px-2 py-1 text-sm bg-transparent border-none focus:outline-none focus:ring-0 text-slate-700 font-medium cursor-pointer"
                            >
                                <option value={3}>Últimos 3 meses</option>
                                <option value={6}>Últimos 6 meses</option>
                                <option value={12}>Últimos 12 meses</option>
                            </select>
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-auto p-6 scrollbar-thin scrollbar-thumb-slate-200">
                    {isLoadingAll ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                        </div>
                    ) : error ? (
                        <div className="flex items-center justify-center h-64 text-red-600">
                            Error al cargar datos: {(error as Error).message}
                        </div>
                    ) : (
                        <div className="space-y-6 pb-10">

                            {/* Seccion 0: Objetivos (Targets) - NUEVO */}
                            <TargetsSection />

                            {/* Seccion 1: Resumen General */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <DollarSign className="h-24 w-24 text-indigo-600 transform translate-x-4 -translate-y-4" />
                                    </div>
                                    <p className="text-sm font-medium text-slate-500 relative z-10">Ventas Totales (Periodo)</p>
                                    <h3 className="text-3xl font-bold text-slate-900 mt-2 relative z-10">
                                        {formatTooltipCLP(data?.kpis.totalMonto || 0)}
                                    </h3>
                                    <div className="mt-4 flex items-center gap-2 relative z-10">
                                        <div className="p-1.5 bg-green-100 rounded text-green-700">
                                            <TrendingUp className="h-4 w-4" />
                                        </div>
                                        <span className="text-sm text-slate-600">Periodo seleccionado</span>
                                    </div>
                                </div>

                                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <Activity className="h-24 w-24 text-blue-600 transform translate-x-4 -translate-y-4" />
                                    </div>
                                    <p className="text-sm font-medium text-slate-500 relative z-10">Promedio Mensual</p>
                                    <h3 className="text-3xl font-bold text-slate-900 mt-2 relative z-10">
                                        {formatTooltipCLP(data?.kpis.promedioMensual || 0)}
                                    </h3>
                                    <div className="mt-4 flex items-center gap-2 relative z-10">
                                        <span className={`px-2 py-0.5 rounded text-sm font-bold ${(data?.kpis.crecimiento || 0) >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {(data?.kpis.crecimiento || 0) > 0 ? '+' : ''}{(data?.kpis.crecimiento || 0).toFixed(1)}%
                                        </span>
                                        <span className="text-xs text-slate-500">vs promedio</span>
                                    </div>
                                </div>
                                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <PieIcon className="h-24 w-24 text-purple-600 transform translate-x-4 -translate-y-4" />
                                    </div>
                                    <p className="text-sm font-medium text-slate-500 relative z-10">Producto Estrella</p>
                                    <h3 className="text-lg font-bold text-slate-900 mt-2 truncate max-w-[90%] relative z-10" title={data?.kpis.topProducto?.producto.descripcion}>
                                        {data?.kpis.topProducto?.producto.sku || "N/A"}
                                    </h3>
                                    <p className="text-2xl font-semibold text-indigo-600 mt-1 relative z-10">
                                        {formatTooltipCLP(data?.kpis.topProducto?.totalMonto || 0)}
                                    </p>
                                </div>
                            </div>

                            {/* Seccion 2: Market Share & Top Familias */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Market Share Pie Chart */}
                                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative">
                                    <div className="flex items-center justify-between mb-6">
                                        <div>
                                            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                                <PieIcon className="h-5 w-5 text-indigo-500" />
                                                Market Share Interno
                                            </h3>
                                            <p className="text-xs text-slate-500">Participación por Familia de Proveedores ({advancedData?.meta.anoActual})</p>
                                        </div>

                                        <div className="flex items-center gap-2 relative">
                                            {selectedFamilies.length !== allFamilies.length && (
                                                <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-bold">
                                                    FILTRADO
                                                </span>
                                            )}

                                            <button
                                                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                                                className={`p-2 rounded-lg transition-colors ${showFilterDropdown ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-slate-100 text-slate-500'}`}
                                                title="Filtrar Familias"
                                            >
                                                <Filter className="h-5 w-5" />
                                            </button>

                                            {/* Dropdown de Filtros */}
                                            {showFilterDropdown && (
                                                <>
                                                    <div
                                                        className="fixed inset-0 z-20"
                                                        onClick={() => setShowFilterDropdown(false)}
                                                    />
                                                    <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 z-30 p-4 animate-in fade-in zoom-in duration-200 origin-top-right">
                                                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                                                            <span className="text-sm font-bold text-slate-900">Filtrar Familias</span>
                                                            <button onClick={() => setShowFilterDropdown(false)}>
                                                                <X className="h-4 w-4 text-slate-400 hover:text-slate-600" />
                                                            </button>
                                                        </div>

                                                        <div className="flex gap-2 mb-3">
                                                            <button
                                                                onClick={selectAll}
                                                                className="flex-1 text-[10px] font-bold py-1.5 bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 transition-colors"
                                                            >
                                                                Todas
                                                            </button>
                                                            <button
                                                                onClick={clearAll}
                                                                className="flex-1 text-[10px] font-bold py-1.5 bg-slate-50 text-slate-600 rounded-md hover:bg-slate-100 transition-colors"
                                                            >
                                                                Ninguna
                                                            </button>
                                                        </div>

                                                        <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200">
                                                            {allFamilies.map((family, idx) => {
                                                                const isSelected = selectedFamilies.includes(family);
                                                                return (
                                                                    <label
                                                                        key={idx}
                                                                        className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors"
                                                                    >
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={isSelected}
                                                                            onChange={() => toggleFamily(family)}
                                                                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                                        />
                                                                        <span className={`text-xs ${isSelected ? 'text-slate-900 font-medium' : 'text-slate-500'}`}>
                                                                            {family || 'Sin Familia'}
                                                                        </span>
                                                                    </label>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="h-[350px] w-full flex items-center justify-center">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={filteredMarketShare}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={80}
                                                    outerRadius={120}
                                                    paddingAngle={2}
                                                    dataKey="value"
                                                >
                                                    {filteredMarketShare.map((entry, index) => (
                                                        <Cell
                                                            key={`cell-${index}`}
                                                            fill={PIE_COLORS[allFamilies.indexOf(entry.name) % PIE_COLORS.length]}
                                                            stroke="none"
                                                        />
                                                    ))}
                                                </Pie>
                                                <Tooltip
                                                    formatter={(value: any) => formatTooltipCLP(Number(value))}
                                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                                />
                                                <Legend
                                                    layout="vertical"
                                                    verticalAlign="middle"
                                                    align="right"
                                                    wrapperStyle={{ fontSize: '12px' }}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="mt-4 text-center text-xs text-slate-500 flex flex-col gap-1">
                                        <div>Total Visible: <span className="font-bold text-indigo-600">{formatTooltipCLP(totalFiltrado)}</span></div>
                                        <div className="text-[10px] text-slate-400">Total Año (Global): {formatTooltipCLP(advancedData?.meta.totalVentaAnual || 0)}</div>
                                    </div>
                                </div>

                                {/* Ranking Familias Bar Chart */}
                                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="flex items-center justify-between mb-6">
                                        <div>
                                            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                                <BarChart3 className="h-5 w-5 text-indigo-500" />
                                                Ranking por Familia
                                            </h3>
                                            <p className="text-xs text-slate-500">Ventas acumuladas del año actual ({advancedData?.meta.anoActual})</p>
                                        </div>
                                    </div>
                                    <div className="h-[350px] w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart
                                                layout="vertical"
                                                data={filteredVentasPorFamilia.slice(0, 15) || []}
                                                margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
                                            >
                                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                                <XAxis type="number" hide />
                                                <YAxis
                                                    type="category"
                                                    dataKey="familia"
                                                    width={100}
                                                    tick={{ fontSize: 11, fill: '#64748b' }}
                                                    interval={0}
                                                />
                                                <Tooltip
                                                    cursor={{ fill: '#f8fafc' }}
                                                    content={({ active, payload }) => {
                                                        if (active && payload && payload.length) {
                                                            const data = payload[0].payload;
                                                            return (
                                                                <div className="bg-white p-3 border border-slate-100 shadow-xl rounded-xl">
                                                                    <p className="font-bold text-sm text-slate-900 mb-1">{data.familia || 'Sin Familia'}</p>
                                                                    <div className="space-y-1">
                                                                        <p className="text-indigo-600 font-bold text-sm">{formatTooltipCLP(data.totalMonto)}</p>
                                                                        <p className="text-slate-500 text-xs">{new Intl.NumberFormat("es-CL").format(data.totalCantidad)} unidades</p>
                                                                    </div>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    }}
                                                />
                                                <Bar dataKey="totalMonto" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={24} background={{ fill: '#f8fafc' }} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="mt-2 text-right">
                                        <Link href="/ventas/analisis" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Ver ranking detallado &rarr;</Link>
                                    </div>
                                </div>
                            </div>

                            {/* Seccion 3: Rendimiento Anual Acumulado - COMPARATIVA 2025 vs 2026 */}
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                <div className="flex items-center justify-between mb-6">
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                            <Calendar className="h-5 w-5 text-indigo-500" />
                                            Rendimiento Anual Acumulado (Comparativa)
                                        </h3>
                                        <p className="text-xs text-slate-500">Progreso de ventas acumuladas: {advancedData?.meta.anoAnterior} vs {advancedData?.meta.anoActual}</p>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs">
                                        <div className="flex items-center gap-1">
                                            <div className="w-3 h-3 bg-indigo-600 rounded-full"></div>
                                            <span className="font-bold text-slate-700">{advancedData?.meta.anoActual}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <div className="w-3 h-3 bg-slate-300 rounded-full border border-slate-400 border-dashed"></div>
                                            <span className="text-slate-500">{advancedData?.meta.anoAnterior}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="h-[400px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={advancedData?.rendimientoAnual || []} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                            <XAxis
                                                dataKey="mes"
                                                tickFormatter={(mes) => {
                                                    const date = new Date(2000, mes - 1, 1);
                                                    return date.toLocaleString('es-CL', { month: 'short' }).toUpperCase();
                                                }}
                                                fontSize={12}
                                                stroke="#94a3b8"
                                                tickLine={false}
                                                axisLine={true}
                                            />
                                            <YAxis
                                                yAxisId="left"
                                                orientation="left"
                                                tickFormatter={formatCLP}
                                                fontSize={12}
                                                stroke="#94a3b8"
                                                tickLine={false}
                                                axisLine={false}
                                            />
                                            <Tooltip
                                                labelFormatter={(mes) => {
                                                    const date = new Date(2000, Number(mes) - 1, 1);
                                                    return date.toLocaleString('es-CL', { month: 'long' }).toUpperCase();
                                                }}
                                                formatter={(value: any, name: any) => [
                                                    formatTooltipCLP(Number(value)),
                                                    name
                                                ]}
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                            />
                                            <Legend verticalAlign="top" height={36} />

                                            {/* Barras de venta mensual actual - (Estilo similar a la imagen) */}
                                            <Bar
                                                yAxisId="left"
                                                dataKey="mensualActual"
                                                name={`Venta ${advancedData?.meta.anoActual}`}
                                                fill="#3b82f6"
                                                radius={[4, 4, 0, 0]}
                                                barSize={30}
                                            />

                                            {/* Línea Acumulada Año Anterior (Punteada) */}
                                            <Line
                                                yAxisId="left"
                                                type="monotone"
                                                dataKey="acumuladoAnterior"
                                                name={`Acumulado ${advancedData?.meta.anoAnterior}`}
                                                stroke="#94a3b8"
                                                strokeWidth={2}
                                                strokeDasharray="5 5"
                                                dot={false}
                                                activeDot={{ r: 4 }}
                                            />

                                            {/* Línea Acumulada Año Actual (Sólida) */}
                                            <Line
                                                yAxisId="left"
                                                type="monotone"
                                                dataKey="acumuladoActual"
                                                name={`Acumulado ${advancedData?.meta.anoActual}`}
                                                stroke="#4f46e5"
                                                strokeWidth={3}
                                                dot={{ r: 4, fill: '#4f46e5', strokeWidth: 2, stroke: '#fff' }}
                                                activeDot={{ r: 7 }}
                                            />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Seccion 4: Evolución Mensual Detallada (Existente) */}
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm opacity-80 hover:opacity-100 transition-opacity">
                                <h3 className="text-lg font-bold text-slate-900 mb-6">Evolución Detallada (Últimos Periodos)</h3>
                                <div className="h-[300px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={data?.ventasMensuales || []}>
                                            <defs>
                                                <linearGradient id="colorMonto" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1} />
                                                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                            <XAxis dataKey="label" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                                            <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatCLP} />
                                            <Tooltip formatter={(value: any) => [formatTooltipCLP(Number(value)), "Monto Neto"]} />
                                            <Area type="monotone" dataKey="montoNeto" stroke="#4f46e5" strokeWidth={2} fillOpacity={1} fill="url(#colorMonto)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
