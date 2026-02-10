"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/sidebar";
import { api } from "@/lib/api";
import { useState } from "react";
import { Shield, Plus, Pencil, Trash2, X, Save, Users, Eye, EyeOff, AlertCircle } from "lucide-react";

interface Usuario {
    id: number;
    username: string;
    nombre: string;
    activo: boolean;
    createdAt: string;
    updatedAt: string;
}

interface UserFormData {
    username: string;
    nombre: string;
    password: string;
    activo: boolean;
}

const emptyForm: UserFormData = {
    username: "",
    nombre: "",
    password: "",
    activo: true,
};

export default function UsuariosPage() {
    const queryClient = useQueryClient();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<Usuario | null>(null);
    const [formData, setFormData] = useState<UserFormData>(emptyForm);
    const [showPassword, setShowPassword] = useState(false);
    const [formError, setFormError] = useState("");
    const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

    // Fetch users
    const { data: usuarios = [], isLoading } = useQuery<Usuario[]>({
        queryKey: ["usuarios"],
        queryFn: async () => {
            const { data } = await api.get("/usuarios");
            return data;
        },
    });

    // Create mutation
    const createMutation = useMutation({
        mutationFn: async (data: UserFormData) => {
            return api.post("/usuarios", data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["usuarios"] });
            closeModal();
        },
        onError: (error: any) => {
            setFormError(error.response?.data?.error || "Error al crear usuario");
        },
    });

    // Update mutation
    const updateMutation = useMutation({
        mutationFn: async ({ id, data }: { id: number; data: Partial<UserFormData> }) => {
            return api.put(`/usuarios/${id}`, data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["usuarios"] });
            closeModal();
        },
        onError: (error: any) => {
            setFormError(error.response?.data?.error || "Error al actualizar usuario");
        },
    });

    // Delete mutation
    const deleteMutation = useMutation({
        mutationFn: async (id: number) => {
            return api.delete(`/usuarios/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["usuarios"] });
            setDeleteConfirm(null);
        },
        onError: (error: any) => {
            alert(error.response?.data?.error || "Error al eliminar usuario");
            setDeleteConfirm(null);
        },
    });

    const openCreateModal = () => {
        setFormData(emptyForm);
        setEditingUser(null);
        setFormError("");
        setShowPassword(false);
        setIsModalOpen(true);
    };

    const openEditModal = (user: Usuario) => {
        setFormData({
            username: user.username,
            nombre: user.nombre,
            password: "",
            activo: user.activo,
        });
        setEditingUser(user);
        setFormError("");
        setShowPassword(false);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingUser(null);
        setFormData(emptyForm);
        setFormError("");
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setFormError("");

        if (!formData.username.trim()) {
            setFormError("El nombre de usuario es requerido");
            return;
        }

        if (editingUser) {
            const updateData: Record<string, unknown> = {
                username: formData.username,
                nombre: formData.nombre,
                activo: formData.activo,
            };
            if (formData.password) {
                updateData.password = formData.password;
            }
            updateMutation.mutate({ id: editingUser.id, data: updateData as Partial<UserFormData> });
        } else {
            if (!formData.password) {
                setFormError("La contraseña es requerida para nuevos usuarios");
                return;
            }
            createMutation.mutate(formData);
        }
    };

    const isMutating = createMutation.isPending || updateMutation.isPending;

    return (
        <div className="flex h-screen bg-slate-100">
            <Sidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <header className="bg-white border-b border-slate-200 px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Shield className="h-6 w-6 text-blue-600" />
                            <div>
                                <h1 className="text-xl font-bold text-slate-900">Gestión de Usuarios</h1>
                                <p className="text-sm text-slate-500">Administra los usuarios de la plataforma</p>
                            </div>
                        </div>
                        <button
                            onClick={openCreateModal}
                            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition-colors font-medium text-sm shadow-lg shadow-blue-600/25"
                        >
                            <Plus className="h-4 w-4" />
                            Agregar Usuario
                        </button>
                    </div>
                </header>

                {/* Content */}
                <main className="flex-1 overflow-auto p-6">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        {isLoading ? (
                            <div className="flex items-center justify-center h-48">
                                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                            </div>
                        ) : usuarios.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                                <Users className="h-12 w-12 mb-3" />
                                <p className="text-lg font-medium">No hay usuarios</p>
                                <p className="text-sm">Crea el primer usuario para comenzar</p>
                            </div>
                        ) : (
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200">
                                        <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Usuario</th>
                                        <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Nombre</th>
                                        <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                                        <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Creado</th>
                                        <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {usuarios.map((user) => (
                                        <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-9 w-9 rounded-full bg-blue-600/10 flex items-center justify-center">
                                                        <span className="text-sm font-bold text-blue-600">
                                                            {user.username.charAt(0).toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <span className="font-medium text-slate-900">{user.username}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-slate-600">
                                                {user.nombre || <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span
                                                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${user.activo
                                                        ? "bg-green-100 text-green-700"
                                                        : "bg-red-100 text-red-700"
                                                        }`}
                                                >
                                                    {user.activo ? "Activo" : "Inactivo"}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-500">
                                                {new Date(user.createdAt).toLocaleDateString("es-CL", {
                                                    day: "2-digit",
                                                    month: "short",
                                                    year: "numeric",
                                                })}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => openEditModal(user)}
                                                        className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition-colors"
                                                        title="Editar"
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </button>

                                                    {deleteConfirm === user.id ? (
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={() => deleteMutation.mutate(user.id)}
                                                                className="px-2 py-1 text-xs bg-red-600 text-white rounded-md hover:bg-red-700"
                                                                disabled={deleteMutation.isPending}
                                                            >
                                                                Confirmar
                                                            </button>
                                                            <button
                                                                onClick={() => setDeleteConfirm(null)}
                                                                className="px-2 py-1 text-xs bg-slate-200 text-slate-600 rounded-md hover:bg-slate-300"
                                                            >
                                                                Cancelar
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => setDeleteConfirm(user.id)}
                                                            className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                                                            title="Eliminar"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </main>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <h3 className="text-lg font-semibold text-slate-900">
                                {editingUser ? "Editar Usuario" : "Nuevo Usuario"}
                            </h3>
                            <button
                                onClick={closeModal}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
                            {/* Username */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Usuario <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                                    placeholder="Nombre de usuario"
                                    autoFocus
                                />
                            </div>

                            {/* Name */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Nombre (opcional)
                                </label>
                                <input
                                    type="text"
                                    value={formData.nombre}
                                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                                    placeholder="Nombre para mostrar"
                                />
                            </div>

                            {/* Password */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Contraseña {editingUser ? "(dejar vacío para no cambiar)" : ""}{" "}
                                    {!editingUser && <span className="text-red-500">*</span>}
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        className="w-full px-3 py-2.5 pr-10 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                                        placeholder={editingUser ? "Nueva contraseña" : "Contraseña"}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Active Toggle (only for edit) */}
                            {editingUser && (
                                <div className="flex items-center justify-between py-2">
                                    <span className="text-sm font-medium text-slate-700">Estado activo</span>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, activo: !formData.activo })}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.activo ? "bg-blue-600" : "bg-slate-300"
                                            }`}
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.activo ? "translate-x-6" : "translate-x-1"
                                                }`}
                                        />
                                    </button>
                                </div>
                            )}

                            {/* Error */}
                            {formError && (
                                <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
                                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                    {formError}
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="px-4 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isMutating}
                                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-500 transition-colors disabled:opacity-50 shadow-lg shadow-blue-600/25"
                                >
                                    {isMutating ? (
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                    ) : (
                                        <Save className="h-4 w-4" />
                                    )}
                                    {editingUser ? "Guardar Cambios" : "Crear Usuario"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

