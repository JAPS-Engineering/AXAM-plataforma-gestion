import { useMemo, useState } from "react";
import { PieChart as PieIcon, Filter, X } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { formatTooltipCLP } from "@/lib/utils";
import { MarketShareRow } from "@/lib/api";

const PIE_COLORS = ['#4f46e5', '#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1', '#14b8a6'];

interface MarketShareChartProps {
    data: MarketShareRow[] | undefined;
    meta: { anoActual: number; totalVentaAnual?: number; totalVentaPeriodo?: number } | undefined;
    allFamilies: string[];
    selectedFamilies: string[];
    onToggleFamily: (family: string) => void;
    onSelectAll: () => void;
    onClearAll: () => void;
    loading: boolean;
}

export function MarketShareChart({
    data,
    meta,
    allFamilies,
    selectedFamilies,
    onToggleFamily,
    onSelectAll,
    onClearAll,
    loading
}: MarketShareChartProps) {
    const [showFilterDropdown, setShowFilterDropdown] = useState(false);

    const filteredMarketShare = useMemo(() => {
        if (!data) return [];
        return data.filter(m => selectedFamilies.includes(m.name));
    }, [data, selectedFamilies]);

    const totalFiltrado = useMemo(() => {
        return filteredMarketShare.reduce((acc, curr) => acc + curr.value, 0);
    }, [filteredMarketShare]);

    // Calcular total ventas del periodo para mostrar porcentaje global correcto o total global
    // Usamos 'totalVentaPeriodo' si existe (nueva API), sino fallback a 'totalVentaAnual' (legacy)
    const totalVentas = meta?.totalVentaPeriodo ?? meta?.totalVentaAnual ?? 0;

    if (loading) {
        return (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative h-[400px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <PieIcon className="h-5 w-5 text-indigo-500" />
                        Market Share Interno
                    </h3>
                    <p className="text-xs text-slate-500">Participación por Familia de Proveedores ({meta?.anoActual})</p>
                </div>

                <div className="flex items-center gap-2 relative z-10">
                    {selectedFamilies.length !== allFamilies.length && (
                        <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-bold">
                            FILTRADO
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
                                className="fixed inset-0 z-[40]"
                                onClick={() => setShowFilterDropdown(false)}
                            />
                            <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 z-[50] p-4 animate-in fade-in zoom-in duration-200 origin-top-right">
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

                                <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200">
                                    {allFamilies.map((family, idx) => {
                                        const isSelected = selectedFamilies.includes(family);
                                        const color = PIE_COLORS[idx % PIE_COLORS.length];
                                        return (
                                            <label
                                                key={idx}
                                                className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => onToggleFamily(family)}
                                                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }}></div>
                                                <span className={`text-xs ${isSelected ? 'text-slate-900 font-medium' : 'text-slate-500'}`}>
                                                    {family || 'Sin Familia'}
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
            <div className="h-[350px] w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={filteredMarketShare}
                            cx="50%"
                            cy="50%"
                            innerRadius={80}
                            outerRadius={120}
                            paddingAngle={2}
                            dataKey="value"
                        >
                            {filteredMarketShare.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={PIE_COLORS[allFamilies.indexOf(entry.name) % PIE_COLORS.length]}
                                    stroke="none"
                                />
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
            <div className="mt-4 text-center text-xs text-slate-500 flex flex-col gap-1">
                <div>Total Visible: <span className="font-bold text-indigo-600">{formatTooltipCLP(totalFiltrado)}</span></div>
                <div className="text-[10px] text-slate-400">Total Período: {formatTooltipCLP(totalVentas)}</div>
            </div>
        </div>
    );
}
