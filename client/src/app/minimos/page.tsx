"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { AlertTriangle, Save, Search, X } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { Pagination } from "@/components/pagination";
import { SortButton } from "@/components/sort-button";

interface Producto {
    id: number;
    sku: string;
    descripcion: string;
    familia: string;
    proveedor: string;
    stockMinimo: number | null;
    stockActual?: number;
}

export default function MinimosPage() {
    const [productos, setProductos] = useState<Producto[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<number | null>(null);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<"todos" | "configurados" | "sin_configurar">("todos");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editValue, setEditValue] = useState<string>("");
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Sorting state
    const [sortConfig, setSortConfig] = useState<{ column: string | null; direction: "asc" | "desc" | null }>({ column: null, direction: null });

    const fetchProductos = useCallback(async () => {
        setLoading(true);
        try {
            const effectivePageSize = pageSize === -1 ? 10000 : pageSize;
            const params = new URLSearchParams({
                page: page.toString(),
                pageSize: effectivePageSize.toString(),
                search,
                filter,
            });
            const res = await fetch(`/api/productos/minimos?${params}`);
            const data = await res.json();
            setProductos(data.productos);
            setTotalPages(data.totalPages);
            setTotalItems(data.totalItems || data.productos.length);
        } catch (error) {
            console.error("Error fetching productos:", error);
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, search, filter]);

    useEffect(() => {
        fetchProductos();
    }, [fetchProductos]);

    useEffect(() => {
        if (successMessage) {
            const timer = setTimeout(() => setSuccessMessage(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [successMessage]);

    const handleEdit = (producto: Producto) => {
        setEditingId(producto.id);
        setEditValue(producto.stockMinimo?.toString() || "");
    };

    const handleCancel = () => {
        setEditingId(null);
        setEditValue("");
    };

    const handleSave = async (producto: Producto) => {
        setSaving(producto.id);
        try {
            const stockMinimo = editValue.trim() === "" ? null : parseFloat(editValue);

            const res = await fetch(`/api/productos/${producto.id}/minimo`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ stockMinimo }),
            });

            if (res.ok) {
                setProductos((prev) =>
                    prev.map((p) =>
                        p.id === producto.id ? { ...p, stockMinimo } : p
                    )
                );
                setSuccessMessage(`Stock mínimo de ${producto.sku} actualizado correctamente`);
                setEditingId(null);
                setEditValue("");
            }
        } catch (error) {
            console.error("Error saving:", error);
        } finally {
            setSaving(null);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent, producto: Producto) => {
        if (e.key === "Enter") {
            handleSave(producto);
        } else if (e.key === "Escape") {
            handleCancel();
        }
    };

    const handleSort = (column: string) => {
        setSortConfig((prev) => {
            if (prev.column === column) {
                if (prev.direction === "desc") return { column, direction: "asc" };
                if (prev.direction === "asc") return { column: null, direction: null };
                return { column, direction: "desc" };
            }
            return { column, direction: column === "sku" || column === "descripcion" || column === "familia" ? "asc" : "desc" };
        });
    };

    const sortedProductos = useMemo(() => {
        const { column, direction } = sortConfig;
        if (!column || !direction) return productos;

        return [...productos].sort((a, b) => {
            let aVal: any = a[column as keyof Producto];
            let bVal: any = b[column as keyof Producto];

            // Handle potential null/undefined
            if (aVal === null || aVal === undefined) aVal = "";
            if (bVal === null || bVal === undefined) bVal = "";

            if (typeof aVal === "string" && typeof bVal === "string") {
                return direction === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }

            const numA = Number(aVal) || 0;
            const numB = Number(bVal) || 0;

            return direction === "asc" ? numA - numB : numB - numA;
        });
    }, [productos, sortConfig]);

    return (
        <div className="flex h-screen bg-slate-100">
            <Sidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <header className="bg-white border-b border-slate-200 px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-amber-100">
                                <AlertTriangle className="h-6 w-6 text-amber-600" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-slate-900">
                                    Configuración de Stock Mínimo
                                </h1>
                                <p className="text-sm text-slate-500">
                                    Define umbrales de alerta para cada producto
                                </p>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Success Message Toast */}
                {successMessage && (
                    <div className="fixed top-4 right-4 z-50 bg-emerald-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                        <Save className="h-4 w-4" />
                        {successMessage}
                    </div>
                )}

                {/* Filters */}
                <div className="bg-white border-b border-slate-200 px-6 py-3">
                    <div className="flex items-center gap-4">
                        {/* Search */}
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Buscar por SKU o descripción..."
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setPage(1);
                                }}
                                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>

                        {/* Filter Buttons */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => { setFilter("todos"); setPage(1); }}
                                className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${filter === "todos"
                                    ? "bg-blue-600 text-white"
                                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                    }`}
                            >
                                Todos
                            </button>
                            <button
                                onClick={() => { setFilter("configurados"); setPage(1); }}
                                className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${filter === "configurados"
                                    ? "bg-emerald-600 text-white"
                                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                    }`}
                            >
                                Configurados
                            </button>
                            <button
                                onClick={() => { setFilter("sin_configurar"); setPage(1); }}
                                className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${filter === "sin_configurar"
                                    ? "bg-amber-600 text-white"
                                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                    }`}
                            >
                                Sin Configurar
                            </button>
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-auto p-6">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                        <div className="flex items-center gap-1">
                                            SKU
                                            <SortButton column="sku" currentSort={sortConfig} onSort={handleSort} />
                                        </div>
                                    </th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                        <div className="flex items-center gap-1">
                                            Descripción
                                            <SortButton column="descripcion" currentSort={sortConfig} onSort={handleSort} />
                                        </div>
                                    </th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                        <div className="flex items-center gap-1">
                                            Familia
                                            <SortButton column="familia" currentSort={sortConfig} onSort={handleSort} />
                                        </div>
                                    </th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                        <div className="flex items-center gap-1">
                                            Stock Actual
                                            <SortButton column="stockActual" currentSort={sortConfig} onSort={handleSort} isNumeric />
                                        </div>
                                    </th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                        <div className="flex items-center gap-1">
                                            Stock Mínimo
                                            <SortButton column="stockMinimo" currentSort={sortConfig} onSort={handleSort} isNumeric />
                                        </div>
                                    </th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                        Acciones
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                                            Cargando productos...
                                        </td>
                                    </tr>
                                ) : productos.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                                            No se encontraron productos
                                        </td>
                                    </tr>
                                ) : (
                                    sortedProductos.map((producto) => (
                                        <tr key={producto.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-3">
                                                <span className="font-mono text-sm font-medium text-slate-900">
                                                    {producto.sku}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-sm text-slate-700 line-clamp-1">
                                                    {producto.descripcion}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                                                    {producto.familia || "Sin familia"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`text-sm font-medium ${producto.stockMinimo && producto.stockActual && producto.stockActual < producto.stockMinimo
                                                    ? "text-red-600"
                                                    : "text-slate-700"
                                                    }`}>
                                                    {producto.stockActual?.toLocaleString() ?? "-"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                {editingId === producto.id ? (
                                                    <input
                                                        type="number"
                                                        value={editValue}
                                                        onChange={(e) => setEditValue(e.target.value)}
                                                        onKeyDown={(e) => handleKeyDown(e, producto)}
                                                        className="w-24 px-2 py-1 border border-blue-500 rounded text-sm focus:ring-2 focus:ring-blue-500"
                                                        placeholder="Vacío"
                                                        autoFocus
                                                        min="0"
                                                        step="1"
                                                    />
                                                ) : (
                                                    <span
                                                        onClick={() => handleEdit(producto)}
                                                        className={`cursor-pointer text-sm font-medium px-2 py-1 rounded ${producto.stockMinimo !== null
                                                            ? "text-emerald-700 bg-emerald-50"
                                                            : "text-slate-400 bg-slate-100 italic"
                                                            }`}
                                                    >
                                                        {producto.stockMinimo !== null
                                                            ? producto.stockMinimo.toLocaleString()
                                                            : "No definido"}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {editingId === producto.id ? (
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button
                                                            onClick={() => handleSave(producto)}
                                                            disabled={saving === producto.id}
                                                            className="p-1.5 rounded-lg bg-emerald-100 text-emerald-600 hover:bg-emerald-200 transition-colors disabled:opacity-50"
                                                            title="Guardar"
                                                        >
                                                            <Save className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            onClick={handleCancel}
                                                            className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                                                            title="Cancelar"
                                                        >
                                                            <X className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => handleEdit(producto)}
                                                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                                    >
                                                        Editar
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>

                        {/* Pagination - inside card like ResumenMesActualTable */}
                        <div className="border-t border-slate-200">
                            <Pagination
                                currentPage={page}
                                totalPages={totalPages}
                                pageSize={pageSize}
                                totalItems={totalItems}
                                onPageChange={setPage}
                                onPageSizeChange={(size) => {
                                    setPageSize(size);
                                    setPage(1);
                                }}
                                className="border-none shadow-none"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

