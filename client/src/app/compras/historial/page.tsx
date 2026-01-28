"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchStockHistory } from "@/lib/api";
import { Sidebar } from "@/components/sidebar";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area
} from "recharts";
import { Search, History, ChevronLeft, Calendar } from "lucide-react";
import Link from "next/link";

export default function HistorialStockPage() {
    const [sku, setSku] = useState("");
    const [searchedSku, setSearchedSku] = useState("");
    const [dias, setDias] = useState(30);

    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ["stock-history", searchedSku, dias],
        queryFn: () => fetchStockHistory(searchedSku, dias),
        enabled: !!searchedSku,
        retry: false
    });

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (sku.trim()) {
            setSearchedSku(sku.trim());
        }
    };

    const formatDate = (isoString: string) => {
        const date = new Date(isoString);
        return date.toLocaleDateString("es-CL", { day: "numeric", month: "short" });
    };

    return (
        <div className="flex h-screen bg-slate-100">
            <Sidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm z-10">
                    <div className="flex items-center gap-3">
                        <Link
                            href="/compras"
                            className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </Link>
                        <div className="p-2 bg-blue-100 rounded-lg">
                            <History className="h-6 w-6 text-blue-600" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">Historial de Inventario</h1>
                            <p className="text-xs text-slate-500">Evolución de stock diario (viaje en el tiempo)</p>
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-auto p-6 scrollbar-thin scrollbar-thumb-slate-200">
                    <div className="max-w-5xl mx-auto space-y-6">

                        {/* Buscador */}
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                            <form onSubmit={handleSearch} className="flex gap-4 items-end">
                                <div className="flex-1">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">SKU del Producto</label>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                        <input
                                            type="text"
                                            value={sku}
                                            onChange={(e) => setSku(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors uppercase"
                                            placeholder="Ej: 1001..."
                                        />
                                    </div>
                                </div>
                                <div className="w-48">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Periodo</label>
                                    <select
                                        value={dias}
                                        onChange={(e) => setDias(Number(e.target.value))}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    >
                                        <option value={7}>Últimos 7 días</option>
                                        <option value={30}>Últimos 30 días</option>
                                        <option value={90}>Últimos 3 meses</option>
                                        <option value={180}>Últimos 6 meses</option>
                                    </select>
                                </div>
                                <button
                                    type="submit"
                                    className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                                >
                                    Consultar
                                </button>
                            </form>
                        </div>

                        {/* Resultados */}
                        {isLoading && (
                            <div className="flex justify-center py-12">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                            </div>
                        )}

                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-center gap-3">
                                <span className="font-bold">Error:</span>
                                <span>No se pudo encontrar información para el SKU "{searchedSku}" o no hay historial disponible.</span>
                            </div>
                        )}

                        {!isLoading && !error && data && (
                            <div className="space-y-6">
                                {/* Info del Producto */}
                                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                                    <div>
                                        <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Producto</div>
                                        <h2 className="text-2xl font-bold text-slate-900">{data.sku}</h2>
                                        <p className="text-slate-600">{data.descripcion}</p>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Stock Actual</div>
                                        {data.historial.length > 0 ? (
                                            <div className="text-3xl font-bold text-blue-600">
                                                {data.historial[data.historial.length - 1].stock}
                                            </div>
                                        ) : (
                                            <div className="text-xl text-slate-400">N/A</div>
                                        )}
                                        <div className="text-xs text-slate-400 mt-1">unidades</div>
                                    </div>
                                </div>

                                {/* Gráfico */}
                                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                    <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                                        <Activity className="h-5 w-5 text-blue-500" />
                                        Evolución de Stock
                                    </h3>

                                    <div className="h-[400px] w-full">
                                        {data.historial.length > 0 ? (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={data.historial} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                                    <defs>
                                                        <linearGradient id="colorStock" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                                    <XAxis
                                                        dataKey="fecha"
                                                        tickFormatter={formatDate}
                                                        stroke="#94a3b8"
                                                        fontSize={12}
                                                        tickLine={false}
                                                        axisLine={false}
                                                        minTickGap={30}
                                                    />
                                                    <YAxis
                                                        stroke="#94a3b8"
                                                        fontSize={12}
                                                        tickLine={false}
                                                        axisLine={false}
                                                    />
                                                    <Tooltip
                                                        labelFormatter={(label) => new Date(label).toLocaleDateString("es-CL", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                                        formatter={(value: any) => [`${value} unidades`, "Stock"]}
                                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                                    />
                                                    <Area
                                                        type="monotone"
                                                        dataKey="stock"
                                                        stroke="#3b82f6"
                                                        strokeWidth={3}
                                                        fillOpacity={1}
                                                        fill="url(#colorStock)"
                                                    />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        ) : (
                                            <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                                <History className="h-12 w-12 mb-3 opacity-20" />
                                                <p>No hay datos históricos disponibles para este periodo.</p>
                                                <p className="text-sm mt-2">Ejecuta el script de sincronización histórica en el backend.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {!searchedSku && (
                            <div className="flex flex-col items-center justify-center h-64 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                                <Search className="h-12 w-12 mb-4 opacity-20" />
                                <p className="text-lg">Ingresa un SKU para consultar su historial</p>
                            </div>
                        )}

                    </div>
                </main>
            </div>
        </div>
    );
}

function Activity(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
    )
}
