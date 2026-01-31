"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchVendedores, updateVendedor, deleteVendedor, Vendedor } from "@/lib/api";
import {
    Users,
    Edit2,
    Trash2,
    Check,
    X,
    UserPlus,
    Search,
    AlertCircle
} from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { Pagination } from "@/components/pagination";

export default function VendedoresConfigPage() {
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState({ nombre: "", activo: true });

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const { data: vendedores, isLoading } = useQuery({
        queryKey: ["vendedores"],
        queryFn: fetchVendedores
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<Vendedor> }) => updateVendedor(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["vendedores"] });
            alert("Vendedor actualizado");
            setEditingId(null);
        },
        onError: () => alert("Error al actualizar vendedor")
    });

    const deleteMutation = useMutation({
        mutationFn: deleteVendedor,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["vendedores"] });
            alert("Vendedor eliminado");
        },
        onError: () => alert("Error al eliminar vendedor")
    });

    const startEditing = (v: Vendedor) => {
        setEditingId(v.id);
        setEditForm({ nombre: v.nombre || "", activo: v.activo });
    };

    const handleSave = (id: number) => {
        updateMutation.mutate({ id, data: editForm });
    };

    const handleDelete = (id: number) => {
        if (confirm("¿Estás seguro de que deseas eliminar este vendedor?")) {
            deleteMutation.mutate(id);
        }
    };

    const filteredVendedores = useMemo(() => {
        return vendedores?.filter(v =>
            v.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
            v.nombre?.toLowerCase().includes(searchTerm.toLowerCase())
        ) || [];
    }, [vendedores, searchTerm]);

    // Pagination Logic
    const { paginatedData, totalPages } = useMemo(() => {
        if (pageSize === -1) return { paginatedData: filteredVendedores, totalPages: 1 };

        const total = Math.ceil(filteredVendedores.length / pageSize);
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;

        return {
            paginatedData: filteredVendedores.slice(start, end),
            totalPages: total || 1,
        };
    }, [filteredVendedores, currentPage, pageSize]);

    // Reset page when search changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    return (
        <div className="flex h-screen bg-slate-100 overflow-hidden text-slate-900">
            <Sidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                <main className="flex-1 overflow-auto p-8 scrollbar-thin scrollbar-thumb-slate-200">
                    <div className="max-w-5xl mx-auto">
                        <header className="mb-8 flex justify-between items-center">
                            <div>
                                <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
                                    <Users className="w-8 h-8 text-blue-600" />
                                    Gestión de Vendedores
                                </h1>
                                <p className="text-slate-500 mt-2">
                                    Configura apodos para las siglas traídas desde Manager+
                                </p>
                            </div>
                        </header>

                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
                            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-4">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Buscar por código o nombre..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider font-semibold">
                                            <th className="px-6 py-4">Código</th>
                                            <th className="px-6 py-4">Apodo / Nombre Real</th>
                                            <th className="px-6 py-4">Estado</th>
                                            <th className="px-6 py-4 text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {isLoading ? (
                                            <tr>
                                                <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                                                    Cargando vendedores...
                                                </td>
                                            </tr>
                                        ) : paginatedData.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                                                    No se encontraron vendedores.
                                                </td>
                                            </tr>
                                        ) : (
                                            paginatedData.map((v) => (
                                                <tr key={v.id} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="px-6 py-4 font-mono font-bold text-slate-600">
                                                        {v.codigo}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {editingId === v.id ? (
                                                            <input
                                                                type="text"
                                                                value={editForm.nombre}
                                                                onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                                                                className="w-full px-3 py-1 border border-blue-300 rounded focus:ring-2 focus:ring-blue-500/20 outline-none"
                                                                autoFocus
                                                            />
                                                        ) : (
                                                            <span className={v.nombre ? "text-slate-800" : "text-slate-400 italic"}>
                                                                {v.nombre || "Sin apodo"}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {editingId === v.id ? (
                                                            <select
                                                                value={editForm.activo ? "true" : "false"}
                                                                onChange={(e) => setEditForm({ ...editForm, activo: e.target.value === "true" })}
                                                                className="px-2 py-1 border border-blue-300 rounded outline-none"
                                                            >
                                                                <option value="true">Activo</option>
                                                                <option value="false">Inactivo</option>
                                                            </select>
                                                        ) : (
                                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${v.activo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                                                                {v.activo ? 'ACTIVO' : 'INACTIVO'}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex justify-end gap-2">
                                                            {editingId === v.id ? (
                                                                <>
                                                                    <button
                                                                        onClick={() => handleSave(v.id)}
                                                                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors border border-green-100"
                                                                        title="Guardar"
                                                                    >
                                                                        <Check className="w-4 h-4" />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setEditingId(null)}
                                                                        className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg transition-colors border border-slate-100"
                                                                        title="Cancelar"
                                                                    >
                                                                        <X className="w-4 h-4" />
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <button
                                                                        onClick={() => startEditing(v)}
                                                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-100"
                                                                        title="Editar"
                                                                    >
                                                                        <Edit2 className="w-4 h-4" />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDelete(v.id)}
                                                                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-100"
                                                                        title="Eliminar"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="border-t border-slate-100">
                                <Pagination
                                    currentPage={currentPage}
                                    totalPages={totalPages}
                                    pageSize={pageSize}
                                    totalItems={filteredVendedores.length}
                                    onPageChange={setCurrentPage}
                                    onPageSizeChange={(size) => {
                                        setPageSize(size);
                                        setCurrentPage(1);
                                    }}
                                    className="border-none shadow-none rounded-none"
                                />
                            </div>
                        </div>

                        <div className="mt-6 flex items-start gap-4 p-4 bg-amber-50 rounded-xl border border-amber-100 text-amber-800">
                            <AlertCircle className="w-6 h-6 shrink-0" />
                            <div className="text-sm">
                                <p className="font-bold mb-1">Nota sobre la sincronización</p>
                                <p>
                                    Los vendedores se agregan automáticamente a esta lista la primera vez que aparecen en una sincronización de ventas.
                                    Solo necesitas venir aquí para asignarles su nombre real.
                                </p>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
