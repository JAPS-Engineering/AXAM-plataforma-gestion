"use client";

import React, { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

interface VendedorMesData {
    ano: number;
    mes: number;
    label: string;
}

interface VendedoresTableProps {
    data: Record<string, Record<string, number>>; // Real sales
    objetivos: Record<string, Record<string, number>>;
    proyecciones: Record<string, Record<string, number>>;
    view: "Real" | "Objetivo" | "Propongo";
    onSave: (vendedor: string, mes: number, ano: number, monto: number, type: "Objetivo" | "Propongo") => Promise<void>;
    monthsArray: VendedorMesData[];
    loading?: boolean;
}

export default function VendedoresTable({
    data,
    objetivos,
    proyecciones,
    view,
    onSave,
    monthsArray,
    loading
}: VendedoresTableProps) {

    const [editingCell, setEditingCell] = useState<{ v: string, m: number, a: number } | null>(null);
    const [editValue, setEditValue] = useState("");
    const [sortConfig, setSortConfig] = useState<{ column: string, direction: 'asc' | 'desc' }>({ column: 'total', direction: 'desc' });

    const currentDataSource = view === "Real" ? data : view === "Objetivo" ? objetivos : proyecciones;

    // Obtener lista única de vendedores
    const allVendedores = useMemo(() => Array.from(new Set([
        ...Object.keys(data),
        ...Object.keys(objetivos),
        ...Object.keys(proyecciones)
    ])), [data, objetivos, proyecciones]);

    const tableData = useMemo(() => {
        const rows = allVendedores.map((vendedor: string) => {
            const row: any = { vendedor, total: 0 };
            const dataSourceVendedor = currentDataSource[vendedor] || {};

            monthsArray.forEach(m => {
                const key = `${m.ano}-${m.mes}`;
                const val = dataSourceVendedor[key] || 0;
                row[key] = val;
                row.total += val;
            });
            return row;
        });

        if (sortConfig.column) {
            rows.sort((a: any, b: any) => {
                const aVal = a[sortConfig.column];
                const bVal = b[sortConfig.column];
                if (typeof aVal === 'string') {
                    return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                }
                return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
            });
        }
        return rows;
    }, [allVendedores, currentDataSource, monthsArray, sortConfig]);

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(val);

    const handleCellClick = (vendedor: string, m: VendedorMesData, currentVal: number) => {
        if (view === "Real") return;
        setEditingCell({ v: vendedor, m: m.mes, a: m.ano });
        setEditValue(currentVal.toString());
    };

    const handleBlur = async () => {
        if (!editingCell) return;
        const monto = parseFloat(editValue) || 0;
        await onSave(editingCell.v, editingCell.m, editingCell.a, monto, view as any);
        setEditingCell(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleBlur();
        } else if (e.key === "Escape") {
            setEditingCell(null);
        }
    };

    if (loading) return (
        <div className="bg-white p-12 rounded-xl border border-slate-200 shadow-sm flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
    );

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                        <tr>
                            <th className="px-4 py-3 sticky left-0 bg-slate-100 z-20 w-48 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                                Vendedor
                            </th>
                            <th
                                className="px-4 py-3 text-right bg-slate-200/50 border-r border-slate-200 min-w-[120px] cursor-pointer hover:bg-slate-300/30 transition-colors"
                                onClick={() => setSortConfig(p => ({ column: 'total', direction: p.column === 'total' && p.direction === 'desc' ? 'asc' : 'desc' }))}
                            >
                                Total Periodo
                            </th>
                            {monthsArray.map((m) => (
                                <th key={`${m.ano}-${m.mes}`} className="px-4 py-3 text-right min-w-[100px] whitespace-nowrap tabular-nums">
                                    {m.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {tableData.map((row: any) => (
                            <tr key={row.vendedor} className="hover:bg-slate-50 transition-colors group">
                                <td className="px-4 py-3 font-semibold text-slate-900 sticky left-0 bg-white z-10 border-r border-slate-200 group-hover:bg-slate-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                                    {row.vendedor}
                                </td>
                                <td className="px-4 py-3 text-right font-bold border-r border-slate-200 bg-slate-50 text-slate-800">
                                    {formatCurrency(row.total)}
                                </td>
                                {monthsArray.map((m) => {
                                    const key = `${m.ano}-${m.mes}`;
                                    const value = row[key] || 0;
                                    const isEditing = editingCell?.v === row.vendedor && editingCell?.m === m.mes && editingCell?.a === m.ano;

                                    return (
                                        <td
                                            key={key}
                                            className={cn(
                                                "px-4 py-3 text-right font-mono transition-all tabular-nums",
                                                view !== "Real" && "cursor-pointer hover:bg-indigo-50 hover:text-indigo-600",
                                                isEditing && "p-1 bg-indigo-50"
                                            )}
                                            onClick={() => handleCellClick(row.vendedor, m, value)}
                                        >
                                            {isEditing ? (
                                                <input
                                                    autoFocus
                                                    type="number"
                                                    value={editValue}
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditValue(e.target.value)}
                                                    onBlur={handleBlur}
                                                    onKeyDown={handleKeyDown}
                                                    className="w-full h-8 text-right bg-white border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-200 px-2 font-mono text-xs text-indigo-700"
                                                />
                                            ) : (
                                                <span className={cn(!value && "text-slate-200")}>
                                                    {value > 0 ? formatCurrency(value) : (view === "Real" ? "-" : "$0")}
                                                </span>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-slate-100/80 font-bold border-t-2 border-slate-200 text-slate-900">
                        <tr>
                            <td className="px-4 py-3 sticky left-0 bg-slate-100/80 z-20 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">TOTAL</td>
                            <td className="px-4 py-3 text-right border-r border-slate-200 bg-slate-200/20">
                                {formatCurrency(tableData.reduce((acc: number, row: any) => acc + row.total, 0))}
                            </td>
                            {monthsArray.map((m) => {
                                const key = `${m.ano}-${m.mes}`;
                                const totalMes = tableData.reduce((acc: number, row: any) => acc + (row[key] || 0), 0);
                                return (
                                    <td key={key} className="px-4 py-3 text-right font-mono tabular-nums">
                                        {totalMes > 0 ? formatCurrency(totalMes) : "-"}
                                    </td>
                                );
                            })}
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}
