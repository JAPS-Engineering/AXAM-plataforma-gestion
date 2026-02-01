"use client";

import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn, formatCLP } from "@/lib/utils";
import { VentasTendenciasResponse, TendenciaDataPoint } from "@/lib/api";
import { Pagination } from "@/components/pagination";

interface TendenciasTableProps {
    data: VentasTendenciasResponse | undefined;
    metric: "money" | "quantity";
    selectedFamilies: string[];
    loading?: boolean;
    familyGroups?: { name: string; families: string[] }[]; // Optional to avoid breaking if not immediately passed
}

type SortDirection = "asc" | "desc" | null;
type SortColumn = "familia" | "total" | string | null; // string for dynamic months

interface SortConfig {
    column: SortColumn;
    direction: SortDirection;
}

interface TableRow {
    familia: string;
    total: number;
    [month: string]: number | string;
}

function SortButton({ column, currentSort, onSort, isNumeric = false }: { column: SortColumn, currentSort: SortConfig, onSort: (c: SortColumn) => void, isNumeric?: boolean }) {
    const isActive = currentSort.column === column;
    const direction = isActive ? currentSort.direction : null;

    return (
        <button
            onClick={() => onSort(column)}
            className={cn(
                "ml-1 p-0.5 rounded hover:bg-slate-200/50 transition-colors inline-flex items-center",
                isActive && "text-indigo-600"
            )}
            title={isNumeric
                ? (direction === "desc" ? "Ordenar de menor a mayor" : "Ordenar de mayor a menor")
                : (direction === "asc" ? "Ordenar Z-A" : "Ordenar A-Z")
            }
        >
            {direction === "asc" ? (
                <ChevronUp className="h-4 w-4" />
            ) : direction === "desc" ? (
                <ChevronDown className="h-4 w-4" />
            ) : (
                <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
            )}
        </button>
    );
}

export function TendenciasTable({ data, metric, selectedFamilies, loading, familyGroups }: TendenciasTableProps) {
    const [sortConfig, setSortConfig] = useState<SortConfig>({ column: "total", direction: "desc" });
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(12);

    const handleSort = (column: SortColumn) => {
        setSortConfig((prev) => {
            if (prev.column === column) {
                if (prev.direction === "desc") return { column, direction: "asc" };
                if (prev.direction === "asc") return { column: null, direction: null };
                return { column, direction: "desc" };
            }
            return { column, direction: column === "familia" ? "asc" : "desc" };
        });
    };

    const tableData = useMemo(() => {
        if (!data?.tendencias || !data.familias) return [];

        // Expand effective families
        const effectiveFamilies = new Set<string>();
        selectedFamilies.forEach(selected => {
            const group = familyGroups?.find(g => g.name === selected);
            if (group) {
                group.families.forEach(f => effectiveFamilies.add(f));
            } else {
                effectiveFamilies.add(selected);
            }
        });

        const familiesToUse = data.familias.filter(f => effectiveFamilies.has(f));
        const months = data.tendencias.map(t => t.label);

        // Pivot data: Row = Family
        const rows: TableRow[] = familiesToUse.map(familia => {
            const row: TableRow = { familia, total: 0 };

            months.forEach(month => {
                const monthData = data.tendencias.find(t => t.label === month);
                let val = 0;
                if (monthData) {
                    const dataPoint = monthData[familia] as TendenciaDataPoint | undefined;
                    val = dataPoint?.[metric === "money" ? "monto" : "cantidad"] || 0;
                }
                row[month] = val;
                row.total += val;
            });

            return row;
        });

        // Sort
        const { column, direction } = sortConfig;
        if (column && direction) {
            rows.sort((a, b) => {
                const aVal = column === "familia" ? a.familia : (a[column] || 0);
                const bVal = column === "familia" ? b.familia : (b[column] || 0);

                if (typeof aVal === "string" && typeof bVal === "string") {
                    return direction === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                }

                return direction === "asc"
                    ? (Number(aVal) - Number(bVal))
                    : (Number(bVal) - Number(aVal));
            });
        }

        return rows;
    }, [data, metric, selectedFamilies, sortConfig]);

    // Calcular totales antes de paginar para mostrar en footer
    const columnTotals: Record<string, number> = {};
    const months = data?.tendencias?.map(t => t.label) || [];
    if (tableData.length > 0) {
        months.forEach(m => {
            columnTotals[m] = tableData.reduce((acc, row) => acc + (Number(row[m]) || 0), 0);
        });
    }
    const grandTotal = tableData.reduce((acc, row) => acc + row.total, 0);


    // Pagination Logic
    const totalItems = tableData.length;
    const totalPages = pageSize === -1 ? 1 : Math.ceil(totalItems / pageSize);
    const paginatedData = useMemo(() => {
        if (pageSize === -1) return tableData;
        const start = (currentPage - 1) * pageSize;
        return tableData.slice(start, start + pageSize);
    }, [tableData, currentPage, pageSize]);


    if (loading) {
        return (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-center h-[200px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    if (!data || tableData.length === 0) return null;

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-6 flex flex-col">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left font-bold text-slate-700 min-w-[200px]">
                                <div className="flex items-center gap-1">
                                    Familia
                                    <SortButton column="familia" currentSort={sortConfig} onSort={handleSort} />
                                </div>
                            </th>
                            {months.map(month => (
                                <th key={month} className="px-4 py-3 text-right font-semibold text-slate-600 min-w-[100px]">
                                    <div className="flex items-center justify-end gap-1">
                                        {month}
                                        <SortButton column={month} currentSort={sortConfig} onSort={handleSort} isNumeric />
                                    </div>
                                </th>
                            ))}
                            <th className="px-4 py-3 text-right font-bold text-indigo-700 bg-indigo-50/50 min-w-[120px]">
                                <div className="flex items-center justify-end gap-1">
                                    Total
                                    <SortButton column="total" currentSort={sortConfig} onSort={handleSort} isNumeric />
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {paginatedData.map((row, idx) => (
                            <tr key={row.familia} className="hover:bg-slate-50 transition-colors">
                                <td className="sticky left-0 bg-white px-4 py-2 font-medium text-slate-800 border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                                    {row.familia}
                                </td>
                                {months.map(month => (
                                    <td key={month} className="px-4 py-2 text-right text-slate-600 tabular-nums">
                                        {metric === "money" ? formatCLP(Number(row[month])) : Number(row[month])}
                                    </td>
                                ))}
                                <td className="px-4 py-2 text-right font-bold text-indigo-700 bg-indigo-50/10 tabular-nums">
                                    {metric === "money" ? formatCLP(row.total) : row.total}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold text-slate-800 border-t border-slate-200">
                        <tr>
                            <td className="sticky left-0 bg-slate-50 px-4 py-3 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">Totales</td>
                            {months.map(month => (
                                <td key={month} className="px-4 py-3 text-right tabular-nums">
                                    {metric === "money" ? formatCLP(columnTotals[month]) : columnTotals[month]}
                                </td>
                            ))}
                            <td className="px-4 py-3 text-right text-indigo-700 bg-indigo-50/20 tabular-nums">
                                {metric === "money" ? formatCLP(grandTotal) : grandTotal}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {/* Pagination Controls */}
            <div className="border-t border-slate-200">
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    totalItems={totalItems}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
                    className="border-none shadow-none"
                />
            </div>
        </div>
    );
}
