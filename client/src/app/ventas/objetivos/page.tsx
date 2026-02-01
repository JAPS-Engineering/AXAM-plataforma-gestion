"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { Sidebar } from "@/components/sidebar";
import { RefreshCw, TrendingUp, Target, DollarSign, Wallet, Calendar as CalendarIcon, ChevronLeft, Info, PieChart as PieChartIcon, Filter, X } from "lucide-react";
import Link from "next/link";
import VendedoresChart from "@/components/ventas/VendedoresChart";
import VendedoresTable from "@/components/ventas/VendedoresTable";
import { MarketShareVendedoresChart } from "@/components/ventas/MarketShareVendedoresChart";
import { RankingVendedoresChart } from "@/components/ventas/RankingVendedoresChart";
import { MarketShareChart } from "@/components/ventas/MarketShareChart";
import { ResumenMesActualTable } from "@/components/ventas/ResumenMesActualTable";
import { cn } from "@/lib/utils";

// Helpers for dates (Backend uses unpadded months e.g. "2024-1")
const getCurrentMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const getPastMonth = (monthsAgo: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() - monthsAgo);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const EXTENDED_PALETTE = [
    '#4f46e5', '#10b981', '#3b82f6', '#f59e0b', '#ef4444',
    '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#64748b',
    '#6366f1', '#14b8a6', '#ef4444', '#f97316', '#84cc16',
    '#22c55e', '#0ea5e9', '#3b82f6', '#a855f7', '#d946ef',
    '#f43f5e', '#64748b', '#78716c', '#0f766e', '#b45309', '#be185d', '#4338ca', '#1d4ed8'
];

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
    ventasPorFamilia?: Record<string, Record<string, number>>; // New: Seller -> Family -> Total
    vendedores?: Record<string, string>; // Code -> Name
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
    const [selectedSellerForFamily, setSelectedSellerForFamily] = useState<string>("");

    // --- State for Advanced Chart (Groups & Filters) ---
    interface FamilyGroup {
        id: string;
        name: string;
        families: string[];
        color: string;
    }
    const [familyGroups, setFamilyGroups] = useState<FamilyGroup[]>([]);
    const [selectedFamilies, setSelectedFamilies] = useState<string[]>([]);
    const hasInitializedFamilies = React.useRef(false);

    // --- State for Trend & Participation Chart Seller Selection ---
    const [selectedVendedoresTrend, setSelectedVendedoresTrend] = useState<string[]>([]);
    const [showSellerFilter, setShowSellerFilter] = useState(false);
    const [sellerSearchTerm, setSellerSearchTerm] = useState("");
    const hasInitializedSellersTrend = React.useRef(false);

    // Load groups and trend sellers from localStorage
    useEffect(() => {
        const savedGroups = localStorage.getItem("familyGroups_Objetivos");
        if (savedGroups) {
            try { setFamilyGroups(JSON.parse(savedGroups)); } catch (e) { console.error(e); }
        }
        const savedSellers = localStorage.getItem("selectedVendedoresTrend_Objetivos");
        if (savedSellers) {
            try { setSelectedVendedoresTrend(JSON.parse(savedSellers)); } catch (e) { console.error(e); }
        }
    }, []);

    // Save groups
    useEffect(() => {
        if (familyGroups.length > 0) {
            localStorage.setItem("familyGroups_Objetivos", JSON.stringify(familyGroups));
        }
    }, [familyGroups]);

    // Save Trend Sellers
    useEffect(() => {
        if (selectedVendedoresTrend.length > 0) {
            localStorage.setItem("selectedVendedoresTrend_Objetivos", JSON.stringify(selectedVendedoresTrend));
        }
    }, [selectedVendedoresTrend]);

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
                setSelectedSummaryMonth(`${latest.ano}-${String(latest.mes).padStart(2, '0')}`);
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
                const dataSourceKey = `${ano}-${String(mes).padStart(2, '0')}`;

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

            let totalRealPeriodo = 0; // Total sales in filtered period

            // 1. Calculate Period Total (Filtered)
            historicMonths.forEach(m => {
                const key = `${m.ano}-${String(m.mes).padStart(2, '0')}`;
                Object.keys(data.ventas).forEach(vendedor => {
                    totalRealPeriodo += data.ventas[vendedor]?.[key] || 0;
                });
            });

            // 2. Calculate Current Month KPIs (Try meta first, then fallback)
            let currentMonthSales = 0;
            let currentMonthTarget = 0;

            if ((data.meta as any).currentMonthStats) {
                currentMonthSales = (data.meta as any).currentMonthStats.sales;
                currentMonthTarget = (data.meta as any).currentMonthStats.target;
            } else {
                // Fallback for older API versions or missing meta
                const currentMonthKey = getCurrentMonth();
                const unpaddedCurrentMonthKey = `${new Date().getFullYear()}-${new Date().getMonth() + 1}`;
                Object.keys(data.ventas).forEach(vendedor => {
                    const venta = data.ventas[vendedor]?.[currentMonthKey] ?? data.ventas[vendedor]?.[unpaddedCurrentMonthKey] ?? 0;
                    const objetivo = data.objetivos[vendedor]?.[currentMonthKey] ?? data.objetivos[vendedor]?.[unpaddedCurrentMonthKey] ?? 0;
                    if (objetivo > 0) {
                        currentMonthSales += venta;
                        currentMonthTarget += objetivo;
                    }
                });
            }

            const cumplimiento = currentMonthTarget > 0 ? (currentMonthSales / currentMonthTarget) * 100 : 0;

            return {
                kpi1: { label: 'Venta Real (Periodo)', value: totalRealPeriodo },
                kpi2: { label: 'Objetivos (Mes Actual)', value: currentMonthTarget },
                kpi3: { label: 'Cumplimiento (Mes Actual)', value: cumplimiento }
            };
        }

        // MODE 2: PLANNING (Future)
        else {
            const futureMonths = data?.meta.futureMonthsArray || [];
            let totalPropongo = 0; // Salesperson Promise
            let totalMeta = 0;     // Company Target

            // For Coverage %: Only count where Objective > 0
            let coveragePropongo = 0;
            let coverageTarget = 0;

            futureMonths.forEach(m => {
                const key = `${m.ano}-${String(m.mes).padStart(2, '0')}`;
                const allSellers = Object.keys(data?.vendedores || {});

                allSellers.forEach(vendedor => {
                    const unpaddedKey = `${m.ano}-${m.mes}`;
                    const propRaw = data?.proyecciones[vendedor]?.[key] ?? data?.proyecciones[vendedor]?.[unpaddedKey] ?? 0;
                    const objRaw = data?.objetivos[vendedor]?.[key] ?? data?.objetivos[vendedor]?.[unpaddedKey] ?? 0;

                    const prop = Number(propRaw) || 0;
                    const obj = Number(objRaw) || 0;

                    totalPropongo += prop;
                    totalMeta += obj;

                    // Coverage: Only count where both Objective AND Proposal exist (> 0)
                    if (obj > 0 && prop > 0) {
                        coveragePropongo += prop;
                        coverageTarget += obj;
                    }
                });
            });

            const cobertura = coverageTarget > 0 ? (coveragePropongo / coverageTarget) * 100 : 0;

            return {
                kpi1: { label: 'Planificación (Propuestas)', value: totalPropongo },
                kpi2: { label: 'Meta Global (Objetivos)', value: totalMeta },
                kpi3: { label: 'Cobertura del Plan', value: cobertura }
            };
        }
    }, [data, pageMode]);

    // Initialize Trend Chart Sellers
    useEffect(() => {
        if (data?.vendedores && !hasInitializedSellersTrend.current) {
            const sellerCodes = Object.keys(data.vendedores).filter(code => data.vendedores![code] !== "Sin Asignar");
            if (selectedVendedoresTrend.length === 0) {
                setSelectedVendedoresTrend(sellerCodes);
            }
            hasInitializedSellersTrend.current = true;
        }
    }, [data, selectedVendedoresTrend.length]);

    const toggleTrendSeller = (code: string) => {
        setSelectedVendedoresTrend(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
    };
    const selectAllTrendSellers = () => {
        if (data?.vendedores) {
            setSelectedVendedoresTrend(Object.keys(data.vendedores).filter(code => data.vendedores![code] !== "Sin Asignar"));
        }
    };
    const clearAllTrendSellers = () => setSelectedVendedoresTrend([]);

    // --- Process Data for MarketShareChart ---
    const groupedData = useMemo(() => {
        if (!data || !data.ventasPorFamilia || !selectedSellerForFamily) {
            return { marketShare: [], allEntities: [], rawFamilies: [] };
        }

        const rawSales = data.ventasPorFamilia[selectedSellerForFamily] || {};
        // Convert to array
        const marketShareRaw = Object.entries(rawSales).map(([name, value]) => ({ name, value }));

        // 1. Identify grouped families
        const groupedFamilyNames = new Set<string>();
        familyGroups.forEach(g => g.families.forEach(f => groupedFamilyNames.add(f)));

        // 2. Separate loose vs grouped
        const looseItems = marketShareRaw.filter(m => !groupedFamilyNames.has(m.name));

        // 3. Calculate groups
        const totalVenta = marketShareRaw.reduce((acc, curr) => acc + curr.value, 0) || 0;

        const groupItems = familyGroups.map(g => {
            const value = marketShareRaw
                .filter(m => g.families.includes(m.name))
                .reduce((acc, curr) => acc + curr.value, 0);

            return {
                name: g.name,
                value,
                percentage: totalVenta > 0 ? ((value / totalVenta) * 100).toFixed(1) + '%' : '0%',
                isGroup: true,
                color: g.color,
                families: g.families
            };
        }).filter(g => g.value > 0);

        // 4. Combine
        const looseItemsWithPct = looseItems.map(item => ({
            ...item,
            percentage: totalVenta > 0 ? ((item.value / totalVenta) * 100).toFixed(1) + '%' : '0%'
        }));

        const combined = [...looseItemsWithPct, ...groupItems].sort((a, b) => b.value - a.value);

        return {
            marketShare: combined,
            imageOfRaw: marketShareRaw, // For smart select
            allEntities: combined.map(m => m.name),
            rawFamilies: marketShareRaw.map(m => m.name).sort()
        };
    }, [data, selectedSellerForFamily, familyGroups]);

    // Sync Selection
    useEffect(() => {
        if (groupedData.allEntities.length > 0) {
            if (!hasInitializedFamilies.current) {
                setSelectedFamilies(groupedData.allEntities);
                hasInitializedFamilies.current = true;
            } else {
                // If new groups appear (created by user), select them automatically
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
    }, [groupedData.allEntities, familyGroups]);

    const toggleEntity = (entity: string) => {
        setSelectedFamilies(prev => prev.includes(entity) ? prev.filter(e => e !== entity) : [...prev, entity]);
    };
    const selectAllEntities = () => setSelectedFamilies(groupedData.allEntities);
    const clearAllEntities = () => setSelectedFamilies([]);
    const handleUpdateGroups = (groups: FamilyGroup[]) => setFamilyGroups(groups);

    // Set default selected seller
    useEffect(() => {
        if (data?.vendedores && !selectedSellerForFamily) {
            const validSellers = Object.entries(data.vendedores).filter(([_, name]) => name !== "Sin Asignar");
            if (validSellers.length > 0) setSelectedSellerForFamily(validSellers[0][0]);
        }
    }, [data, selectedSellerForFamily]);


    const formatCLP = (val: number) =>
        new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(val);



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
                                    Planificación
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
                                            <option value={12}>Último año</option>
                                            <option value={24}>Últimos 2 años</option>
                                            <option value={36}>Últimos 3 años</option>
                                            <option value={48}>Últimos 4 años</option>
                                            <option value={60}>Últimos 5 años</option>
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
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block w-56 p-2 bg-slate-800 text-white text-xs rounded-lg shadow-lg z-50 text-center pointer-events-none">
                                                Cálculo: Planificación (Propuestas) / Meta Global (Objetivos)
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-slate-800"></div>
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
                            vendedores={data?.vendedores || {}}
                            onSave={handleSaveTarget}
                            loading={loading}
                            currentMonthKey={getCurrentMonth()}
                        />
                    )}

                    {/* Chart Container - Conditionally Hidden in Planning Mode */}
                    {pageMode === "history" && data && (
                        <>
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-2">
                                        <TrendingUp className="h-5 w-5 text-indigo-500" />
                                        <h2 className="text-lg font-bold text-slate-800">Tendencia por Vendedor (Real)</h2>
                                    </div>

                                    {/* Seller Filter Popover */}
                                    <div className="relative">
                                        <button
                                            onClick={() => setShowSellerFilter(!showSellerFilter)}
                                            className={cn(
                                                "p-2 rounded-lg transition-colors border",
                                                showSellerFilter ? "bg-indigo-50 border-indigo-200 text-indigo-600" : "hover:bg-slate-50 border-slate-200 text-slate-500"
                                            )}
                                            title="Filtrar Vendedores"
                                        >
                                            <Filter className="h-5 w-5" />
                                        </button>

                                        {showSellerFilter && (
                                            <>
                                                <div className="fixed inset-0 z-40" onClick={() => setShowSellerFilter(false)} />
                                                <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 p-4 animate-in fade-in zoom-in duration-200 origin-top-right">
                                                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                                                        <span className="text-sm font-bold text-slate-900">Filtrar Vendedores</span>
                                                        <button onClick={() => setShowSellerFilter(false)}><X className="h-4 w-4 text-slate-400" /></button>
                                                    </div>
                                                    <div className="flex gap-2 mb-3">
                                                        <button onClick={selectAllTrendSellers} className="flex-1 text-[10px] font-bold py-1.5 bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100">Todos</button>
                                                        <button onClick={clearAllTrendSellers} className="flex-1 text-[10px] font-bold py-1.5 bg-slate-50 text-slate-600 rounded-md hover:bg-slate-100">Ninguno</button>
                                                    </div>
                                                    <div className="px-1 mb-2">
                                                        <div className="relative">
                                                            <input
                                                                type="text"
                                                                placeholder="Buscar vendedor..."
                                                                value={sellerSearchTerm}
                                                                onChange={(e) => setSellerSearchTerm(e.target.value)}
                                                                className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
                                                            />
                                                            <Filter className="absolute left-2 top-1.5 h-3.5 w-3.5 text-slate-400" />
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1 max-h-60 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200">
                                                        {Object.entries(data?.vendedores || {})
                                                            .filter(([_, name]) => name !== "Sin Asignar" && name.toLowerCase().includes(sellerSearchTerm.toLowerCase()))
                                                            .map(([code, name], idx) => {
                                                                const isSelected = selectedVendedoresTrend.includes(code);
                                                                return (
                                                                    <label key={code} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={isSelected}
                                                                            onChange={() => toggleTrendSeller(code)}
                                                                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                                        />
                                                                        <div
                                                                            className="w-2 h-2 rounded-full flex-shrink-0"
                                                                            style={{ backgroundColor: EXTENDED_PALETTE[Object.keys(data?.vendedores || {}).indexOf(code) % EXTENDED_PALETTE.length] }}
                                                                        />
                                                                        <span className={cn("text-xs transition-colors", isSelected ? "text-slate-900 font-medium" : "text-slate-500")}>
                                                                            {name}
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

                                <div className="h-[400px]">
                                    <VendedoresChart
                                        data={data?.ventas || {}}
                                        objetivos={data?.objetivos || {}}
                                        proyecciones={data?.proyecciones || {}}
                                        vendedores={data?.vendedores || {}}
                                        view="Real"
                                        anio={data?.meta?.anoActual || new Date().getFullYear()}
                                        loading={loading}
                                        monthsArray={data?.meta?.monthsArray}
                                        selectedVendedores={selectedVendedoresTrend}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <MarketShareVendedoresChart
                                    data={data?.ranking.filter(r => {
                                        // Find code for this name
                                        const code = Object.entries(data?.vendedores || {}).find(([_, name]) => name === r.name)?.[0];
                                        return code && selectedVendedoresTrend.includes(code);
                                    })}
                                    loading={loading}
                                    colors={EXTENDED_PALETTE}
                                    allSellers={data?.vendedores || {}}
                                />
                                <RankingVendedoresChart
                                    data={data?.ranking.filter(r => {
                                        const code = Object.entries(data?.vendedores || {}).find(([_, name]) => name === r.name)?.[0];
                                        return code && selectedVendedoresTrend.includes(code);
                                    })}
                                    loading={loading}
                                    colors={EXTENDED_PALETTE}
                                    allSellers={data?.vendedores || {}}
                                />
                            </div>

                            {/* Family Analysis Section (MarketShareChart) */}
                            <div className="flex justify-end mb-2">
                                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                                    <span className="text-sm text-slate-500 font-medium">Vendedor:</span>
                                    <select
                                        value={selectedSellerForFamily}
                                        onChange={(e) => {
                                            setSelectedSellerForFamily(e.target.value);
                                            // Reset selection on seller change to avoid stale state?
                                            // Actually better to keep it if families are similar, but for safety:
                                            hasInitializedFamilies.current = false;
                                        }}
                                        className="text-sm bg-transparent border-none focus:outline-none font-bold text-indigo-700 cursor-pointer min-w-[150px]"
                                    >
                                        {Object.entries(data?.vendedores || {})
                                            .filter(([_, name]) => name !== "Sin Asignar")
                                            .map(([code, name]) => (
                                                <option key={code} value={code}>
                                                    {name}
                                                </option>
                                            ))}
                                    </select>
                                </div>
                            </div>

                            {groupedData.marketShare.length > 0 && groupedData.marketShare.reduce((a, b) => a + b.value, 0) > 0 ? (
                                <MarketShareChart
                                    data={groupedData.marketShare}
                                    meta={{ anoActual: data?.meta?.anoActual || new Date().getFullYear(), totalVentaPeriodo: groupedData.marketShare.reduce((a, b) => a + b.value, 0) }}
                                    allEntities={groupedData.allEntities}
                                    selectedEntities={selectedFamilies}
                                    onToggleEntity={toggleEntity}
                                    onSelectAll={selectAllEntities}
                                    onClearAll={clearAllEntities}
                                    loading={loading}
                                    familyGroups={familyGroups}
                                    rawFamilies={groupedData.rawFamilies}
                                    onUpdateGroups={handleUpdateGroups}
                                    colors={EXTENDED_PALETTE}
                                    title={`Mix de Ventas - ${data?.vendedores?.[selectedSellerForFamily] || selectedSellerForFamily}`}
                                    subtitle="Distribución por Familia y Grupos"
                                />
                            ) : (
                                <div className="bg-white p-12 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
                                    <div className="bg-slate-50 p-4 rounded-full mb-4">
                                        <PieChartIcon className="h-8 w-8 text-slate-400" />
                                    </div>
                                    <h3 className="text-lg font-medium text-slate-900 mb-1">Sin datos de ventas</h3>
                                    <p className="text-slate-500 max-w-sm">
                                        El vendedor seleccionado no registra ventas para el periodo y filtros actuales.
                                    </p>
                                </div>
                            )}
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
                                vendedores={data?.vendedores || {}}
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
