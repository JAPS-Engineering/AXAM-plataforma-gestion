import { BarChart3 } from "lucide-react";
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, Cell } from "recharts";
import { formatCLP, formatTooltipCLP } from "@/lib/utils";
import { VentasFamiliaRow } from "@/lib/api";

interface RankingFamiliasChartProps {
    data: (VentasFamiliaRow & { isGroup?: boolean; color?: string })[] | undefined;
    year: number | undefined;
    loading: boolean;
    colors: string[];
    allEntities: string[];
    title?: string;
}

export function RankingFamiliasChart({ data, year, loading, colors, allEntities, title = "Ranking por Familia" }: RankingFamiliasChartProps) {
    if (loading) {
        return (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-[400px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-indigo-500" />
                        {title}
                    </h3>
                    <p className="text-xs text-slate-500">Ventas acumuladas del periodo seleccionado</p>
                </div>
            </div>
            <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        layout="vertical"
                        data={data?.slice(0, 15) || []}
                        margin={{ top: 5, right: 30, left: 60, bottom: 20 }}
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
                            dataKey="familia"
                            width={100}
                            tick={{ fontSize: 11, fill: '#64748b' }}
                            interval={0}
                            tickFormatter={(value) => value.length > 15 ? value.substring(0, 15) + '...' : value} // Truncate long names
                        />
                        <Tooltip
                            cursor={{ fill: '#f8fafc' }}
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    const data = payload[0].payload;
                                    return (
                                        <div className="bg-white p-3 border border-slate-100 shadow-xl rounded-xl">
                                            <p className="font-bold text-sm text-slate-900 mb-1">{data.familia || 'Sin Familia'} {data.isGroup ? '(Grupo)' : ''}</p>
                                            <div className="space-y-1">
                                                <p className="text-indigo-600 font-bold text-sm">{formatTooltipCLP(data.totalMonto)}</p>
                                                <p className="text-slate-500 text-xs">{new Intl.NumberFormat("es-CL").format(data.totalCantidad)} unidades</p>
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />
                        <Bar
                            dataKey="totalMonto"
                            radius={[0, 4, 4, 0]}
                            barSize={24}
                            background={{ fill: '#f8fafc' }}
                        >
                            {
                                (data?.slice(0, 15) || []).map((entry, index) => {
                                    // Use explicit color if available (groups), otherwise index based from allEntities
                                    const fill = entry.color || colors[allEntities.indexOf(entry.familia) % colors.length];
                                    return <Cell key={`cell-${index}`} fill={fill} />;
                                })
                            }
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
