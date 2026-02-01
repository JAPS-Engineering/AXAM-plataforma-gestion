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
import { TendenciasTable } from "@/components/ventas/TendenciasTable";
import { FiltersBar } from "@/components/filters-bar";

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

    // Filtros state
    const [marca, setMarca] = useState("");

    // Params computados para la API
    const apiParams = useMemo(() => {
        if (periodMode === "preset") {
            return { meses, marca };
        } else {
            return { start: customRange.start, end: customRange.end, marca };
        }
    }, [periodMode, meses, customRange, marca]);

    const { data: resumenData, isLoading, error } = useQuery({
        queryKey: ["ventas-resumen", apiParams],
        queryFn: () => fetchVentasResumen(apiParams as any, marca || undefined),
        enabled: periodMode === "preset" || (!!customRange.start && !!customRange.end)
    });

    // Query Avanzados
    const computedAdvancedParams = useMemo(() => {
        const params: any = { marca };
        if (periodMode === "custom") {
            params.start = customRange.start;
            params.end = customRange.end;
        } else {
            params.start = getPastMonth(meses - 1);
            params.end = getCurrentMonth();
        }
        return params;
    }, [periodMode, customRange, meses, marca]);

    const { data: advancedData, isLoading: isLoadingAdv } = useQuery({
        queryKey: ["graficos-avanzados", computedAdvancedParams],
        queryFn: () => fetchGraficosAvanzados(computedAdvancedParams),
    });

    const { data: tendencias, isLoading: isLoadingTrends } = useQuery({
        queryKey: ["ventas-tendencias", computedAdvancedParams],
        queryFn: () => fetchVentasTendencias(computedAdvancedParams, marca || undefined),
    });

    const isLoadingAll = isLoading || isLoadingAdv || isLoadingTrends;

    // Fix KPI Growth Calculation (Frontend patch to avoid 0 sales from current incomplete month)
    const correctedResumenData = useMemo(() => {
        if (!resumenData) return null;

        let growth = resumenData.kpis.crecimiento;
        const items = resumenData.ventasMensuales || [];

        if (items.length > 0) {
            const currentMonthKey = getCurrentMonth();
            const lastItem = items[items.length - 1];
            const lastItemKey = `${lastItem.ano}-${String(lastItem.mes).padStart(2, '0')}`;

            let comparisonValue = lastItem.montoNeto;

            // If last item is current incomplete month, try to use previous month
            if (lastItemKey === currentMonthKey && items.length > 1) {
                comparisonValue = items[items.length - 2].montoNeto;
            }

            // Recalculate vs Average
            const avg = resumenData.kpis.promedioMensual || 1;
            growth = ((comparisonValue - avg) / avg) * 100;
        }

        return {
            ...resumenData,
            kpis: {
                ...resumenData.kpis,
                crecimiento: growth
            }
        };
    }, [resumenData]);

    // --- Lógica de Grupos de Familias ---
    interface FamilyGroup {
        id: string;
        name: string;
        families: string[];
        color: string;
    }

    const [familyGroups, setFamilyGroups] = useState<FamilyGroup[]>([]);
    const [groupsInitialized, setGroupsInitialized] = useState(false);

    // Persistencia en LocalStorage
    useEffect(() => {
        const saved = localStorage.getItem("familyGroups");
        if (saved) {
            try {
                setFamilyGroups(JSON.parse(saved));
            } catch (e) {
                console.error("Error parsing saved groups", e);
            }
        }
        setGroupsInitialized(true);
    }, []);

    useEffect(() => {
        if (groupsInitialized) {
            localStorage.setItem("familyGroups", JSON.stringify(familyGroups));
        }
    }, [familyGroups, groupsInitialized]);

    // Paleta extendida
    const EXTENDED_PALETTE = [
        '#4f46e5', '#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1', '#14b8a6',
        '#ef4444', '#f97316', '#84cc16', '#22c55e', '#0ea5e9', '#3b82f6', '#a855f7', '#d946ef',
        '#f43f5e', '#64748b', '#78716c', '#0f766e', '#b45309', '#be185d', '#4338ca', '#1d4ed8'
    ];

    const groupedData = useMemo(() => {
        if (!advancedData?.marketShare || !advancedData?.ventasPorFamilia) return { marketShare: [], ranking: [], displayFamilies: [], rawFamilies: [], allEntities: [] };

        const marketShareRaw = advancedData.marketShare;
        const rankingRaw = advancedData.ventasPorFamilia;

        // 1. Identificar familias que están en algun grupo
        const groupedFamilyNames = new Set<string>();
        familyGroups.forEach(g => g.families.forEach(f => groupedFamilyNames.add(f)));

        // 2. Data "Suelt" (No agrupada)
        const looseMarketShare = marketShareRaw.filter(m => !groupedFamilyNames.has(m.name));
        const looseRanking = rankingRaw.filter(r => !groupedFamilyNames.has(r.familia));

        // 3. Data Agrupada
        const totalVenta = advancedData.meta?.totalVentaPeriodo || marketShareRaw.reduce((acc, curr) => acc + curr.value, 0) || 0;

        const groupsMarketShare = familyGroups.map(g => {
            const value = marketShareRaw
                .filter(m => g.families.includes(m.name))
                .reduce((acc, curr) => acc + curr.value, 0);

            const pctVal = totalVenta > 0 ? (value / totalVenta) * 100 : 0;
            const percentage = `${pctVal.toFixed(1)}%`;

            return { name: g.name, value, percentage, isGroup: true, color: g.color, families: g.families };
        }).filter(g => g.value > 0);

        const groupsRanking = familyGroups.map(g => {
            const groupItems = rankingRaw.filter(r => g.families.includes(r.familia));
            const totalMonto = groupItems.reduce((acc, curr) => acc + curr.totalMonto, 0);
            const totalCantidad = groupItems.reduce((acc, curr) => acc + curr.totalCantidad, 0);
            return {
                familia: g.name,
                totalMonto,
                totalCantidad,
                isGroup: true,
                color: g.color
            };
        }).filter(g => g.totalMonto > 0);

        // 4. Combinar y Ordenar
        const combinedMarketShare = [...looseMarketShare, ...groupsMarketShare].sort((a, b) => b.value - a.value);
        const combinedRankingDesc = [...looseRanking, ...groupsRanking].sort((a, b) => b.totalMonto - a.totalMonto);

        // Raw families for legacy support
        const raw = marketShareRaw.map(m => m.name).sort();

        return {
            marketShare: combinedMarketShare,
            ranking: combinedRankingDesc,
            allEntities: combinedMarketShare.map(m => m.name),
            rawFamilies: raw
        };
    }, [advancedData, familyGroups]);

    // Filtrado visual
    const [selectedFamilies, setSelectedFamilies] = useState<string[]>([]);
    const hasInitializedFamilies = useRef(false);

    // Initial load selection
    // Initial load selection and sync with new groups
    useEffect(() => {
        if (groupedData.allEntities.length > 0) {
            if (!hasInitializedFamilies.current) {
                setSelectedFamilies(groupedData.allEntities);
                hasInitializedFamilies.current = true;
            } else {
                // If we already initialized, we should check if there are NEW groups that should be selected by default
                // This happens when a user creates a group
                setSelectedFamilies(prev => {
                    const currentSet = new Set(prev);
                    const newSelection = [...prev];
                    let changed = false;

                    groupedData.allEntities.forEach(entity => {
                        // If it's a group (we can know because it's in our known groups list) and not currently selected...
                        // actually simpler: if it's NOT in prev, and it IS a group name, add it.
                        // We can identify groups by checking if the name exists in familyGroups
                        const isGroup = familyGroups.some(g => g.name === entity);
                        if (isGroup && !currentSet.has(entity)) {
                            newSelection.push(entity);
                            changed = true;
                        }
                    });

                    return changed ? newSelection : prev;
                });
            }
        }
    }, [groupedData.allEntities, familyGroups]);

    const toggleEntity = (entityName: string) => {
        setSelectedFamilies(prev =>
            prev.includes(entityName)
                ? prev.filter(f => f !== entityName)
                : [...prev, entityName]
        );
    };

    const selectAllEntities = () => setSelectedFamilies(groupedData.allEntities);
    const clearAllEntities = () => setSelectedFamilies([]);

    // Aliases for compatibility
    const allFamilies = groupedData.rawFamilies;
    const toggleFamily = toggleEntity;
    const selectAll = selectAllEntities;
    const clearAll = clearAllEntities;

    // Filtrar data final para graficos
    const finalMarketShare = useMemo(() => {
        return groupedData.marketShare.filter(item => selectedFamilies.includes(item.name));
    }, [groupedData.marketShare, selectedFamilies]);

    const finalRanking = useMemo(() => {
        return groupedData.ranking.filter(item => selectedFamilies.includes(item.familia));
    }, [groupedData.ranking, selectedFamilies]);

    // State for Tendencias
    const [tendenciasMetric, setTendenciasMetric] = useState<"money" | "quantity">("money");

    const handleUpdateGroups = (newGroups: FamilyGroup[]) => {
        // Detect deleted groups to restore their families to selection
        const oldGroupIds = new Set(familyGroups.map(g => g.id));
        const newGroupIds = new Set(newGroups.map(g => g.id));

        // Find deleted groups
        const deletedGroups = familyGroups.filter(g => !newGroupIds.has(g.id));

        if (deletedGroups.length > 0) {
            const familiesToRestore = deletedGroups.flatMap(g => g.families);

            // Add released families to selection so they appear in charts
            setSelectedFamilies(prev => {
                const currentSet = new Set(prev);
                const nextSelection = [...prev];
                let changed = false;

                familiesToRestore.forEach(fam => {
                    if (!currentSet.has(fam)) {
                        nextSelection.push(fam);
                        changed = true;
                    }
                });

                return changed ? nextSelection : prev;
            });
        }

        setFamilyGroups(newGroups);
    };

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
                            <h1 className="text-xl font-bold text-slate-900">Análisis de Mercado</h1>
                            <p className="text-xs text-slate-500">Visualización de tendencias, market share y rendimiento</p>
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
                    </div>
                </header>

                <div className="bg-white border-b border-slate-200 px-6 py-2 flex items-center gap-4">
                    <div className="flex flex-col gap-1">
                        <label htmlFor="marca" className="text-[10px] uppercase font-bold text-slate-400">
                            Filtrar por Marca
                        </label>
                        <input
                            id="marca"
                            type="text"
                            value={marca}
                            onChange={(e) => setMarca(e.target.value)}
                            placeholder="Ej: KC"
                            className="w-32 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                        />
                    </div>
                </div>

                <main className="flex-1 overflow-auto p-6 scrollbar-thin scrollbar-thumb-slate-200">
                    {/* Resumen General */}
                    <div className="mb-6">
                        <ResumenKPIs kpis={correctedResumenData?.kpis} loading={isLoading} error={error} />
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
                                    data={finalMarketShare}
                                    meta={advancedData?.meta}
                                    allEntities={groupedData.allEntities}
                                    selectedEntities={selectedFamilies}
                                    onToggleEntity={toggleEntity}
                                    onSelectAll={selectAllEntities}
                                    onClearAll={clearAllEntities}
                                    loading={isLoadingAdv}
                                    familyGroups={familyGroups}
                                    rawFamilies={groupedData.rawFamilies}
                                    onUpdateGroups={handleUpdateGroups}
                                    colors={EXTENDED_PALETTE}
                                    marketShareRaw={advancedData?.marketShare}
                                />

                                <RankingFamiliasChart
                                    data={finalRanking}
                                    year={advancedData?.meta?.anoActual}
                                    loading={isLoadingAdv}
                                    colors={EXTENDED_PALETTE}
                                    allEntities={groupedData.allEntities} // Para saber indices de colores consistentes
                                />
                            </div>

                            {/* Seccion 3: Rendimiento Anual Acumulado */}
                            <RendimientoAnualChart
                                data={advancedData?.rendimientoAnual}
                                meta={advancedData?.meta}
                                loading={isLoadingAdv}
                            />

                            {/* Seccion 4: Tendencias por Categoría */}
                            <div className="space-y-6">
                                <TendenciasChart
                                    data={tendencias}
                                    selectedFamilies={selectedFamilies}
                                    allEntities={groupedData.allEntities}
                                    rawFamilies={groupedData.rawFamilies}
                                    familyGroups={familyGroups}
                                    onToggleFamily={toggleFamily}
                                    onSelectAll={selectAll}
                                    onClearAll={clearAll}
                                    loading={isLoadingTrends}
                                    metric={tendenciasMetric}
                                    onMetricChange={setTendenciasMetric}
                                />

                                <TendenciasTable
                                    data={tendencias}
                                    metric={tendenciasMetric}
                                    selectedFamilies={selectedFamilies}
                                    loading={isLoadingTrends}
                                    familyGroups={familyGroups}
                                />
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
