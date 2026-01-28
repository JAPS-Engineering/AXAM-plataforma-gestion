"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchTargets, saveProyeccion, saveObjetivo, ObjetivoVenta, ProyeccionVenta } from "@/lib/api";
import { useState } from "react";
import { Save, Edit2, Check, X, Target, User } from "lucide-react";

interface TargetsSectionProps {
    ano?: number;
    mes?: number;
}

export function TargetsSection({ ano, mes }: TargetsSectionProps) {
    const queryClient = useQueryClient();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState<string>("");
    const [editObservacion, setEditObservacion] = useState<string>("");

    // Por simplicidad, asumimos ID de vendedor fijo o global por ahora. 
    // En un sistema real vendría del AuthContext
    const VENDEDOR_ID = "vendedor-1";

    // Fecha actual si no se pasa
    const now = new Date();
    const currentAno = ano || now.getFullYear();
    const currentMes = mes || now.getMonth() + 1;

    const { data, isLoading } = useQuery({
        queryKey: ["targets", currentAno, currentMes],
        queryFn: () => fetchTargets(currentAno, currentMes)
    });

    const mutationProyeccion = useMutation({
        mutationFn: saveProyeccion,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["targets"] });
            setEditingId(null);
        }
    });

    const handleSaveProyeccion = (vendedorId: string) => {
        const monto = parseFloat(editValue);
        if (isNaN(monto)) return;

        mutationProyeccion.mutate({
            vendedorId,
            ano: currentAno,
            mes: currentMes,
            montoPropongo: monto,
            observacion: editObservacion
        });
    };

    const formatCLP = (val: number) => {
        return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP" }).format(val);
    };

    if (isLoading) return <div className="text-center py-4 text-slate-400">Cargando objetivos...</div>;

    // En un caso real, iteraríamos por lista de vendedores. 
    // Aquí simularemos una fila para el vendedor actual y una fila de resumen global.
    const proyeccionActual = data?.proyecciones.find(p => p.vendedorId === VENDEDOR_ID);
    const objetivoGlobal = data?.objetivos.find(o => o.tipo === 'GLOBAL'); // Meta empresa

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Target className="h-5 w-5 text-indigo-600" />
                        Objetivos y Proyecciones
                    </h3>
                    <p className="text-xs text-slate-500">
                        Definición de metas para {currentMes}/{currentAno}
                    </p>
                </div>
            </div>

            <div className="p-6">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th className="px-4 py-3 font-semibold">Tipo</th>
                                <th className="px-4 py-3 font-semibold text-right">Objetivo (Empresa)</th>
                                <th className="px-4 py-3 font-semibold text-right">Propongo (Vendedor)</th>
                                <th className="px-4 py-3 font-semibold text-center">Estado</th>
                                <th className="px-4 py-3 font-semibold">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {/* Fila del Vendedor Actual */}
                            <tr className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-4 font-medium text-slate-900 flex items-center gap-2">
                                    <div className="p-1.5 bg-indigo-100 rounded-md text-indigo-600">
                                        <User className="h-4 w-4" />
                                    </div>
                                    Mi Proyección
                                </td>
                                <td className="px-4 py-4 text-right text-slate-400 italic">
                                    - {/* Objetivo individual no implementado aún */}
                                </td>
                                <td className="px-4 py-4 text-right font-bold text-indigo-700 bg-indigo-50/50">
                                    {editingId === VENDEDOR_ID ? (
                                        <div className="flex flex-col gap-1 items-end">
                                            <input
                                                type="number"
                                                className="w-32 px-2 py-1 text-right text-sm border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                value={editValue}
                                                onChange={(e) => setEditValue(e.target.value)}
                                                autoFocus
                                            />
                                            <input
                                                type="text"
                                                className="w-48 px-2 py-1 text-right text-xs border border-slate-200 rounded text-slate-500"
                                                placeholder="Observación..."
                                                value={editObservacion}
                                                onChange={(e) => setEditObservacion(e.target.value)}
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex flex-col">
                                            <span>{proyeccionActual?.montoPropongo ? formatCLP(proyeccionActual.montoPropongo) : "$0"}</span>
                                            {proyeccionActual?.observacion && (
                                                <span className="text-[10px] text-slate-400 font-normal">{proyeccionActual.observacion}</span>
                                            )}
                                        </div>
                                    )}
                                </td>
                                <td className="px-4 py-4 text-center">
                                    {proyeccionActual ? (
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                            Definido
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                                            Pendiente
                                        </span>
                                    )}
                                </td>
                                <td className="px-4 py-4">
                                    {editingId === VENDEDOR_ID ? (
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleSaveProyeccion(VENDEDOR_ID)}
                                                className="p-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200"
                                                title="Guardar"
                                            >
                                                <Check className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => setEditingId(null)}
                                                className="p-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200"
                                                title="Cancelar"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => {
                                                setEditingId(VENDEDOR_ID);
                                                setEditValue(proyeccionActual?.montoPropongo.toString() || "");
                                                setEditObservacion(proyeccionActual?.observacion || "");
                                            }}
                                            className="p-1.5 hover:bg-slate-200 text-slate-500 rounded transition-colors"
                                            title="Editar"
                                        >
                                            <Edit2 className="h-4 w-4" />
                                        </button>
                                    )}
                                </td>
                            </tr>

                            {/* Fila Global (Solo lectura por ahora) */}
                            <tr className="bg-slate-50/50">
                                <td className="px-4 py-4 font-medium text-slate-900 border-t border-slate-200">
                                    Total Empresa (Global)
                                </td>
                                <td className="px-4 py-4 text-right font-bold text-slate-700 border-t border-slate-200">
                                    {objetivoGlobal ? formatCLP(objetivoGlobal.montoObjetivo) : <span className="text-slate-400 italic">No definido</span>}
                                </td>
                                <td className="px-4 py-4 text-right font-bold text-indigo-700 border-t border-slate-200">
                                    {/* Suma de todas las proyecciones */}
                                    {formatCLP(data?.proyecciones.reduce((sum, p) => sum + p.montoPropongo, 0) || 0)}
                                </td>
                                <td colSpan={2} className="border-t border-slate-200"></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
