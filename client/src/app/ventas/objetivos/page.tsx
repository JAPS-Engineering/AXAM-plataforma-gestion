"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchGraficosAvanzados } from "@/lib/api";
import { Sidebar } from "@/components/sidebar";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { ChevronLeft, TrendingUp, Target, Users } from "lucide-react";
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

export default function ObjetivosVendedoresPage() {
    const { data: advancedData, isLoading: isLoadingAdv, error } = useQuery({
        queryKey: ["graficos-avanzados"],
        queryFn: () => fetchGraficosAvanzados(),
    });

    return (
        <div className="flex h-screen bg-slate-100">
            <Sidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm z-10">
                    <div className="flex items-center gap-3">
                        <Link
                            href="/ventas/graficos"
                            className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </Link>
                        <div className="p-2 bg-indigo-100 rounded-lg">
                            <Target className="h-6 w-6 text-indigo-600" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">Objetivos y Vendedores</h1>
                            <p className="text-xs text-slate-500">Gestión de metas y desempeño por vendedor</p>
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-auto p-6 scrollbar-thin scrollbar-thumb-slate-200">
                    {isLoadingAdv ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                        </div>
                    ) : error ? (
                        <div className="flex items-center justify-center h-64 text-red-600">
                            Error al cargar datos: {(error as Error).message}
                        </div>
                    ) : (
                        <div className="space-y-6 pb-10">

                            {/* Seccion 1: Objetivos y Proyecciones */}
                            <TargetsSection />

                            {/* Seccion 2: Desempeño por Vendedor */}
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                <div className="flex items-center justify-between mb-6">
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                            <Users className="h-5 w-5 text-indigo-500" />
                                            Ventas por Vendedor
                                        </h3>
                                        <p className="text-xs text-slate-500">Ventas acumuladas del año actual ({advancedData?.meta.anoActual})</p>
                                    </div>
                                </div>

                                <div className="h-[400px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            layout="vertical"
                                            data={advancedData?.ventasPorVendedor || []}
                                            margin={{ top: 5, right: 30, left: 60, bottom: 20 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                            <XAxis
                                                type="number"
                                                tickFormatter={formatCLP}
                                                tick={{ fontSize: 10, fill: '#94a3b8' }}
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <YAxis
                                                type="category"
                                                dataKey="name"
                                                width={100}
                                                tick={{ fontSize: 11, fill: '#64748b' }}
                                                interval={0}
                                            />
                                            <Tooltip
                                                cursor={{ fill: '#f8fafc' }}
                                                formatter={(value: any) => [formatTooltipCLP(Number(value)), "Venta Acumulada"]}
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                            />
                                            <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={32} />
                                        </BarChart>
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
