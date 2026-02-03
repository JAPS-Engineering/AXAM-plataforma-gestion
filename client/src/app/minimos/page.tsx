"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { AlertTriangle, Save, Search, X, Mail, Plus, Trash2, Send, Bell } from "lucide-react";
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

interface EmailConfig {
    id: number;
    email: string;
    activo: boolean;
    createdAt: string;
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
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Email modal state
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [emails, setEmails] = useState<EmailConfig[]>([]);
    const [newEmail, setNewEmail] = useState("");
    const [loadingEmails, setLoadingEmails] = useState(false);
    const [sendingTest, setSendingTest] = useState(false);
    const [addingEmail, setAddingEmail] = useState(false);
    const [deletingEmail, setDeletingEmail] = useState<string | null>(null);

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

    const fetchEmails = useCallback(async () => {
        setLoadingEmails(true);
        try {
            const res = await fetch('/api/notifications/emails');
            const data = await res.json();
            setEmails(data.emails || []);
        } catch (error) {
            console.error("Error fetching emails:", error);
        } finally {
            setLoadingEmails(false);
        }
    }, []);

    useEffect(() => {
        fetchProductos();
    }, [fetchProductos]);

    useEffect(() => {
        if (showEmailModal) {
            fetchEmails();
        }
    }, [showEmailModal, fetchEmails]);

    useEffect(() => {
        if (successMessage) {
            const timer = setTimeout(() => setSuccessMessage(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [successMessage]);

    useEffect(() => {
        if (errorMessage) {
            const timer = setTimeout(() => setErrorMessage(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [errorMessage]);

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

    // Email handlers
    const handleAddEmail = async () => {
        if (!newEmail.trim() || !newEmail.includes('@')) {
            setErrorMessage('Email inválido');
            return;
        }

        setAddingEmail(true);
        try {
            const res = await fetch('/api/notifications/emails', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: newEmail.trim() })
            });

            const data = await res.json();

            if (res.ok) {
                setEmails(prev => [data.email, ...prev]);
                setNewEmail('');
                setSuccessMessage('Email agregado correctamente');
            } else {
                setErrorMessage(data.error || 'Error al agregar email');
            }
        } catch (error) {
            console.error('Error adding email:', error);
            setErrorMessage('Error al agregar email');
        } finally {
            setAddingEmail(false);
        }
    };

    const handleDeleteEmail = async (email: string) => {
        setDeletingEmail(email);
        try {
            const res = await fetch(`/api/notifications/emails/${encodeURIComponent(email)}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                setEmails(prev => prev.filter(e => e.email !== email));
                setSuccessMessage('Email eliminado');
            } else {
                const data = await res.json();
                setErrorMessage(data.error || 'Error al eliminar email');
            }
        } catch (error) {
            console.error('Error deleting email:', error);
            setErrorMessage('Error al eliminar email');
        } finally {
            setDeletingEmail(null);
        }
    };

    const handleSendTest = async (email: string) => {
        setSendingTest(true);
        try {
            const res = await fetch('/api/notifications/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            const data = await res.json();

            if (res.ok) {
                setSuccessMessage(`Email de prueba enviado a ${email}`);
            } else {
                setErrorMessage(data.error || 'Error al enviar email de prueba');
            }
        } catch (error) {
            console.error('Error sending test:', error);
            setErrorMessage('Error al enviar email de prueba');
        } finally {
            setSendingTest(false);
        }
    };

    const sortedProductos = useMemo(() => {
        const { column, direction } = sortConfig;
        if (!column || !direction) return productos;

        return [...productos].sort((a, b) => {
            let aVal: unknown = a[column as keyof Producto];
            let bVal: unknown = b[column as keyof Producto];

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
                        {/* Notification Config Button */}
                        <button
                            onClick={() => setShowEmailModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg"
                        >
                            <Bell className="h-4 w-4" />
                            <span className="hidden sm:inline">Configurar Notificaciones</span>
                            <span className="sm:hidden">Alertas</span>
                        </button>
                    </div>
                </header>

                {/* Success Message Toast */}
                {successMessage && (
                    <div className="fixed top-4 right-4 z-50 bg-emerald-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                        <Save className="h-4 w-4" />
                        {successMessage}
                    </div>
                )}

                {/* Error Message Toast */}
                {errorMessage && (
                    <div className="fixed top-4 right-4 z-50 bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                        <X className="h-4 w-4" />
                        {errorMessage}
                    </div>
                )}

                {/* Email Configuration Modal */}
                {showEmailModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
                            {/* Modal Header */}
                            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-white/20 rounded-lg">
                                            <Mail className="h-5 w-5 text-white" />
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-semibold text-white">
                                                Notificaciones por Email
                                            </h2>
                                            <p className="text-sm text-blue-100">
                                                Alertas diarias a las 17:00 (hora Chile)
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setShowEmailModal(false)}
                                        className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                                    >
                                        <X className="h-5 w-5 text-white" />
                                    </button>
                                </div>
                            </div>

                            {/* Modal Content */}
                            <div className="p-6">
                                {/* Add Email Form */}
                                <div className="mb-6">
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        Agregar destinatario
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="email"
                                            value={newEmail}
                                            onChange={(e) => setNewEmail(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddEmail()}
                                            placeholder="correo@ejemplo.com"
                                            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                        <button
                                            onClick={handleAddEmail}
                                            disabled={addingEmail}
                                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                                        >
                                            <Plus className="h-4 w-4" />
                                            Agregar
                                        </button>
                                    </div>
                                </div>

                                {/* Email List */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        Destinatarios configurados
                                    </label>
                                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                                        {loadingEmails ? (
                                            <div className="p-8 text-center text-slate-500">
                                                Cargando...
                                            </div>
                                        ) : emails.length === 0 ? (
                                            <div className="p-8 text-center text-slate-500">
                                                <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                                <p>No hay emails configurados</p>
                                                <p className="text-xs mt-1">Agrega un email para recibir alertas de stock bajo</p>
                                            </div>
                                        ) : (
                                            <ul className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                                                {emails.map((emailConfig) => (
                                                    <li
                                                        key={emailConfig.id}
                                                        className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-2 h-2 rounded-full ${emailConfig.activo ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                                            <span className="text-sm text-slate-700">
                                                                {emailConfig.email}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={() => handleSendTest(emailConfig.email)}
                                                                disabled={sendingTest}
                                                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                                                                title="Enviar prueba"
                                                            >
                                                                <Send className="h-4 w-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteEmail(emailConfig.email)}
                                                                disabled={deletingEmail === emailConfig.email}
                                                                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                                                title="Eliminar"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </button>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </div>

                                {/* Info Box */}
                                <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                                    <div className="flex gap-3">
                                        <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                                        <div className="text-sm text-amber-800">
                                            <p className="font-medium mb-1">¿Cómo funciona?</p>
                                            <p>
                                                Todos los días a las <strong>17:00 (hora Chile)</strong>,
                                                el sistema verifica qué productos tienen stock por debajo
                                                del mínimo configurado y envía un email de alerta a los
                                                destinatarios listados.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
                                <button
                                    onClick={() => setShowEmailModal(false)}
                                    className="w-full px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors font-medium"
                                >
                                    Cerrar
                                </button>
                            </div>
                        </div>
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
