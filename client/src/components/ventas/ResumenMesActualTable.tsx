"use client";

import React, { useMemo } from "react";
import { cn, formatTooltipCLP } from "@/lib/utils";
import { TrendingUp, Target, Wallet } from "lucide-react";

interface ResumenMesActualTableProps {
    ventas: Record<string, Record<string, number>>;
    objetivos: Record<string, Record<string, number>>;
    proyecciones: Record<string, Record<string, number>>;
    loading?: boolean;
}

export function ResumenMesActualTable({ ventas, objetivos, proyecciones, loading }: ResumenMesActualTableProps) {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const currentMonthKey = `${currentYear}-${currentMonth}`;
    const monthName = new Intl.DateTimeFormat('es-CL', { month: 'long' }).format(new Date());

    const tableData = useMemo(() => {
        // Get unique list of salespeople from all sources
        const allVendedores = Array.from(new Set([
            ...Object.keys(ventas),
            ...Object.keys(objetivos),
            ...Object.keys(proyecciones)
        ]));

        return allVendedores.map(vendedor => {
            const ventaReal = ventas[vendedor]?.[currentMonthKey] || 0;
            const objetivo = objetivos[vendedor]?.[currentMonthKey] || 0;
            const propongo = proyecciones[vendedor]?.[currentMonthKey] || 0;

            const cumplimiento = objetivo > 0 ? (ventaReal / objetivo) * 100 : 0;

            return {
                vendedor,
                ventaReal,
                objetivo,
                propongo,
                cumplimiento
            };
        }).sort((a, b) => b.ventaReal - a.ventaReal);
    }, [ventas, objetivos, proyecciones, currentMonthKey]);

    if (loading) {
        return (
            <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    if (tableData.length === 0) return null;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-indigo-500" />
                    <h3 className="font-bold text-slate-800">Resumen Desempeño: <span className="capitalize text-indigo-600">{monthName} {currentYear}</span></h3>
                </div>
                <div className="flex gap-4 text-xs font-semibold">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        <span className="text-slate-500">Real</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                        <span className="text-slate-500">Objetivo</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                        <span className="text-slate-500">Propongo</span>
                    </div>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50/50 text-slate-500 font-bold border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-3">Vendedor</th>
                            <th className="px-6 py-3 text-right">Venta Real</th>
                            <th className="px-6 py-3 text-right">Objetivo</th>
                            <th className="px-6 py-3 text-right">Propongo</th>
                            <th className="px-6 py-3 text-right">Cumplimiento</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {tableData.map((row) => (
                            <tr key={row.vendedor} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-3 font-semibold text-slate-900">{row.vendedor}</td>
                                <td className="px-6 py-3 text-right font-mono text-green-600 font-bold">{formatTooltipCLP(row.ventaReal)}</td>
                                <td className="px-6 py-3 text-right font-mono text-slate-600">{formatTooltipCLP(row.objetivo)}</td>
                                <td className="px-6 py-3 text-right font-mono text-amber-600">{formatTooltipCLP(row.propongo)}</td>
                                <td className="px-6 py-3 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <span className={cn(
                                            "px-2 py-0.5 rounded-full text-[10px] font-bold",
                                            row.cumplimiento >= 100 ? "bg-green-100 text-green-700" :
                                                row.cumplimiento >= 80 ? "bg-blue-100 text-blue-700" :
                                                    "bg-red-100 text-red-700"
                                        )}>
                                            {row.cumplimiento.toFixed(1)}%
                                        </span>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold text-slate-800 border-t border-slate-200">
                        <tr>
                            <td className="px-6 py-3">TOTALES</td>
                            <td className="px-6 py-3 text-right text-green-700">{formatTooltipCLP(tableData.reduce((acc, r) => acc + r.ventaReal, 0))}</td>
                            <td className="px-6 py-3 text-right text-indigo-700">{formatTooltipCLP(tableData.reduce((acc, r) => acc + r.objetivo, 0))}</td>
                            <td className="px-6 py-3 text-right text-amber-700">{formatTooltipCLP(tableData.reduce((acc, r) => acc + r.propongo, 0))}</td>
                            <td className="px-6 py-3 text-right">
                                {(() => {
                                    const totalReal = tableData.reduce((acc, r) => acc + r.ventaReal, 0);
                                    const totalObj = tableData.reduce((acc, r) => acc + r.objetivo, 0);
                                    const totalCump = totalObj > 0 ? (totalReal / totalObj) * 100 : 0;
                                    return (
                                        <span className="text-indigo-600">{totalCump.toFixed(1)}%</span>
                                    );
                                })()}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}
