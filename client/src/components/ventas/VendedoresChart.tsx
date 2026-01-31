"use client";

import { useMemo } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
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
    vendedores?: Record<string, string>; // Map of code -> nickname
    selectedVendedores?: string[]; // New: Filter for specific sellers
}

const COLORS = [
    '#4f46e5', '#10b981', '#3b82f6', '#f59e0b', '#ef4444',
    '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#64748b',
    '#6366f1', '#14b8a6', '#ef4444', '#f97316', '#84cc16',
    '#22c55e', '#0ea5e9', '#3b82f6', '#a855f7', '#d946ef',
    '#f43f5e', '#64748b', '#78716c', '#0f766e', '#b45309', '#be185d', '#4338ca', '#1d4ed8'
];

const DEFAULT_MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export default function VendedoresChart({ data, objetivos, proyecciones, view, anio, loading, monthsArray, vendedores = {}, selectedVendedores }: VendedoresChartProps) {
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

    // Calcular vendedores visibles: si hay seleccionados usamos esos, sino top 10
    const visibleVendedores = useMemo(() => {
        if (!currentDataSource) return [];

        // Si el usuario proporcionó una selección explícita (aunque sea vacía)
        if (selectedVendedores !== undefined) {
            return selectedVendedores.filter(v => currentDataSource[v]);
        }

        // Fallback: Top 10 por monto total
        return Object.entries(currentDataSource)
            .map(([vendedor, meses]) => ({
                vendedor,
                total: Object.values(meses).reduce((a, b) => a + b, 0)
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10)
            .map(v => v.vendedor);
    }, [currentDataSource, selectedVendedores]);

    const chartData = useMemo(() => {
        if (!currentDataSource) return [];

        return effectiveMonths.map((m) => {
            const entry: any = { name: m.label };
            const key = `${m.ano}-${String(m.mes).padStart(2, '0')}`;
            // Also try just month number for backward compatibility during transitions
            const altKey = m.mes.toString();
            const altKeyLegacy = `${m.ano}-${m.mes}`; // Extra fallback

            visibleVendedores.forEach(vendedor => {
                entry[vendedor] = currentDataSource[vendedor]?.[key] ??
                    currentDataSource[vendedor]?.[altKey] ??
                    currentDataSource[vendedor]?.[altKeyLegacy] ?? 0;
            });

            return entry;
        });
    }, [visibleVendedores, currentDataSource, effectiveMonths]);

    const formatCurrency = (value: number) => {
        if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
        if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
        return `$${value}`;
    };

    // Helper to get color based on global seller index
    const getSellerColor = (code: string, index: number) => {
        if (vendedores) {
            const sellerCodes = Object.keys(vendedores);
            const globalIdx = sellerCodes.indexOf(code);
            if (globalIdx !== -1) {
                return COLORS[globalIdx % COLORS.length];
            }
        }
        return COLORS[index % COLORS.length];
    };

    if (loading) {
        return (
            <div className="w-full h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    const hasData = visibleVendedores.length > 0;

    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex-1 min-h-0 w-full mt-2">
                {hasData ? (
                    <ResponsiveContainer width="100%" height="100%">
                        {effectiveMonths.length > 1 ? (
                            <LineChart
                                key="line-chart"
                                data={chartData}
                                margin={{ top: 10, right: 30, left: 20, bottom: 5 }}
                            >
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
                                    itemSorter={(item: any) => -Number(item.value || 0)}
                                    formatter={(value: any) =>
                                        new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0))
                                    }
                                    contentStyle={{
                                        borderRadius: '12px',
                                        border: 'none',
                                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.2), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
                                        zIndex: 1000,
                                        backgroundColor: 'rgba(255, 255, 255, 0.98)'
                                    }}
                                    wrapperStyle={{ zIndex: 1000 }}
                                />
                                <Legend
                                    verticalAlign="bottom"
                                    height={36}
                                    iconType="circle"
                                    wrapperStyle={{ paddingTop: '20px', fontSize: '11px' }}
                                />
                                {visibleVendedores.map((vendedor, index) => (
                                    <Line
                                        key={vendedor}
                                        name={vendedores[vendedor] || vendedor}
                                        type="monotone"
                                        dataKey={vendedor}
                                        stroke={getSellerColor(vendedor, index)}
                                        strokeWidth={2}
                                        dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                                        activeDot={{ r: 6 }}
                                    />
                                ))}
                            </LineChart>
                        ) : (
                            <BarChart
                                key="bar-chart"
                                data={chartData}
                                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                barGap={8}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#64748b', fontSize: 12, fontWeight: 'bold' }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#64748b', fontSize: 11 }}
                                    tickFormatter={(val: any) => formatCurrency(Number(val || 0))}
                                />
                                <Tooltip
                                    itemSorter={(item: any) => -Number(item.value || 0)}
                                    cursor={{ fill: 'rgba(241, 245, 249, 0.4)' }}
                                    formatter={(value: any) =>
                                        new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0))
                                    }
                                    contentStyle={{
                                        borderRadius: '12px',
                                        border: 'none',
                                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.2), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
                                        zIndex: 1000,
                                        backgroundColor: 'rgba(255, 255, 255, 0.98)'
                                    }}
                                    wrapperStyle={{ zIndex: 1000 }}
                                />
                                <Legend
                                    verticalAlign="bottom"
                                    height={36}
                                    iconType="circle"
                                    wrapperStyle={{ paddingTop: '20px', fontSize: '11px' }}
                                />
                                {visibleVendedores.map((vendedor, index) => (
                                    <Bar
                                        key={vendedor}
                                        name={vendedores[vendedor] || vendedor}
                                        dataKey={vendedor}
                                        fill={getSellerColor(vendedor, index)}
                                        radius={[4, 4, 0, 0]}
                                        barSize={40}
                                    />
                                ))}
                            </BarChart>
                        )}
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
