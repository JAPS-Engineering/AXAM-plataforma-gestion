"use client";

import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { cn, formatTooltipCLP } from "@/lib/utils";
import { TrendingUp, Target, Wallet, ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { Pagination } from "@/components/pagination";

interface ResumenMesActualTableProps {
    ventas: Record<string, Record<string, number>>;
    objetivos: Record<string, Record<string, number>>;
    proyecciones: Record<string, Record<string, number>>;
    vendedores?: Record<string, string>;
    onSave?: (vendedor: string, mes: number, ano: number, monto: number, type: "Objetivo" | "Propongo") => Promise<void>;
    loading?: boolean;
    currentMonthKey: string;
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
        <div className="w-full px-2">
            <input
                type="text"
                inputMode="numeric"
                value={value}
                onChange={handleChange}
                onBlur={handleBlur}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                placeholder="0"
                className={cn(
                    "w-full px-3 py-1.5 text-right rounded-lg transition-all font-mono text-sm border font-bold",
                    type === "Objetivo"
                        ? "bg-indigo-50/50 text-indigo-700 border-transparent hover:border-indigo-300/50"
                        : "bg-amber-50 text-amber-700 border-transparent hover:border-amber-300",
                    "focus:outline-none focus:ring-2 focus:bg-white focus:border-transparent focus:shadow-sm",
                    type === "Objetivo" ? "focus:ring-indigo-500" : "focus:ring-amber-500",
                    isSaving && "opacity-50 grayscale cursor-wait"
                )}
            />
        </div>
    );
}

export function ResumenMesActualTable({
    ventas,
    objetivos,
    proyecciones,
    vendedores = {},
    onSave,
    loading,
    currentMonthKey
}: ResumenMesActualTableProps) {
    const [yearStr, monthStr] = currentMonthKey.split('-');
    const currentYear = parseInt(yearStr);
    const currentMonth = parseInt(monthStr);

    // Sorting state
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>({ key: "ventaReal", direction: "desc" });

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [pageUserInteracted, setPageUserInteracted] = useState(false);

    // Reset pagination when data changes significantly, but careful not to reset on simple edits if possible. 
    // For now, keeping it simple: if currentMonthKey changes, reset page.
    useEffect(() => {
        setCurrentPage(1);
    }, [currentMonthKey]);

    const tableData = useMemo(() => {
        // Get unique list of salespeople from all sources
        const allVendedores = Array.from(new Set([
            ...Object.keys(ventas),
            ...Object.keys(objetivos),
            ...Object.keys(proyecciones)
        ]));

        let rows = allVendedores.map(vendedor => {
            // Robust key lookup: handle both "YYYY-MM" and "YYYY-M"
            const [y, m] = currentMonthKey.split('-');
            const unpaddedKey = `${y}-${parseInt(m)}`;

            const ventaReal = ventas[vendedor]?.[currentMonthKey] ?? ventas[vendedor]?.[unpaddedKey] ?? 0;
            const objetivo = objetivos[vendedor]?.[currentMonthKey] ?? objetivos[vendedor]?.[unpaddedKey] ?? 0;
            const propongo = proyecciones[vendedor]?.[currentMonthKey] ?? proyecciones[vendedor]?.[unpaddedKey] ?? 0;

            const cumplimiento = objetivo > 0 ? (ventaReal / objetivo) * 100 : 0;
            const vendedorName = vendedores[vendedor] || vendedor;

            return {
                vendedor,
                vendedorName,
                ventaReal,
                objetivo,
                propongo,
                cumplimiento
            };
        });

        // Sorting
        if (sortConfig) {
            rows.sort((a, b) => {
                let aValue: any = a[sortConfig.key as keyof typeof a];
                let bValue: any = b[sortConfig.key as keyof typeof b];

                if (typeof aValue === 'string') {
                    aValue = aValue.toLowerCase();
                    bValue = bValue.toLowerCase();
                }

                if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
                return 0;
            });
        }

        return rows;

    }, [ventas, objetivos, proyecciones, currentMonthKey, sortConfig, vendedores]);

    const handleSort = (key: string) => {
        setSortConfig((current) => {
            if (current?.key === key) {
                return { key, direction: current.direction === "asc" ? "desc" : "asc" };
            }
            return { key, direction: "desc" }; // Default desc for numbers usually
        });
    };

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

    // Handle Page Change
    const handlePageChange = (page: number) => {
        setCurrentPage(page);
        setPageUserInteracted(true);
    };

    const handlePageSizeChange = (size: number) => {
        setPageSize(size);
        setCurrentPage(1);
    };

    if (loading) {
        return (
            <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    if (tableData.length === 0) return null;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-indigo-500" />
                        <h3 className="font-bold text-slate-800">Resumen Desempeño (Mes Actual)</h3>
                    </div>
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
                            <th className="px-6 py-3 cursor-pointer hover:bg-slate-100 transition-colors group" onClick={() => handleSort("vendedorName")}>
                                <div className="flex items-center gap-1">
                                    Vendedor
                                    {sortConfig?.key === "vendedorName" ? (
                                        sortConfig.direction === "asc" ? <ChevronUp className="h-3 w-3 text-indigo-600" /> : <ChevronDown className="h-3 w-3 text-indigo-600" />
                                    ) : (
                                        <ChevronsUpDown className="h-3 w-3 text-slate-300 group-hover:text-slate-500" />
                                    )}
                                </div>
                            </th>
                            <th className="px-6 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors group" onClick={() => handleSort("ventaReal")}>
                                <div className="flex items-center justify-end gap-1">
                                    Venta Real
                                    {sortConfig?.key === "ventaReal" ? (
                                        sortConfig.direction === "asc" ? <ChevronUp className="h-3 w-3 text-indigo-600" /> : <ChevronDown className="h-3 w-3 text-indigo-600" />
                                    ) : (
                                        <ChevronsUpDown className="h-3 w-3 text-slate-300 group-hover:text-slate-500" />
                                    )}
                                </div>
                            </th>
                            <th className="px-6 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors group" onClick={() => handleSort("objetivo")}>
                                <div className="flex items-center justify-end gap-1">
                                    Objetivo
                                    {sortConfig?.key === "objetivo" ? (
                                        sortConfig.direction === "asc" ? <ChevronUp className="h-3 w-3 text-indigo-600" /> : <ChevronDown className="h-3 w-3 text-indigo-600" />
                                    ) : (
                                        <ChevronsUpDown className="h-3 w-3 text-slate-300 group-hover:text-slate-500" />
                                    )}
                                </div>
                            </th>
                            <th className="px-6 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors group" onClick={() => handleSort("propongo")}>
                                <div className="flex items-center justify-end gap-1">
                                    Propongo
                                    {sortConfig?.key === "propongo" ? (
                                        sortConfig.direction === "asc" ? <ChevronUp className="h-3 w-3 text-indigo-600" /> : <ChevronDown className="h-3 w-3 text-indigo-600" />
                                    ) : (
                                        <ChevronsUpDown className="h-3 w-3 text-slate-300 group-hover:text-slate-500" />
                                    )}
                                </div>
                            </th>
                            <th className="px-6 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors group" onClick={() => handleSort("cumplimiento")}>
                                <div className="flex items-center justify-end gap-1">
                                    Cumplimiento
                                    {sortConfig?.key === "cumplimiento" ? (
                                        sortConfig.direction === "asc" ? <ChevronUp className="h-3 w-3 text-indigo-600" /> : <ChevronDown className="h-3 w-3 text-indigo-600" />
                                    ) : (
                                        <ChevronsUpDown className="h-3 w-3 text-slate-300 group-hover:text-slate-500" />
                                    )}
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {paginatedData.map((row) => (
                            <tr key={row.vendedor} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-3 font-semibold text-slate-900">
                                    <div className="flex flex-col">
                                        <span>{row.vendedorName}</span>
                                        {vendedores[row.vendedor] && (
                                            <span className="text-[10px] text-slate-400 font-mono uppercase">{row.vendedor}</span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-3 text-right font-mono text-green-600 font-bold">{formatTooltipCLP(row.ventaReal)}</td>

                                {/* OBJETIVO CELL */}
                                <td className="px-1 py-1 text-right min-w-[150px]">
                                    {onSave ? (
                                        <EditableAmountCell
                                            vendedor={row.vendedor}
                                            initialValue={row.objetivo}
                                            type="Objetivo"
                                            onSave={onSave}
                                            mes={currentMonth}
                                            ano={currentYear}
                                        />
                                    ) : (
                                        <span className="px-6 py-3 block font-mono text-slate-600">{formatTooltipCLP(row.objetivo)}</span>
                                    )}
                                </td>

                                {/* PROPONGO CELL */}
                                <td className="px-1 py-1 text-right min-w-[150px]">
                                    {onSave ? (
                                        <EditableAmountCell
                                            vendedor={row.vendedor}
                                            initialValue={row.propongo}
                                            type="Propongo"
                                            onSave={onSave}
                                            mes={currentMonth}
                                            ano={currentYear}
                                        />
                                    ) : (
                                        <span className="px-6 py-3 block font-mono text-amber-600">{formatTooltipCLP(row.propongo)}</span>
                                    )}
                                </td>
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
                            <td className="px-6 py-3">TOTALES (Visible)</td>
                            <td className="px-6 py-3 text-right text-green-700">{formatTooltipCLP(paginatedData.reduce((acc, r) => acc + r.ventaReal, 0))}</td>
                            <td className="px-6 py-3 text-right text-indigo-700">{formatTooltipCLP(paginatedData.reduce((acc, r) => acc + r.objetivo, 0))}</td>
                            <td className="px-6 py-3 text-right text-amber-700">{formatTooltipCLP(paginatedData.reduce((acc, r) => acc + r.propongo, 0))}</td>
                            <td className="px-6 py-3 text-right">
                                {(() => {
                                    const totalReal = paginatedData.reduce((acc, r) => acc + r.ventaReal, 0);
                                    const totalObj = paginatedData.reduce((acc, r) => acc + r.objetivo, 0);
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
