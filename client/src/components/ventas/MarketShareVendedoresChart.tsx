import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { PieChart as PieChartIcon } from "lucide-react";
import { formatCLP } from "@/lib/utils";

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

    return (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
                <PieChartIcon className="h-5 w-5 text-indigo-500" />
                <h3 className="text-lg font-bold text-slate-900">Participación por Vendedor</h3>
            </div>

            <div className="h-[300px] w-full">
                {hasData ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {data.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                                ))}
                            </Pie>
                            <Tooltip
                                formatter={(value: any) => formatCLP(Number(value || 0))}
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                            />
                            <Legend
                                verticalAlign="bottom"
                                height={36}
                                iconType="circle"
                                wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }}
                            />
                        </PieChart>
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
