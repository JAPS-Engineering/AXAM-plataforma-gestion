"use client";

import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp } from "lucide-react";

interface VendedorMesData {
    ano: number;
    mes: number;
    label: string;
}

interface VendedoresChartProps {
    data: Record<string, Record<string, number>>; // Real sales
    objetivos: Record<string, Record<string, number>>;
    proyecciones: Record<string, Record<string, number>>;
    view: "Real" | "Objetivo" | "Propongo";
    anio: number; // For single year views, but we prioritize monthsArray if available
    loading?: boolean;
    monthsArray?: VendedorMesData[]; // New dynamic months
}

const COLORS = [
    "#4f46e5", "#10b981", "#3b82f6", "#f59e0b", "#ef4444",
    "#8b5cf6", "#ec4899", "#06b6d4", "#f97316", "#64748b"
];

const DEFAULT_MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export default function VendedoresChart({ data, objetivos, proyecciones, view, anio, loading, monthsArray }: VendedoresChartProps) {
    const currentDataSource = view === "Real" ? data : view === "Objetivo" ? objetivos : proyecciones;

    // Determine the months to display
    const effectiveMonths = useMemo(() => {
        if (monthsArray && monthsArray.length > 0) {
            return monthsArray;
        }
        // Fallback for 12 months (traditional view)
        return DEFAULT_MONTHS.map((label, i) => ({
            label,
            ano: anio,
            mes: i + 1
        }));
    }, [monthsArray, anio]);

    // Filtrar vendedores top 10 para no saturar el gráfico
    const topVendedores = useMemo(() => {
        if (!currentDataSource) return [];
        return Object.entries(currentDataSource)
            .map(([vendedor, meses]) => ({
                vendedor,
                total: Object.values(meses).reduce((a, b) => a + b, 0)
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10)
            .map(v => v.vendedor);
    }, [currentDataSource]);

    const chartData = useMemo(() => {
        if (!currentDataSource) return [];

        return effectiveMonths.map((m) => {
            const entry: any = { name: m.label };
            const key = `${m.ano}-${m.mes}`;
            // Also try just month number for backward compatibility during transitions
            const altKey = m.mes.toString();

            topVendedores.forEach(vendedor => {
                entry[vendedor] = currentDataSource[vendedor]?.[key] ?? currentDataSource[vendedor]?.[altKey] ?? 0;
            });

            return entry;
        });
    }, [topVendedores, currentDataSource, effectiveMonths]);

    const formatCurrency = (value: number) => {
        if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
        if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
        return `$${value}`;
    };

    if (loading) {
        return (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative w-full h-[400px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    const hasData = topVendedores.length > 0;

    return (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative w-full h-[400px] flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-indigo-500" />
                    <h3 className="text-sm font-bold text-slate-800">Tendencia por Vendedor ({view})</h3>
                </div>
            </div>

            <div className="flex-1 min-h-0 w-full">
                {hasData ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis
                                dataKey="name"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#64748b', fontSize: 11 }}
                                dy={10}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#64748b', fontSize: 11 }}
                                tickFormatter={(val: any) => formatCurrency(Number(val || 0))}
                            />
                            <Tooltip
                                formatter={(value: any) =>
                                    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0))
                                }
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                            />
                            <Legend
                                verticalAlign="bottom"
                                height={36}
                                iconType="circle"
                                wrapperStyle={{ paddingTop: '20px', fontSize: '11px' }}
                            />
                            {topVendedores.map((vendedor, index) => (
                                <Line
                                    key={vendedor}
                                    type="monotone"
                                    dataKey={vendedor}
                                    stroke={COLORS[index % COLORS.length]}
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 4 }}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full w-full flex items-center justify-center text-slate-400 text-sm italic">
                        No hay datos para mostrar en el gráfico
                    </div>
                )}
            </div>
        </div>
    );
}
