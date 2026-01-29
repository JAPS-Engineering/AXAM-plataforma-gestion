import { BarChart3 } from "lucide-react";
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, Cell } from "recharts";
import { formatCLP, formatTooltipCLP } from "@/lib/utils";

interface RankingVendedoresChartProps {
    data: { name: string; value: number; percentage: string }[] | undefined;
    loading: boolean;
    colors: string[];
}

export function RankingVendedoresChart({ data, loading, colors }: RankingVendedoresChartProps) {
    if (loading) {
        return (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-[400px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    const hasData = data && data.length > 0;

    return (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
                <BarChart3 className="h-5 w-5 text-indigo-500" />
                <h3 className="text-lg font-bold text-slate-900">Ranking de Vendedores</h3>
            </div>

            <div className="h-[350px] w-full">
                {hasData ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            layout="vertical"
                            data={data?.slice(0, 10) || []}
                            margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                            <XAxis
                                type="number"
                                tickFormatter={(val: any) => formatCLP(Number(val || 0))}
                                tick={{ fontSize: 10, fill: '#94a3b8' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                type="category"
                                dataKey="name"
                                width={100}
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                interval={0}
                            />
                            <Tooltip
                                cursor={{ fill: '#f8fafc' }}
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const pData = payload[0].payload;
                                        return (
                                            <div className="bg-white p-3 border border-slate-100 shadow-xl rounded-xl">
                                                <p className="font-bold text-sm text-slate-900 mb-1">{pData.name}</p>
                                                <div className="space-y-1">
                                                    <p className="text-indigo-600 font-bold text-sm">{formatTooltipCLP(pData.value)}</p>
                                                    <p className="text-slate-500 text-xs">{pData.percentage}% del total</p>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Bar
                                dataKey="value"
                                radius={[0, 4, 4, 0]}
                                barSize={24}
                                background={{ fill: '#f8fafc' }}
                            >
                                {
                                    (data?.slice(0, 10) || []).map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                                    ))
                                }
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full w-full flex items-center justify-center text-slate-400 italic">
                        No hay datos para el periodo seleccionado
                    </div>
                )}
            </div>
        </div>
    );
}
