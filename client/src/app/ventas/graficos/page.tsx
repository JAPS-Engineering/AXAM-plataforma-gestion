"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchVentasResumen, fetchGraficosAvanzados } from "@/lib/api";
import { Sidebar } from "@/components/sidebar";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, ComposedChart
} from "recharts";
import { useState } from "react";
import { ChevronLeft, DollarSign, Activity, TrendingUp, PieChart as PieIcon, BarChart3, Calendar } from "lucide-react";
import Link from "next/link";

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
                            <h1 className="text-xl font-bold text-slate-900">Gráficos de Ventas</h1>
                            <p className="text-xs text-slate-500">Visualización de tendencias y métricas</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <select
                            value={meses}
                            onChange={(e) => setMeses(Number(e.target.value))}
                            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        >
                            <option value={3}>Últimos 3 meses</option>
                            <option value={6}>Últimos 6 meses</option>
                            <option value={12}>Últimos 12 meses</option>
                        </select>
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
                        <div className="space-y-8 pb-10">

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
                                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="flex items-center justify-between mb-6">
                                        <div>
                                            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                                <PieIcon className="h-5 w-5 text-indigo-500" />
                                                Market Share Interno
                                            </h3>
                                            <p className="text-xs text-slate-500">Participación por Familia de Proveedores ({advancedData?.meta.ano})</p>
                                        </div>
                                    </div>
                                    <div className="h-[350px] w-full flex items-center justify-center">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={advancedData?.marketShare || []}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={80}
                                                    outerRadius={120}
                                                    paddingAngle={2}
                                                    dataKey="value"
                                                >
                                                    {(advancedData?.marketShare || []).map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} stroke="none" />
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
                                    <div className="mt-4 text-center text-xs text-slate-400">
                                        Total Año: {formatTooltipCLP(advancedData?.meta.totalVentaAnual || 0)}
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
                                            <p className="text-xs text-slate-500">Ventas acumuladas del año actual ({advancedData?.meta.ano})</p>
                                        </div>
                                    </div>
                                    <div className="h-[350px] w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart
                                                layout="vertical"
                                                data={advancedData?.ventasPorFamilia.slice(0, 8) || []}
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
                                        <Link href="#" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Ver ranking completo &rarr;</Link>
                                    </div>
                                </div>
                            </div>

                            {/* Seccion 3: Rendimiento Anual Acumulado */}
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                <div className="flex items-center justify-between mb-6">
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                            <Calendar className="h-5 w-5 text-indigo-500" />
                                            Rendimiento Anual Acumulado
                                        </h3>
                                        <p className="text-xs text-slate-500">Progreso de ventas acumuladas durante {advancedData?.meta.ano}</p>
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
                                                axisLine={false}
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
                                                    name === "acumulado" ? "Acumulado Anual" : "Venta Mensual"
                                                ]}
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                            />
                                            <Legend verticalAlign="top" height={36} />
                                            <Bar yAxisId="left" dataKey="mensual" name="Venta Mensual" fill="#cbd5e1" radius={[4, 4, 0, 0]} barSize={20} />
                                            <Line
                                                yAxisId="left"
                                                type="monotone"
                                                dataKey="acumulado"
                                                name="Acumulado Anual"
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
