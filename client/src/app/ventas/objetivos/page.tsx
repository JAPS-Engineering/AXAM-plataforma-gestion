"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { Sidebar } from "@/components/sidebar";
import { RefreshCw, TrendingUp, Target, DollarSign, Wallet, Calendar as CalendarIcon, ChevronLeft } from "lucide-react";
import Link from "next/link";
import VendedoresChart from "@/components/ventas/VendedoresChart";
import VendedoresTable from "@/components/ventas/VendedoresTable";
import { MarketShareVendedoresChart } from "@/components/ventas/MarketShareVendedoresChart";
import { RankingVendedoresChart } from "@/components/ventas/RankingVendedoresChart";
import { ResumenMesActualTable } from "@/components/ventas/ResumenMesActualTable";
import { cn } from "@/lib/utils";

// Helpers for dates
const getCurrentMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const getPastMonth = (monthsAgo: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() - monthsAgo);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

interface VendedorMesData {
    ano: number;
    mes: number;
    label: string;
}

interface SalesData {
    ventas: Record<string, Record<string, number>>;
    objetivos: Record<string, Record<string, number>>;
    proyecciones: Record<string, Record<string, number>>;
    ranking: { name: string; value: number; percentage: string }[];
    meta: {
        monthsArray: VendedorMesData[];
        totalVenta: number;
        anoActual: number;
    };
}

export default function ObjetivosPage() {
    const [data, setData] = useState<SalesData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentView, setCurrentView] = useState<"Real" | "Objetivo" | "Propongo">("Real");

    // Period State
    const [periodMode, setPeriodMode] = useState<"preset" | "custom">("preset");
    const [meses, setMeses] = useState(12);
    const [customRange, setCustomRange] = useState({
        start: getPastMonth(12),
        end: getCurrentMonth()
    });

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const baseUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
            let url = `${baseUrl}/targets/ventas`;

            if (periodMode === "preset") {
                url += `?meses=${meses}`;
            } else {
                url += `?start=${customRange.start}&end=${customRange.end}`;
            }

            const res = await fetch(url);
            if (!res.ok) throw new Error("Error al cargar datos desde el servidor");
            const jsonData = await res.json();
            setData(jsonData);
            setError(null);
        } catch (err: any) {
            console.error(err);
            setError("No se pudo conectar con el servidor. Verifica que el backend esté ejecutándose.");
        } finally {
            setLoading(false);
        }
    }, [periodMode, meses, customRange]);

    const handleSaveTarget = async (vendedor: string, mes: number, ano: number, monto: number, type: "Objetivo" | "Propongo") => {
        try {
            setSaving(true);
            const endpoint = type === "Objetivo" ? "/api/targets/objetivo" : "/api/targets/proyeccion";
            const body = type === "Objetivo"
                ? { tipo: "VENDEDOR", entidadId: vendedor, ano, mes, montoObjetivo: monto }
                : { vendedorId: vendedor, ano, mes, montoPropongo: monto };

            const baseUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
            const res = await fetch(`${baseUrl}${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!res.ok) throw new Error("Error al guardar");

            setData(prev => {
                if (!prev) return prev;
                const newData = { ...prev };
                const key = type === "Objetivo" ? "objetivos" : "proyecciones";
                const dataSourceKey = `${ano}-${mes}`;

                if (!newData[key][vendedor]) newData[key][vendedor] = {};
                newData[key][vendedor][dataSourceKey] = monto;
                return newData;
            });
        } catch (err: any) {
            alert("Error al guardar: " + err.message);
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const totalVentasPeriodo = data?.meta?.totalVenta || 0;

    // Performance against objectives (of the selected view/period)
    const globalObjectiveSum = useMemo(() => {
        if (!data) return 0;
        return Object.values(data.objetivos).reduce((acc, meses) =>
            acc + Object.values(meses).reduce((a, b) => a + b, 0), 0);
    }, [data]);

    const compliance = globalObjectiveSum > 0 ? (totalVentasPeriodo / globalObjectiveSum) * 100 : 0;

    const formatCLP = (val: number) =>
        new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(val);

    const EXTENDED_PALETTE = [
        '#4f46e5', '#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1', '#14b8a6',
        '#ef4444', '#f97316', '#84cc16', '#22c55e', '#0ea5e9', '#3b82f6', '#a855f7', '#d946ef'
    ];

    return (
        <div className="flex h-screen bg-slate-100 overflow-hidden text-slate-900">
            <Sidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm flex-shrink-0 z-10">
                    <div className="flex items-center gap-3">
                        <Link href="/ventas" className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
                            <ChevronLeft className="h-5 w-5" />
                        </Link>
                        <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                            <Target className="h-6 w-6" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">Objetivos y Vendedores</h1>
                            <p className="text-xs text-slate-500">Análisis temporal y gestión de metas</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Period Selector */}
                        <div className="flex items-center gap-2">
                            <div className="bg-slate-50 rounded-lg p-1 flex items-center border border-slate-200 gap-1">
                                <button
                                    onClick={() => setPeriodMode("preset")}
                                    className={cn("px-3 py-1 text-xs font-bold rounded-md transition-all", periodMode === "preset" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}
                                >
                                    Predefinido
                                </button>
                                <button
                                    onClick={() => setPeriodMode("custom")}
                                    className={cn("px-3 py-1 text-xs font-bold rounded-md transition-all", periodMode === "custom" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}
                                >
                                    Específico
                                </button>
                            </div>

                            {periodMode === "preset" ? (
                                <select
                                    value={meses}
                                    onChange={(e) => setMeses(Number(e.target.value))}
                                    className="px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 font-medium text-slate-700 cursor-pointer"
                                >
                                    <option value={1}>Mes Actual</option>
                                    <option value={3}>Últimos 3 meses</option>
                                    <option value={6}>Últimos 6 meses</option>
                                    <option value={12}>Últimos 12 meses</option>
                                </select>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="month"
                                        value={customRange.start}
                                        onChange={(e) => setCustomRange(p => ({ ...p, start: e.target.value }))}
                                        className="px-2 py-1 text-sm bg-white border border-slate-200 rounded focus:outline-none text-slate-700 font-medium"
                                    />
                                    <span className="text-slate-400">→</span>
                                    <input
                                        type="month"
                                        value={customRange.end}
                                        onChange={(e) => setCustomRange(p => ({ ...p, end: e.target.value }))}
                                        className="px-2 py-1 text-sm bg-white border border-slate-200 rounded focus:outline-none text-slate-700 font-medium"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="h-6 w-[1px] bg-slate-200 mx-1" />

                        <div className="bg-slate-50 rounded-lg p-1 flex items-center border border-slate-200 gap-1">
                            {(["Real", "Objetivo", "Propongo"] as const).map((view) => (
                                <button
                                    key={view}
                                    onClick={() => setCurrentView(view)}
                                    className={cn("px-3 py-1 text-xs font-bold rounded-md transition-all", currentView === view ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}
                                >
                                    {view === "Propongo" ? "Propuestas" : view}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={fetchData}
                            disabled={loading}
                            className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
                        >
                            <RefreshCw className={cn("h-5 w-5", loading && "animate-spin")} />
                        </button>
                    </div>
                </header>

                <main className="flex-1 overflow-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-slate-200">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4 transition-transform hover:scale-[1.02]">
                            <div className="p-3 bg-blue-50 text-blue-600 rounded-full">
                                <DollarSign className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500 font-medium">Venta Total Periodo</p>
                                <p className="text-2xl font-bold text-slate-900">{formatCLP(totalVentasPeriodo)}</p>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4 transition-transform hover:scale-[1.02]">
                            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full">
                                <Wallet className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500 font-medium">Objetivos Asignados</p>
                                <p className="text-2xl font-bold text-slate-900">{formatCLP(globalObjectiveSum)}</p>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4 transition-transform hover:scale-[1.02]">
                            <div className="p-3 bg-green-50 text-green-600 rounded-full">
                                <TrendingUp className="h-6 w-6" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm text-slate-500 font-medium">Cumplimiento del Plan</p>
                                <div className="flex items-center gap-3">
                                    <p className="text-2xl font-bold text-slate-900">{compliance.toFixed(1)}%</p>
                                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-green-500 rounded-full transition-all duration-1000"
                                            style={{ width: `${Math.min(compliance, 100)}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Resumen Mes Actual Table */}
                    <ResumenMesActualTable
                        ventas={data?.ventas || {}}
                        objetivos={data?.objetivos || {}}
                        proyecciones={data?.proyecciones || {}}
                        loading={loading}
                    />

                    {/* Chart Container - Tendencia (Existente mejorado) */}
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-2 mb-6">
                            <TrendingUp className="h-5 w-5 text-indigo-500" />
                            <h2 className="text-lg font-bold text-slate-800">Tendencia Mensual</h2>
                        </div>
                        <div className="min-h-[350px]">
                            <VendedoresChart
                                data={data?.ventas || {}}
                                objetivos={data?.objetivos || {}}
                                proyecciones={data?.proyecciones || {}}
                                view={currentView}
                                anio={data?.meta?.anoActual || new Date().getFullYear()}
                                loading={loading}
                            />
                        </div>
                    </div>

                    {/* New Charts: Side by Side */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <MarketShareVendedoresChart
                            data={data?.ranking}
                            loading={loading}
                            colors={EXTENDED_PALETTE}
                        />
                        <RankingVendedoresChart
                            data={data?.ranking}
                            loading={loading}
                            colors={EXTENDED_PALETTE}
                        />
                    </div>

                    {/* Table Section */}
                    <div className="space-y-3 pb-10">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-bold text-slate-800">
                                    Desglose por Vendedor
                                </h2>
                                <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
                                    {currentView === "Real" ? "Ventas Reales" : currentView === "Objetivo" ? "Objetivos" : "Propuestas"}
                                </span>
                            </div>
                            {currentView !== "Real" && (
                                <p className="text-xs text-slate-400 italic">
                                    * Valores editables para el periodo seleccionado
                                </p>
                            )}
                        </div>

                        {loading ? (
                            <div className="h-64 bg-white rounded-xl border border-slate-200 flex items-center justify-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                            </div>
                        ) : error ? (
                            <div className="h-64 bg-white rounded-xl border border-red-200 bg-red-50 flex flex-col items-center justify-center text-red-600 p-6 text-center">
                                <p className="font-bold">Error al cargar datos</p>
                                <p className="text-sm opacity-80">{error}</p>
                                <button
                                    onClick={fetchData}
                                    className="mt-4 px-6 py-2 bg-red-600 text-white rounded-lg text-sm font-bold active:scale-95 transition-transform"
                                >
                                    Reintentar
                                </button>
                            </div>
                        ) : data ? (
                            <VendedoresTable
                                data={data.ventas}
                                objetivos={data.objetivos}
                                proyecciones={data.proyecciones}
                                view={currentView}
                                onSave={handleSaveTarget}
                                monthsArray={data.meta.monthsArray}
                                loading={loading}
                            />
                        ) : null}
                    </div>
                </main>
            </div>
            {saving && (
                <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-[1px] z-50 flex items-center justify-center">
                    <div className="bg-white p-4 rounded-xl shadow-2xl flex items-center gap-3">
                        <RefreshCw className="h-5 w-5 text-indigo-600 animate-spin" />
                        <span className="font-bold text-slate-700">Guardando cambios...</span>
                    </div>
                </div>
            )}
        </div>
    );
}
