import { Calendar } from "lucide-react";
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar, Line } from "recharts";
import { formatCLP, formatTooltipCLP } from "@/lib/utils";
import { RendimientoAnualRow } from "@/lib/api";

interface RendimientoAnualChartProps {
    data: RendimientoAnualRow[] | undefined;
    meta: { anoActual: number; anoAnterior: number } | undefined;
    loading: boolean;
    onYearRefChange?: (year: number) => void;
    onYearCompChange?: (year: number) => void;
}

export function RendimientoAnualChart({ data, meta, loading, onYearRefChange, onYearCompChange }: RendimientoAnualChartProps) {
    if (loading) {
        return (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-[400px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    const years = [2021, 2022, 2023, 2024, 2025, 2026];

    return (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-indigo-500" />
                        Rendimiento Anual Acumulado (Comparativa)
                    </h3>
                    <p className="text-xs text-slate-500">Progreso de ventas acumuladas: {meta?.anoAnterior} vs {meta?.anoActual}</p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                    {/* Año Anterior Selector (Debe ser menor al actual) */}
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-slate-300 rounded-full border border-slate-400 border-dashed"></div>
                        {onYearCompChange && meta ? (
                            <select
                                value={meta.anoAnterior}
                                onChange={(e) => onYearCompChange(Number(e.target.value))}
                                className="text-xs border border-slate-200 rounded-md px-1 py-0.5 bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                            >
                                {years.filter(y => y < meta.anoActual).map(y => (
                                    <option key={`comp-${y}`} value={y}>{y}</option>
                                ))}
                            </select>
                        ) : (
                            <span className="text-slate-500">{meta?.anoAnterior}</span>
                        )}
                    </div>

                    <span className="text-slate-300 font-bold">VS</span>

                    {/* Año Actual Selector (Debe ser mayor al anterior) */}
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-indigo-600 rounded-full"></div>
                        {onYearRefChange && meta ? (
                            <select
                                value={meta.anoActual}
                                onChange={(e) => onYearRefChange(Number(e.target.value))}
                                className="text-xs border border-indigo-200 rounded-md px-1 py-0.5 bg-indigo-50 text-indigo-700 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                            >
                                {years.filter(y => y > meta.anoAnterior).map(y => (
                                    <option key={`ref-${y}`} value={y}>{y}</option>
                                ))}
                            </select>
                        ) : (
                            <span className="font-bold text-slate-700">{meta?.anoActual}</span>
                        )}
                    </div>
                </div>
            </div>
            <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data || []} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis
                            dataKey="mes"
                            tickFormatter={(mes) => {
                                const date = new Date(2000, mes - 1, 1);
                                return date.toLocaleString('es-CL', { month: 'short' }).toUpperCase();
                            }}
                            fontSize={12}
                            stroke="#94a3b8"
                            tickLine={false}
                            axisLine={true}
                        />
                        <YAxis
                            yAxisId="left"
                            orientation="left"
                            tickFormatter={formatCLP}
                            fontSize={12}
                            stroke="#94a3b8"
                            tickLine={false}
                            axisLine={false}
                        />
                        <Tooltip
                            cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '5 5' }}
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    const data = payload[0].payload as RendimientoAnualRow;
                                    const mesName = new Date(2000, data.mes - 1, 1).toLocaleString('es-CL', { month: 'long' }).toUpperCase();
                                    const diff = data.acumuladoActual - data.acumuladoAnterior;
                                    const isPositive = diff >= 0;

                                    return (
                                        <div className="bg-white p-4 border border-slate-100 shadow-xl rounded-xl min-w-[280px]">
                                            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                                                <span className="font-bold text-slate-800">{mesName}</span>
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isPositive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                    {isPositive ? '+' : ''}{formatTooltipCLP(diff)}
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                                {/* Headers */}
                                                <div className="text-xs text-slate-500 font-medium text-right pb-1 border-b border-slate-50 pl-8">{meta?.anoAnterior}</div>
                                                <div className="text-xs text-indigo-600 font-bold text-right pb-1 border-b border-slate-50">{meta?.anoActual}</div>

                                                {/* Mensual Row */}
                                                <div className="col-span-2 flex items-center justify-between">
                                                    <span className="text-xs text-slate-500 font-medium">Venta Mensual</span>
                                                </div>
                                                <div className="text-right text-sm text-slate-600">{formatTooltipCLP(data.mensualAnterior)}</div>
                                                <div className="text-right text-sm font-bold text-blue-600">{formatTooltipCLP(data.mensualActual)}</div>

                                                {/* Acumulado Row */}
                                                <div className="col-span-2 flex items-center justify-between mt-1">
                                                    <span className="text-xs text-slate-500 font-medium">Acumulado</span>
                                                </div>
                                                <div className="text-right text-sm text-slate-600">{formatTooltipCLP(data.acumuladoAnterior)}</div>
                                                <div className="text-right text-sm font-bold text-indigo-600">{formatTooltipCLP(data.acumuladoActual)}</div>
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />
                        <Legend verticalAlign="top" height={36} />

                        {/* Barras de venta mensual actual */}
                        <Bar
                            yAxisId="left"
                            dataKey="mensualActual"
                            name={`Venta ${meta?.anoActual}`}
                            fill="#3b82f6"
                            radius={[4, 4, 0, 0]}
                            barSize={30}
                        />

                        {/* Línea Acumulada Año Anterior (Punteada) */}
                        <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey="acumuladoAnterior"
                            name={`Acumulado ${meta?.anoAnterior}`}
                            stroke="#94a3b8"
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            dot={false}
                            activeDot={{ r: 4 }}
                        />

                        {/* Línea Acumulada Año Actual (Sólida) */}
                        <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey="acumuladoActual"
                            name={`Acumulado ${meta?.anoActual}`}
                            stroke="#4f46e5"
                            strokeWidth={3}
                            dot={{ r: 4, fill: '#4f46e5', strokeWidth: 2, stroke: '#fff' }}
                            activeDot={{ r: 7 }}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
