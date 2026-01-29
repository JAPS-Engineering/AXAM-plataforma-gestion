"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchVentasResumen, fetchGraficosAvanzados, fetchVentasTendencias } from "@/lib/api";
import { Sidebar } from "@/components/sidebar";
import { useState, useMemo, useEffect, useRef } from "react";
import { ChevronLeft, TrendingUp, Calendar as CalendarIcon } from "lucide-react";
import Link from "next/link";
import { ResumenKPIs } from "@/components/ventas/ResumenKPIs";
import { MarketShareChart } from "@/components/ventas/MarketShareChart";
import { RankingFamiliasChart } from "@/components/ventas/RankingFamiliasChart";
import { RendimientoAnualChart } from "@/components/ventas/RendimientoAnualChart";
import { TendenciasChart } from "@/components/ventas/TendenciasChart";

// Default helpers
const getCurrentMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const getPastMonth = (monthsAgo: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() - monthsAgo);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function GraficosVentasPage() {
    // State del Periodo
    const [periodMode, setPeriodMode] = useState<"preset" | "custom">("preset");
    const [meses, setMeses] = useState(6);
    const [customRange, setCustomRange] = useState({
        start: getPastMonth(6),
        end: getCurrentMonth()
    });

    // Params computados para la API
    const apiParams = useMemo(() => {
        if (periodMode === "preset") {
            return { meses }; // Pasa { meses: 6 }
        } else {
            return { start: customRange.start, end: customRange.end };
        }
    }, [periodMode, meses, customRange]);

    // Query Resumen (Afectado por fechas)
    const { data: resumenData, isLoading, error } = useQuery({
        queryKey: ["ventas-resumen", apiParams],
        queryFn: () => fetchVentasResumen(apiParams as any),
        enabled: periodMode === "preset" || (!!customRange.start && !!customRange.end)
    });

    // Query Avanzados (Market Share/Ranking Afectado; Rendimiento Anual No)
    const computedAdvancedParams = useMemo(() => {
        if (periodMode === "custom") return apiParams;

        // Si es preset, calculamos start/end basados en los meses seleccionados para forzar el filtrado
        // Restamos (meses - 1) para obtener el rango inclusivo de X meses terminando en el actual
        if (periodMode === "preset") {
            return {
                start: getPastMonth(meses - 1),
                end: getCurrentMonth()
            };
        }
        return undefined;
    }, [periodMode, customRange, apiParams, meses]);

    const { data: advancedData, isLoading: isLoadingAdv } = useQuery({
        queryKey: ["graficos-avanzados", computedAdvancedParams],
        queryFn: () => fetchGraficosAvanzados(computedAdvancedParams),
    });

    // Query Tendencias (Ahora afectado por fechas custom y preset calculadas)
    // El backend ahora soporta rangos, así que pasamos computedAdvancedParams que siempre tienen fechas
    const { data: tendencias, isLoading: isLoadingTrends } = useQuery({
        queryKey: ["ventas-tendencias", computedAdvancedParams],
        queryFn: () => fetchVentasTendencias(computedAdvancedParams),
    });

    const isLoadingAll = isLoading || isLoadingAdv || isLoadingTrends;

    // --- Lógica de Filtros por Familia ---
    const allFamilies = useMemo(() => {
        if (!advancedData?.marketShare) return [];
        return advancedData.marketShare.map(m => m.name).sort();
    }, [advancedData]);

    const [selectedFamilies, setSelectedFamilies] = useState<string[]>([]);
    const hasInitializedFamilies = useRef(false);

    // Inicializar con todas las familias solo la primera vez que cargan los datos
    useEffect(() => {
        // Solo inicializar si tenemos datos y no hemos inicializado aun
        if (allFamilies.length > 0 && !hasInitializedFamilies.current) {
            setSelectedFamilies(allFamilies);
            hasInitializedFamilies.current = true;
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

    const filteredVentasPorFamilia = useMemo(() => {
        if (!advancedData?.ventasPorFamilia) return [];
        return advancedData.ventasPorFamilia.filter(f => selectedFamilies.includes(f.familia));
    }, [advancedData?.ventasPorFamilia, selectedFamilies]);

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
                                    <option value={3}>Últimos 3 meses</option>
                                    <option value={6}>Últimos 6 meses</option>
                                    <option value={12}>Últimos 12 meses</option>
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

                <main className="flex-1 overflow-auto p-6 scrollbar-thin scrollbar-thumb-slate-200">
                    {/* Resumen General */}
                    <div className="mb-6">
                        <ResumenKPIs kpis={resumenData?.kpis} loading={isLoading} error={error} />
                    </div>

                    {isLoadingAll && !resumenData ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                        </div>
                    ) : error ? (
                        <div className="flex items-center justify-center h-64 text-red-600">
                            Error al cargar datos: {(error as Error).message}
                        </div>
                    ) : (
                        <div className="space-y-6 pb-10">

                            {/* Seccion 2: Market Share & Top Familias */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <MarketShareChart
                                    data={advancedData?.marketShare}
                                    meta={advancedData?.meta}
                                    allFamilies={allFamilies}
                                    selectedFamilies={selectedFamilies}
                                    onToggleFamily={toggleFamily}
                                    onSelectAll={selectAll}
                                    onClearAll={clearAll}
                                    loading={isLoadingAdv}
                                />

                                <RankingFamiliasChart
                                    data={filteredVentasPorFamilia}
                                    year={advancedData?.meta?.anoActual}
                                    loading={isLoadingAdv}
                                />
                            </div>

                            {/* Seccion 3: Rendimiento Anual Acumulado */}
                            <RendimientoAnualChart
                                data={advancedData?.rendimientoAnual}
                                meta={advancedData?.meta}
                                loading={isLoadingAdv}
                            />

                            {/* Seccion 4: Tendencias por Categoría */}
                            <TendenciasChart
                                data={tendencias}
                                selectedFamilies={selectedFamilies}
                                allFamilies={allFamilies}
                                onToggleFamily={toggleFamily}
                                onSelectAll={selectAll}
                                onClearAll={clearAll}
                                loading={isLoadingTrends}
                            />
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
