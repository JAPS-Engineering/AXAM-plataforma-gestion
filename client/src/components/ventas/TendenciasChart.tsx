import { useState } from "react";
import { TrendingUp, Filter, X } from "lucide-react";
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar } from "recharts";
import { formatCLP, formatTooltipCLP } from "@/lib/utils";
import { VentasTendenciasResponse } from "@/lib/api";

const PIE_COLORS = ['#4f46e5', '#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1', '#14b8a6'];

interface TendenciasChartProps {
    data: VentasTendenciasResponse | undefined;
    selectedFamilies: string[];
    allFamilies: string[];
    onToggleFamily: (family: string) => void;
    onSelectAll: () => void;
    onClearAll: () => void;
    loading: boolean;
}

export function TendenciasChart({
    data,
    selectedFamilies,
    allFamilies,
    onToggleFamily,
    onSelectAll,
    onClearAll,
    loading
}: TendenciasChartProps) {
    const [metric, setMetric] = useState<"money" | "quantity">("money");
    const [showFilterDropdown, setShowFilterDropdown] = useState(false);

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
                        <TrendingUp className="h-5 w-5 text-indigo-500" />
                        Tendencias por Categoría
                    </h3>
                    <p className="text-xs text-slate-500">Composición de ventas en el tiempo</p>
                </div>

                <div className="flex items-center gap-4">
                    {/* Metrica Toggle */}
                    <div className="bg-slate-100 p-1 rounded-lg flex items-center">
                        <button
                            onClick={() => setMetric("money")}
                            className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${metric === "money" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                        >
                            Monto ($)
                        </button>
                        <button
                            onClick={() => setMetric("quantity")}
                            className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${metric === "quantity" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                        >
                            Unidades (#)
                        </button>
                    </div>

                    {/* Separador */}
                    <div className="h-6 w-px bg-slate-200"></div>

                    {/* Filtro Familias */}
                    <div className="relative">
                        {selectedFamilies.length !== allFamilies.length && (
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

                                    <div className="space-y-1 max-h-[300px] overflow-y-auto scrollbar-thin pr-2">
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
                                    const total = payload.reduce((acc: number, entry: any) => acc + (Number(entry.value) || 0), 0);

                                    return (
                                        <div className="bg-white p-3 border border-slate-100 shadow-xl rounded-xl min-w-[200px] z-50">
                                            <p className="font-bold text-sm text-slate-800 mb-2 border-b border-slate-50 pb-1">{label}</p>
                                            <div className="space-y-1 max-h-[300px] overflow-y-auto scrollbar-thin pr-2">
                                                {payload.map((entry: any, index: number) => {
                                                    if (Number(entry.value) === 0) return null;
                                                    return (
                                                        <div key={index} className="flex items-center justify-between text-xs">
                                                            <div className="flex items-center gap-1.5">
                                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></div>
                                                                <span className="text-slate-600">{entry.name}</span>
                                                            </div>
                                                            <span className="font-bold text-slate-700">
                                                                {metric === "money" ? formatTooltipCLP(Number(entry.value)) : Number(entry.value)}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
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
                        {(data?.familias || [])
                            .filter(f => selectedFamilies.includes(f)) // Aplica el filtro global de familias
                            .map((familia, index) => (
                                <Bar
                                    key={familia}
                                    dataKey={`${familia}.${metric === "money" ? "monto" : "cantidad"}`}
                                    name={familia}
                                    stackId="a"
                                    fill={PIE_COLORS[allFamilies.indexOf(familia) % PIE_COLORS.length]} // Stable colors
                                    radius={[0, 0, 0, 0]}
                                    maxBarSize={50}
                                />
                            ))}
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
