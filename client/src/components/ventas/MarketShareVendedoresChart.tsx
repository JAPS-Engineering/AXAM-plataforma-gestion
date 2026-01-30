import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { PieChart as PieChartIcon } from "lucide-react";
import { formatCLP, formatTooltipCLP } from "@/lib/utils";

interface MarketShareVendedoresChartProps {
    data: { name: string; value: number; percentage: string }[] | undefined;
    loading: boolean;
    colors: string[];
}

export function MarketShareVendedoresChart({ data, loading, colors }: MarketShareVendedoresChartProps) {
    if (loading) {
        return (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-[400px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    const hasData = data && data.length > 0;
    const totalVentas = data?.reduce((acc, curr) => acc + curr.value, 0) || 0;

    return (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative">
            <div className="flex items-center gap-2 mb-6">
                <PieChartIcon className="h-5 w-5 text-indigo-500" />
                <h3 className="text-lg font-bold text-slate-900">Participación por Vendedor</h3>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-center p-4">
                <div className="h-[300px] w-[300px] flex-shrink-0 relative">
                    {hasData ? (
                        <>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={data}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={80}
                                        outerRadius={120}
                                        paddingAngle={2}
                                        dataKey="value"
                                    >
                                        {data.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={colors[index % colors.length]} stroke="none" />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        formatter={(value: any) => formatCLP(Number(value || 0))}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>

                            {/* Centered Total */}
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="text-center">
                                    <span className="text-[10px] text-slate-400 block">Total</span>
                                    <span className="text-sm font-bold text-slate-800 block">{formatTooltipCLP(totalVentas)}</span>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="h-full w-full flex items-center justify-center text-slate-400 italic">
                            No hay datos para el periodo seleccionado
                        </div>
                    )}
                </div>

                {/* Side Legend */}
                {hasData && (
                    <div className="flex-1 min-w-[200px] pl-0 md:pl-8 mt-6 md:mt-0 border-l border-transparent md:border-slate-100">
                        <div className="w-full">
                            <div className="grid grid-cols-2 gap-x-6 gap-y-2 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-indigo-200 scrollbar-track-translate hover:scrollbar-thumb-indigo-300">
                                {data.map((entry, index) => {
                                    const fill = colors[index % colors.length];
                                    return (
                                        <div key={index} className="flex items-center gap-3 w-full group hover:bg-slate-50 p-1.5 rounded-lg transition-colors cursor-default min-w-0">
                                            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: fill }}></div>
                                            <div className="flex flex-col min-w-0 flex-1">
                                                <span className="text-xs truncate w-full text-slate-600 group-hover:text-slate-900" title={entry.name}>
                                                    {entry.name}
                                                </span>
                                                <span className="text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity truncate">
                                                    {formatTooltipCLP(entry.value)} ({entry.percentage})
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
