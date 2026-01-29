import { useState, useEffect } from "react";
import { TrendingUp, Filter, X, List, Search as SearchIcon } from "lucide-react";
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar } from "recharts";
import { formatCLP, formatTooltipCLP } from "@/lib/utils";
import { VentasTendenciasResponse, TendenciaDataPoint } from "@/lib/api";

const PIE_COLORS = ['#4f46e5', '#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1', '#14b8a6'];

interface TendenciasChartProps {
    data: VentasTendenciasResponse | undefined;
    selectedFamilies: string[];
    allEntities: string[]; // This replaces allFamilies for the filter list
    rawFamilies: string[]; // For stable colors
    familyGroups: { name: string; families: string[]; color: string }[];
    onToggleFamily: (family: string) => void;
    onSelectAll: () => void;
    onClearAll: () => void;
    loading: boolean;
    metric: "money" | "quantity";
    onMetricChange: (metric: "money" | "quantity") => void;
}


export function TendenciasChart({
    data,
    selectedFamilies,
    allEntities,
    rawFamilies,
    familyGroups,
    onToggleFamily,
    onSelectAll,
    onClearAll,
    loading,
    metric,
    onMetricChange
}: TendenciasChartProps) {
    const [showFilterDropdown, setShowFilterDropdown] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedMonthLabel, setSelectedMonthLabel] = useState<string>("");
    const [searchTerm, setSearchTerm] = useState("");


    // Inicializar mes seleccionado cuando cambia la data o se abre el modal
    useEffect(() => {
        if (data?.tendencias && data.tendencias.length > 0 && !selectedMonthLabel) {
            // Default al último mes (más reciente)
            setSelectedMonthLabel(data.tendencias[data.tendencias.length - 1].label);
        }
    }, [data, selectedMonthLabel]);

    if (loading) {
        return (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative h-[400px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    // Calcule effective raw families based on groups
    const effectiveSelectedRawFamilies = (() => {
        const rawSet = new Set<string>();

        selectedFamilies.forEach(selected => {
            const group = familyGroups?.find(g => g.name === selected);
            if (group) {
                group.families.forEach(f => rawSet.add(f));
            } else {
                // It's a raw family (loose)
                rawSet.add(selected);
            }
        });

        return Array.from(rawSet);
    })();

    // Calculate sorted families for the stack (Smallest to Largest -> Top is Largest in Recharts default? No)
    // Recharts draws first bar at bottom. 
    // User wants "arriba queden de mayor a menor" (Largest at top).
    // So Bottom must be Smallest? No, Bottom is the first drawn.
    // If we draw Smallest first (Bottom), then Largest will be Last (Top).
    // So we need to sort Ascending by value.
    const sortedEffectiveFamilies = (() => {
        if (!data?.tendencias) return [];

        // Calculate total weight for each family across the dataset (or specifically last month, or max... use sum)
        const familyWeights = new Map<string, number>();
        effectiveSelectedRawFamilies.forEach(fam => {
            const total = data.tendencias.reduce((acc, curr) => {
                const dp = curr[fam] as TendenciaDataPoint | undefined;
                return acc + (dp?.[metric === "money" ? "monto" : "cantidad"] || 0);
            }, 0);
            familyWeights.set(fam, total);
        });

        // Filter only those that exist in data.familias (safety) and Sort Ascending
        return (data.familias || [])
            .filter(f => effectiveSelectedRawFamilies.includes(f))
            .sort((a, b) => (familyWeights.get(a) || 0) - (familyWeights.get(b) || 0));
    })();

    const currentMonthData = data?.tendencias.find(t => t.label === selectedMonthLabel);

    // Preparar payload para el modal (similar al formato del tooltip)
    const modalPayload = currentMonthData ? sortedEffectiveFamilies.map((familia) => {
        const idx = rawFamilies.indexOf(familia);
        const stableIdx = idx >= 0 ? idx : 0;
        const dataPoint = currentMonthData[familia] as TendenciaDataPoint | undefined;
        return {
            name: familia,
            value: dataPoint?.[metric === "money" ? "monto" : "cantidad"] || 0,
            color: PIE_COLORS[stableIdx % PIE_COLORS.length] // Stable colors
        };
    }).filter(item => item.value > 0).sort((a, b) => b.value - a.value) : [];


    return (
        <>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-indigo-500" />
                            Tendencias por Categoría
                        </h3>
                        <p className="text-xs text-slate-500">Composición de ventas en el tiempo</p>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Metrica Toggle */}
                        <div className="bg-slate-100 p-1 rounded-lg flex items-center">
                            <button
                                onClick={() => onMetricChange("money")}
                                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${metric === "money" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                            >
                                Monto ($)
                            </button>
                            <button
                                onClick={() => onMetricChange("quantity")}
                                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${metric === "quantity" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                            >
                                Unidades (#)
                            </button>
                        </div>

                        {/* Separador */}
                        <div className="h-6 w-px bg-slate-200"></div>

                        {/* botones de acción */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowDetailModal(true)}
                                className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
                                title="Ver Detalle Mensual"
                            >
                                <List className="h-5 w-5" />
                            </button>

                            {/* Filtro Familias */}
                            <div className="relative">
                                {selectedFamilies.length !== allEntities.length && (
                                    <span className="absolute -top-2 -right-2 flex h-3 w-3">

                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
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
                                                    onClick={onSelectAll}
                                                    className="flex-1 text-[10px] font-bold py-1.5 bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 transition-colors"
                                                >
                                                    Todas
                                                </button>
                                                <button
                                                    onClick={onClearAll}
                                                    className="flex-1 text-[10px] font-bold py-1.5 bg-slate-50 text-slate-600 rounded-md hover:bg-slate-100 transition-colors"
                                                >
                                                    Ninguna
                                                </button>
                                            </div>

                                            <div className="px-2 mb-2">
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        placeholder="Buscar..."
                                                        value={searchTerm}
                                                        onChange={(e) => setSearchTerm(e.target.value)}
                                                        className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-indigo-400"
                                                    />
                                                    <SearchIcon className="absolute left-2 top-1.5 h-3.5 w-3.5 text-slate-400" />
                                                </div>
                                            </div>

                                            <div className="space-y-1 max-h-[300px] overflow-y-auto scrollbar-thin pr-2">
                                                {allEntities.filter(e => e.toLowerCase().includes(searchTerm.toLowerCase())).map((entity, idx) => {
                                                    const isSelected = selectedFamilies.includes(entity);
                                                    const isGroup = familyGroups.some(g => g.name === entity);

                                                    // Find color: if group, use group color. If raw, use raw color from rawFamilies index
                                                    let color = "#cbd5e1";
                                                    if (isGroup) {
                                                        const group = familyGroups.find(g => g.name === entity);
                                                        if (group) color = group.color;
                                                    } else {
                                                        const rawIdx = rawFamilies.indexOf(entity);
                                                        if (rawIdx >= 0) color = PIE_COLORS[rawIdx % PIE_COLORS.length];
                                                    }

                                                    return (
                                                        <label
                                                            key={idx}
                                                            className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={isSelected}
                                                                onChange={() => onToggleFamily(entity)}
                                                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                            />
                                                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }}></div>
                                                            <span className={`text-xs ${isSelected ? 'text-slate-900 font-medium' : 'text-slate-500'} ${isGroup ? 'font-bold' : ''}`}>
                                                                {entity}
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
                    </div>
                </div>

                <div className="h-[400px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={data?.tendencias || []}
                            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                            stackOffset="sign"
                        >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis
                                dataKey="label"
                                stroke="#64748b"
                                fontSize={11}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                stroke="#64748b"
                                fontSize={11}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={metric === "money" ? formatCLP : (val) => val}
                            />
                            <Tooltip
                                cursor={{ fill: '#f1f5f9' }}
                                content={({ active, payload, label }) => {
                                    if (active && payload && payload.length) {
                                        const sorted = [...payload].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
                                        // Mostrar solo 5 y un indicador
                                        const top5 = sorted.slice(0, 5);
                                        const total = payload.reduce((acc: number, entry: any) => acc + (Number(entry.value) || 0), 0);
                                        const remaining = payload.length - 5;

                                        return (
                                            <div className="bg-white p-3 border border-slate-100 shadow-xl rounded-xl min-w-[200px]">
                                                <p className="font-bold text-sm text-slate-800 mb-2 border-b border-slate-50 pb-1">{label}</p>
                                                <div className="space-y-1">
                                                    {top5.map((entry: any, index: number) => {
                                                        if (Number(entry.value) === 0) return null;
                                                        return (
                                                            <div key={index} className="flex items-center justify-between text-xs gap-4">
                                                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                                                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }}></div>
                                                                    <span className="text-slate-600 truncate" title={entry.name}>{entry.name}</span>
                                                                </div>
                                                                <span className="font-bold text-slate-700 flex-shrink-0 ml-2">
                                                                    {metric === "money" ? formatTooltipCLP(Number(entry.value)) : Number(entry.value)}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                    {remaining > 0 && (
                                                        <div className="pt-1 text-[10px] text-slate-400 italic text-center">
                                                            + {remaining} más
                                                        </div>
                                                    )}
                                                    <div className="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between font-bold text-xs">
                                                        <span className="text-slate-500">Total</span>
                                                        <span className="text-indigo-600">
                                                            {metric === "money" ? formatTooltipCLP(total) : total}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />

                            {/* Generar Barras Dinámicamente baseadas en familias */}
                            {sortedEffectiveFamilies.map((familia) => {
                                const idx = rawFamilies.indexOf(familia);
                                // Fallback just in case
                                const stableIdx = idx >= 0 ? idx : 999;
                                return (
                                    <Bar
                                        key={familia}
                                        dataKey={`${familia}.${metric === "money" ? "monto" : "cantidad"}`}
                                        name={familia}
                                        stackId="a"
                                        fill={PIE_COLORS[stableIdx % PIE_COLORS.length]} // Stable colors
                                        radius={[0, 0, 0, 0]}
                                        maxBarSize={50}
                                    />
                                );
                            })}
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Modal de Detalle */}
            {showDetailModal && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setShowDetailModal(false)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">Detalle de Ventas</h3>
                                    <p className="text-xs text-slate-500">Selecciona un mes para ver el desglose</p>
                                </div>
                                <button
                                    onClick={() => setShowDetailModal(false)}
                                    className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            {/* Selector de Mes */}
                            <select
                                value={selectedMonthLabel}
                                onChange={(e) => setSelectedMonthLabel(e.target.value)}
                                className="w-full text-sm border-slate-200 rounded-lg p-2.5 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-700 bg-white shadow-sm"
                            >
                                {data?.tendencias.map((item, idx) => (
                                    <option key={idx} value={item.label}>
                                        {item.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="p-6 max-h-[50vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200">
                            {modalPayload.length > 0 ? (
                                <div className="space-y-3">
                                    {modalPayload.map((entry, index) => (
                                        <div key={index} className="flex items-center justify-between text-sm p-2 hover:bg-slate-50 rounded-lg transition-colors border border-transparent hover:border-slate-100 gap-4">
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }}></div>
                                                <span className="text-slate-700 font-medium truncate" title={entry.name}>{entry.name}</span>
                                            </div>
                                            <span className="font-bold text-slate-900 flex-shrink-0 ml-2">
                                                {metric === "money" ? formatTooltipCLP(Number(entry.value)) : Number(entry.value)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-slate-500">
                                    No hay datos para el mes seleccionado
                                </div>
                            )}
                        </div>

                        {modalPayload.length > 0 && (
                            <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-between font-bold">
                                <span className="text-slate-600">Total {selectedMonthLabel}</span>
                                <span className="text-xl text-indigo-600">
                                    {metric === "money"
                                        ? formatTooltipCLP(modalPayload.reduce((acc, curr) => acc + curr.value, 0))
                                        : modalPayload.reduce((acc, curr) => acc + curr.value, 0)
                                    }
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
