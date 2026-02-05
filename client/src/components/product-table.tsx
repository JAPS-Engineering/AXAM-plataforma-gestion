"use client";

import { ProductoDashboard, saveOrders } from "@/lib/api";
import { cn } from "@/lib/utils";
import { StockBadge } from "./stock-badge";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

interface ProductTableProps {
    productos: ProductoDashboard[];
    columnas: string[];
    onOrderUpdated?: (productoId: number, cantidad: number, tipo: string) => void;
    pendientesMap?: Record<string, number>;
    // Sorting props
    sortConfig: SortConfig;
    onSort: (column: SortColumn) => void;
    frequency?: 'MONTHLY' | 'WEEKLY';
}

export type SortDirection = "asc" | "desc" | null;
export type SortColumn = "familia" | "sku" | "descripcion" | "promedio" | "ventaMes" | "stock" | "sugerido" | "aComprar" | `mes_${number}` | null;

export interface SortConfig {
    column: SortColumn;
    direction: SortDirection;
}

function formatNumber(num: number | null | undefined): string {
    if (num === null || num === undefined) return "0";
    const n = Number(num);
    if (isNaN(n)) return "0";
    return n.toLocaleString("es-CL");
}

export interface SortButtonProps {
    column: SortColumn;
    currentSort: SortConfig;
    onSort: (column: SortColumn) => void;
    isNumeric?: boolean;
}

export function SortButton({ column, currentSort, onSort, isNumeric = false }: SortButtonProps) {
    const isActive = currentSort.column === column;
    const direction = isActive ? currentSort.direction : null;

    return (
        <button
            onClick={() => onSort(column)}
            className={cn(
                "ml-1 p-0.5 rounded hover:bg-slate-200/50 transition-colors inline-flex items-center",
                isActive && "text-blue-600"
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

import { OrderCell } from "./order-cell";

export function ProductTable({ productos, columnas, onOrderUpdated, pendientesMap, sortConfig, onSort, frequency = 'MONTHLY' }: ProductTableProps) {
    const handleSaveOrder = useCallback(async (productoId: number, cantidad: number, tipo: string) => {
        await saveOrders([{ productoId, cantidad, tipo }]);
        onOrderUpdated?.(productoId, cantidad, tipo);
    }, [onOrderUpdated]);

    if (productos.length === 0) {
        return (
            <div className="flex items-center justify-center h-64 text-slate-500">
                No se encontraron productos
            </div>
        );
    }

    return (
        <div className="overflow-auto max-h-[calc(100vh-320px)] rounded-lg border border-slate-200 shadow-sm">
            <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-30">
                    <tr className="bg-slate-100">
                        {/* FAMILIA - Primera columna */}
                        <th className="sticky left-0 z-40 bg-slate-100 px-4 py-3 text-left font-semibold text-slate-700 border-b border-slate-200 min-w-[100px]">
                            <div className="flex items-center">
                                Familia
                                <SortButton column="familia" currentSort={sortConfig} onSort={onSort} />
                            </div>
                        </th>
                        {/* SKU */}
                        <th className="sticky left-[100px] z-40 bg-slate-100 px-4 py-3 text-left font-semibold text-slate-700 border-b border-slate-200 min-w-[120px]">
                            <div className="flex items-center">
                                SKU
                                <SortButton column="sku" currentSort={sortConfig} onSort={onSort} />
                            </div>
                        </th>
                        {/* Descripción */}
                        <th className="sticky left-[220px] z-40 bg-slate-100 px-4 py-3 text-left font-semibold text-slate-700 border-b border-slate-200 min-w-[250px]">
                            <div className="flex items-center">
                                Descripción
                                <SortButton column="descripcion" currentSort={sortConfig} onSort={onSort} />
                            </div>
                        </th>
                        {/* Columnas históricas */}
                        {columnas.map((col, idx) => (
                            <th
                                key={col}
                                className="px-4 py-3 text-right font-semibold text-slate-700 border-b border-slate-200 min-w-[90px]"
                            >
                                <div className="flex items-center justify-end">
                                    {col}
                                    <SortButton
                                        column={`mes_${idx}` as SortColumn}
                                        currentSort={sortConfig}
                                        onSort={onSort}
                                        isNumeric
                                    />
                                </div>
                            </th>
                        ))}
                        {/* Promedio */}
                        <th className="px-4 py-3 text-right font-semibold text-slate-900 bg-slate-200/50 border-b border-slate-300 border-l border-slate-200 min-w-[100px]">
                            <div className="flex items-center justify-end">
                                {frequency === 'WEEKLY' ? 'Prom. Semanal' : 'Promedio'}
                                <SortButton column="promedio" currentSort={sortConfig} onSort={onSort} isNumeric />
                            </div>
                        </th>
                        {/* Mes Actual */}
                        <th className="px-4 py-3 text-right font-semibold text-blue-700 bg-blue-50 border-b border-blue-200 border-l-2 border-l-blue-400 min-w-[100px]">
                            <div className="flex items-center justify-end">
                                {frequency === 'WEEKLY' ? 'Venta Semana' : 'Venta Mes'}
                                <SortButton column="ventaMes" currentSort={sortConfig} onSort={onSort} isNumeric />
                            </div>
                        </th>
                        <th className="px-4 py-3 text-right font-semibold text-blue-700 bg-blue-50 border-b border-blue-200 min-w-[90px]">
                            <div className="flex items-center justify-end">
                                Stock
                                <SortButton column="stock" currentSort={sortConfig} onSort={onSort} isNumeric />
                            </div>
                        </th>
                        <th className="px-4 py-3 text-center font-semibold text-blue-700 bg-blue-50 border-b border-blue-200 min-w-[80px]">
                            Estado
                        </th>
                        {/* PENDIENTES */}
                        <th className="px-4 py-3 text-right font-semibold text-amber-700 bg-amber-50 border-b border-amber-200 min-w-[100px]">
                            <div className="flex items-center justify-end">
                                Pendiente (3M)
                            </div>
                        </th>
                        {/* SUGERIDO - Destacado */}
                        <th className="px-4 py-3 text-right font-semibold text-emerald-800 bg-emerald-100 border-b border-emerald-300 border-l-2 border-l-emerald-500 min-w-[110px]">
                            <div className="flex items-center justify-end">
                                Sugerido
                                <SortButton column="sugerido" currentSort={sortConfig} onSort={onSort} isNumeric />
                            </div>
                        </th>
                        <th className="px-4 py-3 text-right font-semibold text-amber-700 bg-amber-50 border-b border-amber-200 min-w-[110px]">
                            <div className="flex items-center justify-end">
                                A Comprar
                                <SortButton column="aComprar" currentSort={sortConfig} onSort={onSort} isNumeric />
                            </div>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {productos.map((item, idx) => {
                        const compraSugerida = item.compraSugerida || 0;
                        const bajoMinimo = item.bajoMinimo;
                        const pendientes = pendientesMap ? (pendientesMap[item.producto.sku] || 0) : 0;
                        const sugeridoFinal = Math.max(0, compraSugerida - pendientes);

                        return (
                            <tr
                                key={item.producto.id}
                                className={cn(
                                    "transition-colors",
                                    bajoMinimo
                                        ? "bg-red-50 hover:bg-red-100"
                                        : idx % 2 === 0 ? "bg-white hover:bg-slate-50" : "bg-slate-50/50 hover:bg-slate-100"
                                )}
                            >
                                {/* FAMILIA - Primera columna */}
                                <td className={cn(
                                    "sticky left-0 z-20 px-4 py-2 text-slate-500 border-b border-slate-100",
                                    bajoMinimo ? "bg-red-50" : idx % 2 === 0 ? "bg-white" : "bg-slate-50"
                                )}>
                                    {item.producto.familia || "-"}
                                </td>
                                {/* SKU */}
                                <td className={cn(
                                    "sticky left-[100px] z-20 px-4 py-2 font-medium text-slate-800 border-b border-slate-100",
                                    bajoMinimo ? "bg-red-50" : idx % 2 === 0 ? "bg-white" : "bg-slate-50"
                                )}>
                                    {item.producto.sku}
                                </td>
                                {/* Descripción */}
                                <td className={cn(
                                    "sticky left-[220px] z-20 px-4 py-2 text-slate-600 border-b border-slate-100 max-w-[300px] truncate shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]",
                                    bajoMinimo ? "bg-red-50" : idx % 2 === 0 ? "bg-white" : "bg-slate-50"
                                )}>
                                    {item.producto.descripcion}
                                </td>
                                {/* Ventas históricas */}
                                {item.ventasMeses.map((mes, i) => (
                                    <td
                                        key={i}
                                        className="px-4 py-2 text-right text-slate-600 border-b border-slate-100 tabular-nums"
                                    >
                                        {formatNumber(mes.cantidad)}
                                    </td>
                                ))}
                                {/* Promedio */}
                                <td className="px-4 py-2 text-right text-slate-900 font-medium border-b border-slate-200 bg-slate-100/30 border-l border-slate-100 tabular-nums">
                                    {formatNumber(Math.round(item.promedio || 0))}
                                </td>
                                {/* Mes actual */}
                                <td className="px-4 py-2 text-right text-slate-800 font-medium border-b border-blue-100 bg-blue-50/30 border-l-2 border-l-blue-400 tabular-nums">
                                    {formatNumber(item.mesActual?.ventaActual)}
                                </td>
                                <td className="px-4 py-2 text-right text-slate-800 border-b border-blue-100 bg-blue-50/30 tabular-nums">
                                    {formatNumber(item.mesActual?.stockActual)}
                                </td>
                                <td className="px-4 py-2 text-center border-b border-blue-100 bg-blue-50/30">
                                    <StockBadge
                                        stock={item.mesActual?.stockActual || 0}
                                        promedio={item.promedio || 0}
                                        sugerido={compraSugerida}
                                    />
                                </td>
                                {/* PENDIENTES */}
                                <td className="px-4 py-2 text-right border-b border-amber-100 bg-amber-50/20 tabular-nums text-amber-700 font-medium">
                                    {formatNumber(pendientes)}
                                </td>
                                {/* SUGERIDO - Destacado */}
                                <td
                                    className={cn(
                                        "px-4 py-2 text-right border-b border-emerald-200 bg-emerald-50 border-l-2 border-l-emerald-500 tabular-nums font-semibold",
                                        sugeridoFinal > 0 && "text-emerald-700",
                                        sugeridoFinal < 0 && "text-red-600",
                                        sugeridoFinal === 0 && "text-slate-500"
                                    )}
                                >
                                    {formatNumber(sugeridoFinal)}
                                </td>
                                <td className="px-4 py-2 border-b border-amber-100 bg-amber-50/30">
                                    <OrderCell
                                        productoId={item.producto.id}
                                        initialValue={item.compraRealizar}
                                        initialType={item.tipoCompra}
                                        onSave={handleSaveOrder}
                                    />
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
