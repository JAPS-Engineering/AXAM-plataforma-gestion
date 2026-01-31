"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Pagination } from "@/components/pagination";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

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
    vendedores?: Record<string, string>; // Map of code -> nickname
    loading?: boolean;
}

interface EditableAmountCellProps {
    vendedor: string;
    initialValue: number;
    type: "Objetivo" | "Propongo";
    onSave: (vendedor: string, mes: number, ano: number, monto: number, type: "Objetivo" | "Propongo") => Promise<void>;
    mes: number;
    ano: number;
}

function EditableAmountCell({ vendedor, initialValue, type, onSave, mes, ano }: EditableAmountCellProps) {
    const [value, setValue] = useState<string>(initialValue === 0 ? "" : initialValue.toString());
    const [isSaving, setIsSaving] = useState(false);
    const originalValue = useRef(initialValue);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        setValue(initialValue === 0 ? "" : initialValue.toString());
        originalValue.current = initialValue;
    }, [initialValue]);

    const handleSave = useCallback(async (val: string) => {
        const numValue = parseFloat(val) || 0;
        if (numValue === originalValue.current || isSaving) return;

        setIsSaving(true);
        try {
            await onSave(vendedor, mes, ano, numValue, type);
            originalValue.current = numValue;
        } catch (error) {
            setValue(originalValue.current === 0 ? "" : originalValue.current.toString());
            console.error("Error saving:", error);
        } finally {
            setIsSaving(false);
        }
    }, [onSave, vendedor, mes, ano, type, isSaving]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value;
        setValue(newVal);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => handleSave(newVal), 1000);
    };

    const handleBlur = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        handleSave(value);
    };

    return (
        <div className="w-full px-1">
            <input
                type="text"
                inputMode="numeric"
                value={value}
                onChange={handleChange}
                onBlur={handleBlur}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                placeholder="0"
                className={cn(
                    "w-full px-2 py-1 text-right rounded transition-all font-mono text-[11px] border font-bold",
                    type === "Objetivo"
                        ? "bg-indigo-50/50 text-indigo-700 border-transparent hover:border-indigo-300/50"
                        : "bg-amber-50 text-amber-700 border-transparent hover:border-amber-300",
                    "focus:outline-none focus:ring-1 focus:bg-white focus:border-transparent focus:shadow-sm",
                    type === "Objetivo" ? "focus:ring-indigo-500" : "focus:ring-amber-500",
                    isSaving && "opacity-50 grayscale cursor-wait"
                )}
            />
        </div>
    );
}

export default function VendedoresTable({
    data,
    objetivos,
    proyecciones,
    view,
    onSave,
    monthsArray,
    vendedores = {},
    loading
}: VendedoresTableProps) {

    const [sortConfig, setSortConfig] = useState<{ column: string, direction: 'asc' | 'desc' }>({ column: 'total', direction: 'desc' });

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

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
                const key = `${m.ano}-${String(m.mes).padStart(2, '0')}`;
                const unpaddedKey = `${m.ano}-${m.mes}`;
                const val = dataSourceVendedor[key] ?? dataSourceVendedor[unpaddedKey] ?? 0;
                row[key] = val;
                row.total += val;
            });
            return row;
        });

        if (sortConfig.column) {
            rows.sort((a: any, b: any) => {
                const aVal = a[sortConfig.column];
                const bVal = b[sortConfig.column];

                // Handle string comparison for 'vendedor'
                if (sortConfig.column === 'vendedor') {
                    if (typeof aVal === 'string' && typeof bVal === 'string') {
                        return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                    }
                }

                // Handle numeric comparison for totals and months
                // Treat undefined/null as 0 for sorting
                const numA = typeof aVal === 'number' ? aVal : 0;
                const numB = typeof bVal === 'number' ? bVal : 0;

                return sortConfig.direction === 'asc' ? numA - numB : numB - numA;
            });
        }
        return rows;
    }, [allVendedores, currentDataSource, monthsArray, sortConfig]);

    // Pagination Logic
    const { paginatedData, totalPages } = useMemo(() => {
        if (pageSize === -1) return { paginatedData: tableData, totalPages: 1 };

        const total = Math.ceil(tableData.length / pageSize);
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;

        return {
            paginatedData: tableData.slice(start, end),
            totalPages: total || 1,
        };
    }, [tableData, currentPage, pageSize]);

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
    };

    const handlePageSizeChange = (size: number) => {
        setPageSize(size);
        setCurrentPage(1);
    };

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(val);

    if (loading) return (
        <div className="bg-white p-12 rounded-xl border border-slate-200 shadow-sm flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
    );

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                        <tr>
                            <th
                                className="px-4 py-3 sticky left-0 bg-slate-100 z-20 w-48 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] cursor-pointer hover:bg-slate-200/50 transition-colors group"
                                onClick={() => setSortConfig(p => ({ column: 'vendedor', direction: p.column === 'vendedor' && p.direction === 'asc' ? 'desc' : 'asc' }))}
                            >
                                <div className="flex items-center justify-between gap-1">
                                    <span>Vendedor</span>
                                    {sortConfig.column === 'vendedor' ? (
                                        sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3 text-indigo-600" /> : <ChevronDown className="h-3 w-3 text-indigo-600" />
                                    ) : (
                                        <ChevronsUpDown className="h-3 w-3 text-slate-300 group-hover:text-slate-500" />
                                    )}
                                </div>
                            </th>
                            <th
                                className="px-4 py-3 text-right bg-slate-200/50 border-r border-slate-200 min-w-[120px] cursor-pointer hover:bg-slate-300/30 transition-colors group"
                                onClick={() => setSortConfig(p => ({ column: 'total', direction: p.column === 'total' && p.direction === 'desc' ? 'asc' : 'desc' }))}
                            >
                                <div className="flex items-center justify-end gap-1">
                                    <span>Total Periodo</span>
                                    {sortConfig.column === 'total' ? (
                                        sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3 text-indigo-600" /> : <ChevronDown className="h-3 w-3 text-indigo-600" />
                                    ) : (
                                        <ChevronsUpDown className="h-3 w-3 text-slate-300 group-hover:text-slate-500" />
                                    )}
                                </div>
                            </th>
                            {monthsArray.map((m) => {
                                const key = `${m.ano}-${String(m.mes).padStart(2, '0')}`;
                                return (
                                    <th
                                        key={key}
                                        className="px-4 py-3 text-right min-w-[100px] whitespace-nowrap tabular-nums cursor-pointer hover:bg-slate-200/50 transition-colors group"
                                        onClick={() => setSortConfig(p => ({ column: key, direction: p.column === key && p.direction === 'desc' ? 'asc' : 'desc' }))}
                                    >
                                        <div className="flex items-center justify-end gap-1">
                                            <span>{m.label}</span>
                                            {sortConfig.column === key ? (
                                                sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3 text-indigo-600" /> : <ChevronDown className="h-3 w-3 text-indigo-600" />
                                            ) : (
                                                <ChevronsUpDown className="h-3 w-3 text-slate-300 group-hover:text-slate-500" />
                                            )}
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {paginatedData.map((row: any) => (
                            <tr key={row.vendedor} className="hover:bg-slate-50 transition-colors group">
                                <td className="px-4 py-3 font-semibold text-slate-900 sticky left-0 bg-white z-10 border-r border-slate-200 group-hover:bg-slate-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                                    <div className="flex flex-col">
                                        <span className="text-sm">{vendedores[row.vendedor] || row.vendedor}</span>
                                        {vendedores[row.vendedor] && (
                                            <span className="text-[10px] text-slate-400 font-mono uppercase">{row.vendedor}</span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-right font-bold border-r border-slate-200 bg-slate-50 text-slate-800">
                                    {formatCurrency(row.total)}
                                </td>
                                {monthsArray.map((m) => {
                                    const key = `${m.ano}-${String(m.mes).padStart(2, '0')}`;
                                    const value = row[key] || 0;
                                    return (
                                        <td
                                            key={key}
                                            className={cn(
                                                "px-2 py-2 text-right font-mono transition-all tabular-nums",
                                                view !== "Real" && "bg-slate-50/30"
                                            )}
                                        >
                                            {view !== "Real" ? (
                                                <EditableAmountCell
                                                    vendedor={row.vendedor}
                                                    initialValue={value}
                                                    type={view as "Objetivo" | "Propongo"}
                                                    onSave={onSave}
                                                    mes={m.mes}
                                                    ano={m.ano}
                                                />
                                            ) : (
                                                <span className={cn("px-2 text-xs", !value && "text-slate-200")}>
                                                    {value > 0 ? formatCurrency(value) : "-"}
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
                            <td className="px-4 py-3 sticky left-0 bg-slate-100/80 z-20 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">TOTAL (Visible)</td>
                            <td className="px-4 py-3 text-right border-r border-slate-200 bg-slate-200/20">
                                {formatCurrency(paginatedData.reduce((acc: number, row: any) => acc + row.total, 0))}
                            </td>
                            {monthsArray.map((m) => {
                                const key = `${m.ano}-${String(m.mes).padStart(2, '0')}`;
                                const totalMes = paginatedData.reduce((acc: number, row: any) => acc + (row[key] || 0), 0);
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

            <div className="border-t border-slate-200">
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    totalItems={tableData.length}
                    onPageChange={handlePageChange}
                    onPageSizeChange={handlePageSizeChange}
                    className="border-none shadow-none"
                />
            </div>
        </div>
    );
}
