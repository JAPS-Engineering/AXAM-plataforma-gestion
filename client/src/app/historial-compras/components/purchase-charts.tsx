"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchComprasGraficos } from "@/lib/api";
import { useState, useMemo, useEffect } from "react";
import { MarketShareChart } from "@/components/ventas/MarketShareChart";
import { RankingFamiliasChart } from "@/components/ventas/RankingFamiliasChart";
import { RendimientoAnualChart } from "@/components/ventas/RendimientoAnualChart";
import { TendenciasChart } from "@/components/ventas/TendenciasChart";
import { TendenciasTable } from "@/components/ventas/TendenciasTable";

interface PurchaseChartsProps {
    startDate: Date | undefined;
    endDate: Date | undefined;
}

interface FamilyGroup {
    id: string;
    name: string;
    families: string[];
    color: string;
}

export function PurchaseCharts({ startDate, endDate }: PurchaseChartsProps) {
    // --- Year State ---
    const currentYear = new Date().getFullYear();
    const [yearRef, setYearRef] = useState<number>(currentYear);
    const [yearComp, setYearComp] = useState<number>(currentYear - 1);

    // --- Data Fetching ---
    const apiParams = useMemo(() => {
        const formatDate = (date: Date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        return {
            fechaInicio: startDate ? formatDate(startDate) : undefined,
            fechaFin: endDate ? formatDate(endDate) : undefined,
            yearRef,
            yearComp
        };
    }, [startDate, endDate, yearRef, yearComp]);

    const { data: chartData, isLoading, isFetching, error } = useQuery({
        queryKey: ["compras-graficos", apiParams],
        queryFn: () => fetchComprasGraficos(apiParams),
        placeholderData: keepPreviousData
    });

    // --- Family Groups Logic (Shared with Sales) ---
    const [familyGroups, setFamilyGroups] = useState<FamilyGroup[]>([]);
    const [groupsInitialized, setGroupsInitialized] = useState(false);

    // Load groups from localStorage (key 'familyGroups' to share with Sales module)
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

    // Save groups to localStorage
    useEffect(() => {
        if (groupsInitialized) {
            localStorage.setItem("familyGroups", JSON.stringify(familyGroups));
        }
    }, [familyGroups, groupsInitialized]);

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

    // --- Data Processing for Groups ---
    const EXTENDED_PALETTE = [
        '#4f46e5', '#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1', '#14b8a6',
        '#ef4444', '#f97316', '#84cc16', '#22c55e', '#0ea5e9', '#3b82f6', '#a855f7', '#d946ef',
        '#f43f5e', '#64748b', '#78716c', '#0f766e', '#b45309', '#be185d', '#4338ca', '#1d4ed8'
    ];

    const groupedData = useMemo(() => {
        if (!chartData) return { marketShare: [], ranking: [], displayFamilies: [], rawFamilies: [], allEntities: [] };

        const marketShareRaw = chartData.marketShare || [];
        const rankingRaw = chartData.ventasPorFamilia || [];

        // 1. Identify families in groups
        const groupedFamilyNames = new Set<string>();
        familyGroups.forEach(g => g.families.forEach(f => groupedFamilyNames.add(f)));

        // 2. Loose Data
        const looseMarketShare = marketShareRaw.filter(m => !groupedFamilyNames.has(m.name));
        const looseRanking = rankingRaw.filter(r => !groupedFamilyNames.has(r.familia));

        // 3. Grouped Data
        const totalVenta = chartData.meta?.totalVentaPeriodo || 1;

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

        // 4. Combine and Sort
        const combinedMarketShare = [...looseMarketShare, ...groupsMarketShare].sort((a, b) => b.value - a.value);
        const combinedRankingDesc = [...looseRanking, ...groupsRanking].sort((a, b) => b.totalMonto - a.totalMonto);

        const raw = marketShareRaw.map(m => m.name).sort();

        return {
            marketShare: combinedMarketShare,
            ranking: combinedRankingDesc,
            allEntities: combinedMarketShare.map(m => m.name),
            rawFamilies: raw
        };
    }, [chartData, familyGroups]);

    // --- Selection State ---
    const [selectedFamilies, setSelectedFamilies] = useState<string[]>([]);
    const [hasInitializedFamilies, setHasInitializedFamilies] = useState(false);

    // Initial load selection
    useEffect(() => {
        if (groupedData.allEntities.length > 0) {
            if (!hasInitializedFamilies) {
                setSelectedFamilies(groupedData.allEntities);
                setHasInitializedFamilies(true);
            } else {
                // Sync new groups creation
                setSelectedFamilies(prev => {
                    const currentSet = new Set(prev);
                    const newSelection = [...prev];
                    let changed = false;

                    groupedData.allEntities.forEach(entity => {
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
    }, [groupedData.allEntities, familyGroups, hasInitializedFamilies]);

    const toggleEntity = (entityName: string) => {
        setSelectedFamilies(prev =>
            prev.includes(entityName)
                ? prev.filter(f => f !== entityName)
                : [...prev, entityName]
        );
    };

    const selectAllEntities = () => setSelectedFamilies(groupedData.allEntities);
    const clearAllEntities = () => setSelectedFamilies([]);

    // --- Filtering Final Data ---
    const finalMarketShare = useMemo(() => {
        return groupedData.marketShare.filter(item => selectedFamilies.includes(item.name));
    }, [groupedData.marketShare, selectedFamilies]);

    const finalRanking = useMemo(() => {
        return groupedData.ranking.filter(item => selectedFamilies.includes(item.familia));
    }, [groupedData.ranking, selectedFamilies]);

    // --- Trends State ---
    const [tendenciasMetric, setTendenciasMetric] = useState<"money" | "quantity">("money");

    // --- Render ---
    // Only show full spinner on INITIAL load (no data yet)
    if (isLoading && !chartData) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-96 text-red-600">
                Error al cargar gráficos: {(error as Error).message}
            </div>
        );
    }

    if (!chartData) return null;

    return (
        <div className="space-y-6 pb-10 animate-in fade-in duration-300">
            {/* Seccion 1: Market Share & Top Familias */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <MarketShareChart
                    title="Participación de Compras (Spend Share)"
                    subtitle={`Distribución del gasto por familia (${chartData.meta.anoActual})`}
                    data={finalMarketShare}
                    meta={chartData.meta}
                    allEntities={groupedData.allEntities}
                    selectedEntities={selectedFamilies}
                    onToggleEntity={toggleEntity}
                    onSelectAll={selectAllEntities}
                    onClearAll={clearAllEntities}
                    loading={isLoading}
                    familyGroups={familyGroups}
                    rawFamilies={groupedData.rawFamilies}
                    onUpdateGroups={handleUpdateGroups}
                    colors={EXTENDED_PALETTE}
                    marketShareRaw={chartData.marketShare}
                />

                <RankingFamiliasChart
                    title="Ranking de Gasto por Familia"
                    data={finalRanking}
                    year={chartData.meta.anoActual}
                    loading={isLoading}
                    colors={EXTENDED_PALETTE}
                    allEntities={groupedData.allEntities}
                />
            </div>

            {/* Seccion 2: Rendimiento Anual Acumulado */}
            <RendimientoAnualChart
                title="Evolución de Gasto Anual"
                subtitle={`Progreso de gastos acumulados: ${chartData.meta.anoAnterior} vs ${chartData.meta.anoActual}`}
                data={chartData.rendimientoAnual}
                meta={chartData.meta}
                loading={isLoading}
                onYearRefChange={setYearRef}
                onYearCompChange={setYearComp}
            />

            {/* Seccion 3: Tendencias */}
            <div className="space-y-6">
                <TendenciasChart
                    title="Gastos Mensuales por Familia"
                    data={{ tendencias: chartData.tendencias, familias: groupedData.allEntities }}
                    selectedFamilies={selectedFamilies}
                    allEntities={groupedData.allEntities}
                    rawFamilies={groupedData.rawFamilies}
                    familyGroups={familyGroups}
                    onToggleFamily={toggleEntity}
                    onSelectAll={selectAllEntities}
                    onClearAll={clearAllEntities}
                    loading={isLoading}
                    metric={tendenciasMetric}
                    onMetricChange={setTendenciasMetric}
                />

                <TendenciasTable
                    data={{ tendencias: chartData.tendencias, familias: groupedData.allEntities }}
                    metric={tendenciasMetric}
                    selectedFamilies={selectedFamilies}
                    loading={isLoading}
                    familyGroups={familyGroups}
                />
            </div>
        </div>
    );
}
