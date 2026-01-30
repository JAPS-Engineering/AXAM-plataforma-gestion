"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { Sidebar } from "@/components/sidebar";
import { RefreshCw, TrendingUp, Target, DollarSign, Wallet, Calendar as CalendarIcon, ChevronLeft, Info } from "lucide-react";
import Link from "next/link";
import VendedoresChart from "@/components/ventas/VendedoresChart";
import VendedoresTable from "@/components/ventas/VendedoresTable";
import { MarketShareVendedoresChart } from "@/components/ventas/MarketShareVendedoresChart";
import { RankingVendedoresChart } from "@/components/ventas/RankingVendedoresChart";
import { ResumenMesActualTable } from "@/components/ventas/ResumenMesActualTable";
import { cn } from "@/lib/utils";

// Helpers for dates (Backend uses unpadded months e.g. "2024-1")
const getCurrentMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}`;
};
const getPastMonth = (monthsAgo: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() - monthsAgo);
    return `${d.getFullYear()}-${d.getMonth() + 1}`;
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
        monthsArray: VendedorMesData[]; // Historic
        futureMonthsArray?: VendedorMesData[]; // Future (Planning)
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
    const [tableDetailView, setTableDetailView] = useState<"Real" | "Objetivo" | "Propongo">("Real");
    const [selectedSummaryMonth, setSelectedSummaryMonth] = useState<string>(getCurrentMonth());

    // Period State
    const [periodMode, setPeriodMode] = useState<"preset" | "custom">("preset");
    const [meses, setMeses] = useState(12);
    const [customRange, setCustomRange] = useState({
        start: getPastMonth(12),
        end: getCurrentMonth()
    });

    // Future Planning State
    const [pageMode, setPageMode] = useState<"history" | "planning">("history");
    const [futureRange, setFutureRange] = useState<number>(6);

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

            // Append future range param
            url += `&futureMonths=${futureRange}`;

            const res = await fetch(url);
            if (!res.ok) throw new Error("Error al cargar datos desde el servidor");
            const jsonData = await res.json();
            setData(jsonData);
            // Default select the latest month available
            if (jsonData.meta?.monthsArray?.length > 0) {
                const latest = jsonData.meta.monthsArray[jsonData.meta.monthsArray.length - 1];
                setSelectedSummaryMonth(`${latest.ano}-${latest.mes}`);
            }
            setError(null);
        } catch (err: any) {
            console.error(err);
            setError("No se pudo conectar con el servidor. Verifica que el backend esté ejecutándose.");
        } finally {
            setLoading(false);
        }
    }, [periodMode, meses, customRange, futureRange]);

    const handleSaveTarget = async (vendedor: string, mes: number, ano: number, monto: number, type: "Objetivo" | "Propongo") => {
        try {
            setSaving(true);
            const endpoint = type === "Objetivo" ? "/targets/objetivo" : "/targets/proyeccion";
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
                const key = type === "Objetivo" ? "objetivos" : "proyecciones";
                const dataSourceKey = `${ano}-${mes}`;

                return {
                    ...prev,
                    [key]: {
                        ...prev[key],
                        [vendedor]: {
                            ...(prev[key][vendedor] || {}),
                            [dataSourceKey]: monto
                        }
                    }
                };
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

    // Context-Aware KPI Calculation with SELECTIVE COMPLIANCE
    const { kpi1, kpi2, kpi3 } = useMemo(() => {
        if (!data) return { kpi1: { label: '', value: 0 }, kpi2: { label: '', value: 0 }, kpi3: { label: '', value: 0 } };

        // MODE 1: HISTORICAL REVIEW (Selective Compliance)
        if (pageMode === "history") {
            const historicMonths = data.meta.monthsArray || [];
            let totalReal = 0;      // Total sales in period (unfiltered)
            let totalObjetivo = 0;  // Total objectives in period

            // For Compliance %: Only count where Objective > 0
            let complianceSales = 0;
            let complianceTarget = 0;

            historicMonths.forEach(m => {
                const key = `${m.ano}-${m.mes}`;
                Object.keys(data.ventas).forEach(vendedor => {
                    const venta = data.ventas[vendedor]?.[key] || 0;
                    const objetivo = data.objetivos[vendedor]?.[key] || 0;

                    totalReal += venta;
                    totalObjetivo += objetivo;

                    if (objetivo > 0) {
                        complianceSales += venta;
                        complianceTarget += objetivo;
                    }
                });
            });

            const cumplimiento = complianceTarget > 0 ? (complianceSales / complianceTarget) * 100 : 0;

            return {
                kpi1: { label: 'Venta Real (Periodo)', value: totalReal },
                kpi2: { label: 'Objetivos (Mes Actual)', value: totalObjetivo },
                kpi3: { label: 'Cumplimiento (Mes Actual)', value: cumplimiento }
            };
        }

        // MODE 2: PLANNING (Future)
        else {
            const futureMonths = data.meta.futureMonthsArray || [];
            let totalPropongo = 0; // Salesperson Promise
            let totalMeta = 0;     // Company Target

            // For Coverage %: Only count where Objective > 0
            let coveragePropongo = 0;
            let coverageTarget = 0;

            futureMonths.forEach(m => {
                const key = `${m.ano}-${m.mes}`;
                const allSellers = Object.keys((data as any).vendedores || {});

                allSellers.forEach(vendedor => {
                    const prop = data.proyecciones[vendedor]?.[key] || 0;
                    const obj = data.objetivos[vendedor]?.[key] || 0;

                    totalPropongo += prop;
                    totalMeta += obj;

                    if (obj > 0) {
                        coveragePropongo += prop;
                        coverageTarget += obj;
                    }
                });
            });

            const cobertura = coverageTarget > 0 ? (coveragePropongo / coverageTarget) * 100 : 0;

            return {
                kpi1: { label: 'Proyección (Propuestas)', value: totalPropongo },
                kpi2: { label: 'Meta Global (Objetivos)', value: totalMeta },
                kpi3: { label: 'Cobertura del Plan', value: cobertura }
            };
        }
    }, [data, pageMode]);


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
                        <div className="flex items-center gap-4">
                            {/* Global Mode Switcher */}
                            <div className="bg-slate-100 p-1 rounded-lg flex items-center border border-slate-200">
                                <button
                                    onClick={() => {
                                        setPageMode("history");
                                        setTableDetailView("Real");
                                    }}
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-1.5 text-sm font-bold rounded-md transition-all",
                                        pageMode === "history" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                    )}
                                >
                                    <RefreshCw className="h-4 w-4" />
                                    Histórico
                                </button>
                                <button
                                    onClick={() => {
                                        setPageMode("planning");
                                        setTableDetailView("Objetivo");
                                    }}
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-1.5 text-sm font-bold rounded-md transition-all",
                                        pageMode === "planning" ? "bg-white text-amber-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                    )}
                                >
                                    <Target className="h-4 w-4" />
                                    Proyección
                                </button>
                            </div>

                            <div className="h-6 w-[1px] bg-slate-200 mx-1" />

                            {/* Conditional Filters */}
                            {pageMode === "history" ? (
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
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-500 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md">
                                        Horizonte de Planificación
                                    </span>
                                    <select
                                        value={futureRange}
                                        onChange={(e) => setFutureRange(Number(e.target.value))}
                                        className="px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-200 font-medium text-slate-700 cursor-pointer"
                                        disabled={false}
                                    >
                                        <option value={3}>+3 Meses</option>
                                        <option value={6}>+6 Meses</option>
                                        <option value={12}>+12 Meses</option>
                                    </select>
                                </div>
                            )}

                            {/* View Switchers Removed as requested */}

                            <button
                                onClick={fetchData}
                                disabled={loading || saving}
                                className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
                            >
                                <RefreshCw className={cn("h-5 w-5", (loading || saving) && "animate-spin")} />
                            </button>
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-slate-200">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4 transition-transform hover:scale-[1.02]">
                            <div className={cn("p-3 rounded-full", pageMode === "history" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600")}>
                                <DollarSign className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500 font-medium">{kpi1.label}</p>
                                <p className="text-2xl font-bold text-slate-900">{formatCLP(kpi1.value)}</p>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4 transition-transform hover:scale-[1.02]">
                            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full">
                                <Wallet className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500 font-medium">{kpi2.label}</p>
                                <p className="text-2xl font-bold text-slate-900">{formatCLP(kpi2.value)}</p>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4 transition-transform hover:scale-[1.02]">
                            <div className={cn("p-3 rounded-full", pageMode === "history" ? "bg-green-50 text-green-600" : "bg-sky-50 text-sky-600")}>
                                <TrendingUp className="h-6 w-6" />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <p className="text-sm text-slate-500 font-medium">{kpi3.label}</p>
                                    {pageMode === "planning" && (
                                        <div className="relative group cursor-help">
                                            <Info className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-56 p-2 bg-slate-800 text-white text-xs rounded-lg shadow-lg z-50 text-center pointer-events-none">
                                                Cálculo: Proyección (Propuestas) / Meta Global (Objetivos)
                                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-3">
                                    <p className="text-2xl font-bold text-slate-900">{kpi3.value.toFixed(1)}%</p>
                                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                            className={cn("h-full rounded-full transition-all duration-1000", pageMode === "history" ? "bg-green-500" : "bg-sky-500")}
                                            style={{ width: `${Math.min(kpi3.value, 100)}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Resumen Mes Actual Table - Fixed to Current Month (Only visible in History Mode) */}
                    {pageMode === "history" && (
                        <ResumenMesActualTable
                            ventas={data?.ventas || {}}
                            objetivos={data?.objetivos || {}}
                            proyecciones={data?.proyecciones || {}}
                            vendedores={(data as any)?.vendedores}
                            onSave={handleSaveTarget}
                            loading={loading}
                            currentMonthKey={getCurrentMonth()}
                        />
                    )}

                    {/* Chart Container - Conditionally Hidden in Planning Mode */}
                    {pageMode === "history" && (
                        <>
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                <div className="flex items-center gap-2 mb-6">
                                    <TrendingUp className="h-5 w-5 text-indigo-500" />
                                    <h2 className="text-lg font-bold text-slate-800">Tendencia por Vendedor (Real)</h2>
                                </div>
                                <div className="h-[400px]">
                                    <VendedoresChart
                                        data={data?.ventas || {}}
                                        objetivos={data?.objetivos || {}}
                                        proyecciones={data?.proyecciones || {}}
                                        vendedores={(data as any)?.vendedores}
                                        view="Real"
                                        anio={data?.meta?.anoActual || new Date().getFullYear()}
                                        loading={loading}
                                        monthsArray={data?.meta?.monthsArray}
                                    />
                                </div>
                            </div>

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
                        </>
                    )}

                    {/* Table Section */}
                    <div className="space-y-3 pb-10">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-bold text-slate-800">
                                    Desglose por Vendedor
                                </h2>
                                <span className={cn(
                                    "text-xs px-2 py-0.5 rounded-full font-bold",
                                    pageMode === "history"
                                        ? "bg-indigo-50 text-indigo-700"
                                        : "bg-amber-50 text-amber-700"
                                )}>
                                    {pageMode === "history"
                                        ? `Historial de Ventas`
                                        : `Planificación Futura (${futureRange} Meses)`
                                    }
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                {pageMode === "planning" && (
                                    <>
                                        <span className="text-xs text-slate-500 font-medium mr-2">
                                            Modo Edición:
                                        </span>
                                        <div className="bg-slate-50 rounded-lg p-1 flex items-center border border-slate-200 gap-1">
                                            <button
                                                onClick={() => setTableDetailView("Objetivo")}
                                                className={cn(
                                                    "px-2.5 py-1 text-[10px] font-bold rounded-md transition-all",
                                                    tableDetailView === "Objetivo" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                                                )}
                                            >
                                                Objetivos
                                            </button>
                                            <button
                                                onClick={() => setTableDetailView("Propongo")}
                                                className={cn(
                                                    "px-2.5 py-1 text-[10px] font-bold rounded-md transition-all",
                                                    tableDetailView === "Propongo" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                                                )}
                                            >
                                                Propuestas
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
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
                                vendedores={(data as any)?.vendedores}
                                view={pageMode === "history" ? "Real" : tableDetailView}
                                onSave={handleSaveTarget}
                                monthsArray={
                                    pageMode === "history"
                                        ? data.meta.monthsArray
                                        : (data.meta.futureMonthsArray || [])
                                }
                                loading={loading}
                            />
                        ) : null}
                    </div>
                </main>
            </div>
        </div>
    );
}
