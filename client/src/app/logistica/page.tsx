"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, updateLogistica, LogisticaUpdate } from "@/lib/api";
import { Sidebar } from "@/components/sidebar";
import { useState, useMemo } from "react";
import {
    Package2,
    Search,
    Save,
    Loader2,
    Globe,
    Truck,
    Box,
    CheckCircle2
} from "lucide-react";
import { Pagination } from "@/components/pagination";

interface ProductoLogistica {
    id: number;
    sku: string;
    descripcion: string;
    familia: string;
    proveedor: string;
    factorEmpaque: number;
    diasImportacion: number;
    origen: string;
    stockOptimo: number | null;
}

interface LogisticaResponse {
    productos: ProductoLogistica[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export default function LogisticaPage() {
    const queryClient = useQueryClient();
    const [busqueda, setBusqueda] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editData, setEditData] = useState<Partial<ProductoLogistica>>({});

    const { data, isLoading } = useQuery({
        queryKey: ["productos-logistica", page, pageSize, busqueda],
        queryFn: async () => {
            const params = new URLSearchParams({
                page: page.toString(),
                pageSize: pageSize.toString(),
                search: busqueda
            });
            // Reutilizamos el endpoint de mínimos pero pediremos más campos si es necesario, 
            // o creamos uno específico. Por ahora usaremos uno que devuelva todo lo logístico.
            const res = await api.get<LogisticaResponse>(`/productos/minimos?${params}`);
            return res.data;
        }
    });

    const mutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: LogisticaUpdate }) => updateLogistica(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["productos-logistica"] });
            setEditingId(null);
        }
    });

    const handleEdit = (p: ProductoLogistica) => {
        setEditingId(p.id);
        setEditData({
            factorEmpaque: p.factorEmpaque,
            diasImportacion: p.diasImportacion,
            origen: p.origen,
            stockOptimo: p.stockOptimo
        });
    };

    const handleSave = (id: number) => {
        mutation.mutate({
            id,
            data: {
                factorEmpaque: editData.factorEmpaque,
                diasImportacion: editData.diasImportacion,
                origen: editData.origen,
                stockOptimo: editData.stockOptimo
            }
        });
    };

    return (
        <div className="flex h-screen bg-slate-100">
            <Sidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                            <Package2 className="h-6 w-6 text-blue-600" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">Configuración Logística</h1>
                            <p className="text-xs text-slate-500">Gestión de Factor de Empaque y Tiempos</p>
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-auto p-6">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        {/* Filters Bar */}
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center gap-4">
                            <div className="relative flex-1 min-w-[300px]">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar por SKU o descripción..."
                                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                    value={busqueda}
                                    onChange={(e) => {
                                        setBusqueda(e.target.value);
                                        setPage(1);
                                    }}
                                />
                            </div>
                        </div>

                        {/* Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200 uppercase text-xs">
                                    <tr>
                                        <th className="px-6 py-4">Producto</th>
                                        <th className="px-6 py-4 text-center">Origen</th>
                                        <th className="px-6 py-4 text-center">Factor Empaque</th>
                                        <th className="px-6 py-4 text-center">Días Import.</th>
                                        <th className="px-6 py-4 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {isLoading ? (
                                        Array.from({ length: 5 }).map((_, i) => (
                                            <tr key={i} className="animate-pulse">
                                                <td colSpan={5} className="px-6 py-4 h-16 bg-slate-50/50"></td>
                                            </tr>
                                        ))
                                    ) : data?.productos.map((p) => (
                                        <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-slate-900">{p.sku}</div>
                                                <div className="text-xs text-slate-500 truncate max-w-[300px]">{p.descripcion}</div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {editingId === p.id ? (
                                                    <select
                                                        className="px-2 py-1 bg-white border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500"
                                                        value={editData.origen}
                                                        onChange={(e) => setEditData({ ...editData, origen: e.target.value })}
                                                    >
                                                        <option value="NACIONAL">NACIONAL</option>
                                                        <option value="IMPORTADO">IMPORTADO</option>
                                                    </select>
                                                ) : (
                                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold ${p.origen === 'IMPORTADO' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                                                        <Globe className="h-3 w-3" />
                                                        {p.origen}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {editingId === p.id ? (
                                                    <input
                                                        type="number"
                                                        className="w-20 px-2 py-1 text-center bg-white border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500"
                                                        value={editData.factorEmpaque}
                                                        onChange={(e) => setEditData({ ...editData, factorEmpaque: parseFloat(e.target.value) })}
                                                    />
                                                ) : (
                                                    <div className="flex items-center justify-center gap-1 text-slate-600">
                                                        <Box className="h-4 w-4 text-slate-400" />
                                                        {p.factorEmpaque}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {editingId === p.id ? (
                                                    <input
                                                        type="number"
                                                        className="w-20 px-2 py-1 text-center bg-white border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500"
                                                        value={editData.diasImportacion}
                                                        onChange={(e) => setEditData({ ...editData, diasImportacion: parseInt(e.target.value) })}
                                                    />
                                                ) : (
                                                    <div className="flex items-center justify-center gap-1 text-slate-600">
                                                        <Truck className="h-4 w-4 text-slate-400" />
                                                        {p.diasImportacion}d
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {editingId === p.id ? (
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => handleSave(p.id)}
                                                            className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 transition-colors shadow-sm"
                                                            disabled={mutation.isPending}
                                                        >
                                                            {mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                                            Guardar
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingId(null)}
                                                            className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-200 transition-colors"
                                                        >
                                                            Cancelar
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => handleEdit(p)}
                                                        className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors shadow-sm"
                                                    >
                                                        Configurar
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        <div className="p-4 border-t border-slate-100 bg-slate-50">
                            <Pagination
                                currentPage={page}
                                totalPages={data?.totalPages || 1}
                                pageSize={pageSize}
                                totalItems={data?.total || 0}
                                onPageChange={setPage}
                                onPageSizeChange={setPageSize}
                            />
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
