"use client";

import { ProductoDashboard, saveOrders } from "@/lib/api";
import { cn } from "@/lib/utils";
import { StockBadge } from "./stock-badge";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

interface ProductTableProps {
    productos: ProductoDashboard[];
    columnas: string[];
    onOrderUpdated?: () => void;
}

type SortDirection = "asc" | "desc" | null;
type SortColumn = "familia" | "sku" | "descripcion" | "ventaMes" | "stock" | "sugerido" | "aComprar" | `mes_${number}` | null;

interface SortConfig {
    column: SortColumn;
    direction: SortDirection;
}

function formatNumber(num: number | null | undefined): string {
    if (num === null || num === undefined) return "0";
    const n = Number(num);
    if (isNaN(n)) return "0";
    return n.toLocaleString("es-CL");
}

interface SortButtonProps {
    column: SortColumn;
    currentSort: SortConfig;
    onSort: (column: SortColumn) => void;
    isNumeric?: boolean;
}

function SortButton({ column, currentSort, onSort, isNumeric = false }: SortButtonProps) {
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

interface EditableCellProps {
    productoId: number;
    initialValue: number | null;
    onSave: (productoId: number, value: number) => Promise<void>;
}

function EditableCell({ productoId, initialValue, onSave }: EditableCellProps) {
    const [value, setValue] = useState<string>(initialValue?.toString() ?? "");
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanged, setHasChanged] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const originalValue = useRef(initialValue);

    useEffect(() => {
        setValue(initialValue?.toString() ?? "");
        originalValue.current = initialValue;
    }, [initialValue]);

    const handleSave = useCallback(async (newValue: string) => {
        const numValue = newValue === "" ? 0 : parseFloat(newValue);
        if (isNaN(numValue) || numValue < 0) {
            setValue(originalValue.current?.toString() ?? "");
            return;
        }

        if (numValue === originalValue.current) {
            setHasChanged(false);
            return;
        }

        setIsSaving(true);
        try {
            await onSave(productoId, numValue);
            originalValue.current = numValue;
            setHasChanged(false);
        } catch (error) {
            setValue(originalValue.current?.toString() ?? "");
            console.error("Error guardando:", error);
        } finally {
            setIsSaving(false);
        }
    }, [onSave, productoId]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setValue(newValue);
        setHasChanged(true);

        // Debounce auto-save
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
            handleSave(newValue);
        }, 800);
    }, [handleSave]);

    const handleBlur = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        if (hasChanged) {
            handleSave(value);
        }
    }, [hasChanged, value, handleSave]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.currentTarget.blur();
        }
    }, []);

    return (
        <input
            type="text"
            inputMode="numeric"
            value={value}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className={cn(
                "w-full px-2 py-1 text-right bg-amber-50 border border-transparent rounded",
                "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white",
                "hover:border-amber-300 transition-colors",
                isSaving && "opacity-50"
            )}
            disabled={isSaving}
        />
    );
}

export function ProductTable({ productos, columnas, onOrderUpdated }: ProductTableProps) {
    const [sortConfig, setSortConfig] = useState<SortConfig>({ column: null, direction: null });

    const handleSaveOrder = useCallback(async (productoId: number, cantidad: number) => {
        await saveOrders([{ productoId, cantidad }]);
        onOrderUpdated?.();
    }, [onOrderUpdated]);

    const handleSort = useCallback((column: SortColumn) => {
        setSortConfig((prev) => {
            if (prev.column === column) {
                // Cycle: null -> asc -> desc -> null
                if (prev.direction === null) return { column, direction: "asc" };
                if (prev.direction === "asc") return { column, direction: "desc" };
                return { column: null, direction: null };
            }
            return { column, direction: "asc" };
        });
    }, []);

    // Sorted products
    const sortedProductos = useMemo(() => {
        if (!sortConfig.column || !sortConfig.direction) return productos;

        const sorted = [...productos].sort((a, b) => {
            let aValue: string | number;
            let bValue: string | number;

            switch (sortConfig.column) {
                case "familia":
                    aValue = (a.producto.familia || "").toLowerCase();
                    bValue = (b.producto.familia || "").toLowerCase();
                    break;
                case "sku":
                    aValue = a.producto.sku.toLowerCase();
                    bValue = b.producto.sku.toLowerCase();
                    break;
                case "descripcion":
                    aValue = a.producto.descripcion.toLowerCase();
                    bValue = b.producto.descripcion.toLowerCase();
                    break;
                case "ventaMes":
                    aValue = a.mesActual?.ventaActual || 0;
                    bValue = b.mesActual?.ventaActual || 0;
                    break;
                case "stock":
                    aValue = a.mesActual?.stockActual || 0;
                    bValue = b.mesActual?.stockActual || 0;
                    break;
                case "sugerido":
                    aValue = a.compraSugerida || 0;
                    bValue = b.compraSugerida || 0;
                    break;
                case "aComprar":
                    aValue = a.compraRealizar || 0;
                    bValue = b.compraRealizar || 0;
                    break;
                default:
                    // Handle mes_X columns
                    if (sortConfig.column?.startsWith("mes_")) {
                        const mesIndex = parseInt(sortConfig.column.split("_")[1], 10);
                        aValue = a.ventasMeses[mesIndex]?.cantidad || 0;
                        bValue = b.ventasMeses[mesIndex]?.cantidad || 0;
                    } else {
                        return 0;
                    }
            }

            if (typeof aValue === "string" && typeof bValue === "string") {
                return sortConfig.direction === "asc"
                    ? aValue.localeCompare(bValue)
                    : bValue.localeCompare(aValue);
            }

            // Numbers: desc = mayor primero
            return sortConfig.direction === "desc"
                ? (bValue as number) - (aValue as number)
                : (aValue as number) - (bValue as number);
        });

        return sorted;
    }, [productos, sortConfig]);

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
                                <SortButton column="familia" currentSort={sortConfig} onSort={handleSort} />
                            </div>
                        </th>
                        {/* SKU */}
                        <th className="sticky left-[100px] z-40 bg-slate-100 px-4 py-3 text-left font-semibold text-slate-700 border-b border-slate-200 min-w-[120px]">
                            <div className="flex items-center">
                                SKU
                                <SortButton column="sku" currentSort={sortConfig} onSort={handleSort} />
                            </div>
                        </th>
                        {/* Descripción */}
                        <th className="sticky left-[220px] z-40 bg-slate-100 px-4 py-3 text-left font-semibold text-slate-700 border-b border-slate-200 min-w-[250px]">
                            <div className="flex items-center">
                                Descripción
                                <SortButton column="descripcion" currentSort={sortConfig} onSort={handleSort} />
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
                                        onSort={handleSort}
                                        isNumeric
                                    />
                                </div>
                            </th>
                        ))}
                        {/* Mes Actual */}
                        <th className="px-4 py-3 text-right font-semibold text-blue-700 bg-blue-50 border-b border-blue-200 border-l-2 border-l-blue-400 min-w-[100px]">
                            <div className="flex items-center justify-end">
                                Venta Mes
                                <SortButton column="ventaMes" currentSort={sortConfig} onSort={handleSort} isNumeric />
                            </div>
                        </th>
                        <th className="px-4 py-3 text-right font-semibold text-blue-700 bg-blue-50 border-b border-blue-200 min-w-[90px]">
                            <div className="flex items-center justify-end">
                                Stock
                                <SortButton column="stock" currentSort={sortConfig} onSort={handleSort} isNumeric />
                            </div>
                        </th>
                        <th className="px-4 py-3 text-center font-semibold text-blue-700 bg-blue-50 border-b border-blue-200 min-w-[80px]">
                            Estado
                        </th>
                        {/* SUGERIDO - Destacado */}
                        <th className="px-4 py-3 text-right font-semibold text-emerald-800 bg-emerald-100 border-b border-emerald-300 border-l-2 border-l-emerald-500 min-w-[110px]">
                            <div className="flex items-center justify-end">
                                Sugerido
                                <SortButton column="sugerido" currentSort={sortConfig} onSort={handleSort} isNumeric />
                            </div>
                        </th>
                        <th className="px-4 py-3 text-right font-semibold text-amber-700 bg-amber-50 border-b border-amber-200 min-w-[110px]">
                            <div className="flex items-center justify-end">
                                A Comprar
                                <SortButton column="aComprar" currentSort={sortConfig} onSort={handleSort} isNumeric />
                            </div>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {sortedProductos.map((item, idx) => {
                        const compraSugerida = item.compraSugerida || 0;
                        const bajoMinimo = item.bajoMinimo;

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
                                {/* SUGERIDO - Destacado */}
                                <td
                                    className={cn(
                                        "px-4 py-2 text-right border-b border-emerald-200 bg-emerald-50 border-l-2 border-l-emerald-500 tabular-nums font-semibold",
                                        compraSugerida > 0 && "text-emerald-700",
                                        compraSugerida < 0 && "text-red-600",
                                        compraSugerida === 0 && "text-slate-500"
                                    )}
                                >
                                    {formatNumber(compraSugerida)}
                                </td>
                                <td className="px-4 py-2 border-b border-amber-100 bg-amber-50/30">
                                    <EditableCell
                                        productoId={item.producto.id}
                                        initialValue={item.compraRealizar}
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

