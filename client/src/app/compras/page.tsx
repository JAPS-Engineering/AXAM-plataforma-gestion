"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Sidebar } from "@/components/sidebar";
import {
    TrendingUp,
    Calculator,
    RefreshCw,
    Search,
    Info,
    ArrowUp,
    ArrowDown,
    Minus,
    Save,
    CheckCircle2,
    XCircle
} from "lucide-react";
import { PendingShipmentsSync } from "@/components/pending-shipments-sync";

interface SuggestedPurchase {
    id: number;
    sku: string;
    descripcion: string;
    familia: string;
    stockActual: number;
    stockMinimo: number | null;
    stockOptimo?: number | null; // Nuevo campo opcional
    promedioVenta: number;
    tendencia: number;
    prediccionProximoMes: number;
    cantidadSugerida: number;
    mesesCobertura: number;
    algoritmo: string;
    compraRealizar: number | null;
    pendientes?: number; // Campo para los pendientes de despacho
}

interface ApiResponse {
    proveedor: string;
    tipoFiltro: string;
    algoritmo: string;
    meses: number;
    mesesCobertura: number;
    totalItems: number;
    totalUnidades: number;
    items: SuggestedPurchase[];
}

interface Proveedor {
    nombre: string;
    productosCount: number;
}

const ALGORITMOS = [
    {
        value: "LINEAL",
        label: "Promedio Simple",
        description: "Calcula el promedio de ventas de los últimos N meses y multiplica por la cobertura objetivo.",
        formula: "Sugerido = (Promedio × Cobertura) - Stock Actual"
    },
    {
        value: "PREDICCION",
        label: "Con Tendencia (Regresión Lineal)",
        description: "Analiza la tendencia de ventas usando regresión lineal para predecir ventas futuras.",
        formula: "Tendencia = pendiente de regresión lineal sobre ventas históricas. Predicción = Promedio + (Tendencia × meses futuros). Sugerido = (Predicción × Cobertura) - Stock Actual"
    }
];

const MESES_HISTORICO = [
    { value: 3, label: "3 meses" },
    { value: 6, label: "6 meses" },
    { value: 12, label: "12 meses" }
];

const MESES_COBERTURA = [
    { value: 1, label: "1 mes" },
    { value: 2, label: "2 meses" },
    { value: 3, label: "3 meses" }
];

export default function AnalisisPage() {
    // Estados de configuración
    const [proveedores, setProveedores] = useState<Proveedor[]>([]);
    const [proveedorSeleccionado, setProveedorSeleccionado] = useState<string>("");
    const [tipoFiltro, setTipoFiltro] = useState<string>("familia");
    const [algoritmo, setAlgoritmo] = useState("LINEAL");
    const [mesesHistorico, setMesesHistorico] = useState(6);
    const [mesesCobertura, setMesesCobertura] = useState(2);
    const [soloEnQuiebre, setSoloEnQuiebre] = useState(false);
    const [ocultarCero, setOcultarCero] = useState(true);
    const [salesStatus, setSalesStatus] = useState<'all' | 'with_sales' | 'without_sales'>('all');

    // Estados de datos
    const [data, setData] = useState<ApiResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingProveedores, setLoadingProveedores] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Manager+ Sync State
    const [fetchingPendientes, setFetchingPendientes] = useState(false);
    const [pendientesData, setPendientesData] = useState<Record<string, number>>({});

    // Búsqueda
    const [search, setSearch] = useState("");

    // Estado para ediciones pendientes
    const [editingValues, setEditingValues] = useState<Record<number, string>>({});
    const [savingId, setSavingId] = useState<number | null>(null);

    // Cargar proveedores/familias al inicio
    useEffect(() => {
        async function loadProveedores() {
            try {
                const res = await fetch("/api/purchase/proveedores");
                const json = await res.json();
                setProveedores(json.proveedores || []);
                setTipoFiltro(json.tipo || "familia");
                if (json.proveedores?.length > 0) {
                    setProveedorSeleccionado(json.proveedores[0].nombre);
                }
            } catch (err) {
                console.error("Error loading proveedores:", err);
            } finally {
                setLoadingProveedores(false);
            }
        }
        loadProveedores();
    }, []);

    const onPendientesLoaded = useCallback((map: Record<string, number>) => {
        setPendientesData(map);
        setFetchingPendientes(false);
    }, []);

    // Función para calcular sugerencias
    const calcularSugerencias = useCallback(async () => {
        if (!proveedorSeleccionado) return;

        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({
                proveedor: proveedorSeleccionado,
                tipoFiltro,
                algoritmo,
                meses: mesesHistorico.toString(),
                mesesCobertura: mesesCobertura.toString(),
                soloEnQuiebre: soloEnQuiebre.toString()
            });

            const res = await fetch(`/api/purchase/suggested?${params}`);
            if (!res.ok) throw new Error("Error al obtener análisis");

            const json = await res.json();
            setData(json);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [proveedorSeleccionado, tipoFiltro, algoritmo, mesesHistorico, mesesCobertura, soloEnQuiebre]);

    // Calcular al cambiar configuración
    useEffect(() => {
        if (proveedorSeleccionado) {
            calcularSugerencias();
        }
    }, [calcularSugerencias, proveedorSeleccionado]);

    const itemsFiltrados = useMemo(() => {
        if (!data?.items) return [];
        let result = data.items;

        // Search filter
        if (search.trim()) {
            const term = search.toLowerCase();
            result = result.filter(item =>
                item.sku.toLowerCase().includes(term) ||
                item.descripcion.toLowerCase().includes(term)
            );
        }

        // Unified sales filter logic
        if (salesStatus === 'with_sales' || ocultarCero) {
            result = result.filter((p) => (p.promedioVenta || 0) > 0);
        } else if (salesStatus === 'without_sales') {
            result = result.filter((p) => (p.promedioVenta || 0) === 0);
        }

        return result;
    }, [data?.items, search, salesStatus, ocultarCero]);

    // Guardar valor de A Comprar
    const handleSaveCompra = async (item: SuggestedPurchase) => {
        const value = editingValues[item.id];
        if (value === undefined) return;

        const cantidad = value.trim() === "" ? 0 : parseInt(value, 10);
        if (isNaN(cantidad)) return;

        setSavingId(item.id);
        try {
            await fetch("/api/dashboard/orden", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    items: [{ productoId: item.id, cantidad }]
                })
            });

            // Actualizar localmente
            if (data) {
                setData({
                    ...data,
                    items: data.items.map(i =>
                        i.id === item.id ? { ...i, compraRealizar: cantidad } : i
                    )
                });
            }
            // Limpiar edición
            setEditingValues(prev => {
                const next = { ...prev };
                delete next[item.id];
                return next;
            });
        } catch (err) {
            console.error("Error guardando:", err);
        } finally {
            setSavingId(null);
        }
    };

    const algoritmoInfo = ALGORITMOS.find(a => a.value === algoritmo);

    return (
        <div className="flex h-screen bg-slate-100">
            <Sidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm">
                    <div className="flex items-center gap-3">
                        <Calculator className="h-6 w-6 text-indigo-600" />
                        <h1 className="text-xl font-bold text-slate-900">Análisis Personalizado</h1>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={calcularSugerencias}
                            disabled={loading || !proveedorSeleccionado}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                            Recalcular
                        </button>

                        <div className="h-8 w-px bg-slate-200 mx-2" />

                        <PendingShipmentsSync
                            onPendientesLoaded={onPendientesLoaded}
                        />
                    </div>
                </header>

                <main className="flex-1 overflow-auto p-6 relative">
                    {/* Configuración Panel */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                            {/* Familia/Proveedor */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    {tipoFiltro === 'familia' ? 'Familia' : 'Proveedor'}
                                </label>
                                <select
                                    value={proveedorSeleccionado}
                                    onChange={(e) => setProveedorSeleccionado(e.target.value)}
                                    disabled={loadingProveedores}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                >
                                    {loadingProveedores ? (
                                        <option>Cargando...</option>
                                    ) : proveedores.length === 0 ? (
                                        <option>Sin opciones</option>
                                    ) : (
                                        proveedores.map((p) => (
                                            <option key={p.nombre} value={p.nombre}>
                                                {p.nombre} ({p.productosCount})
                                            </option>
                                        ))
                                    )}
                                </select>
                            </div>

                            {/* Algoritmo */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Algoritmo de Cálculo
                                </label>
                                <select
                                    value={algoritmo}
                                    onChange={(e) => setAlgoritmo(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                >
                                    {ALGORITMOS.map((a) => (
                                        <option key={a.value} value={a.value}>
                                            {a.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Meses Histórico */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Histórico de Ventas
                                </label>
                                <select
                                    value={mesesHistorico}
                                    onChange={(e) => setMesesHistorico(Number(e.target.value))}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                >
                                    {MESES_HISTORICO.map((m) => (
                                        <option key={m.value} value={m.value}>
                                            {m.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Meses Cobertura */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Cobertura Objetivo
                                </label>
                                <select
                                    value={mesesCobertura}
                                    onChange={(e) => setMesesCobertura(Number(e.target.value))}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                >
                                    {MESES_COBERTURA.map((m) => (
                                        <option key={m.value} value={m.value}>
                                            {m.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Solo Bajo Mínimo */}
                            <div className="flex items-end">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={soloEnQuiebre}
                                        onChange={(e) => setSoloEnQuiebre(e.target.checked)}
                                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                    />
                                    <span className="text-sm text-slate-700">Solo bajo mínimo</span>
                                </label>
                            </div>

                            {/* Ocultar sin ventas */}
                            <div className="flex items-end">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={ocultarCero}
                                        onChange={(e) => setOcultarCero(e.target.checked)}
                                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                    />
                                    <span className="text-sm text-slate-700">Ocultar sin ventas</span>
                                </label>
                            </div>

                            {/* Filtro de Ventas */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Filtrar Ventas
                                </label>
                                <select
                                    value={salesStatus}
                                    onChange={(e) => setSalesStatus(e.target.value as any)}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                >
                                    <option value="all">Todos</option>
                                    <option value="with_sales">Con Ventas</option>
                                    <option value="without_sales">Sin Ventas</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Explicación del Algoritmo */}
                    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 p-5 mb-6">
                        <div className="flex items-start gap-3">
                            <Info className="h-5 w-5 text-indigo-600 mt-0.5 flex-shrink-0" />
                            <div>
                                <h3 className="font-semibold text-indigo-900 mb-2">
                                    {algoritmoInfo?.label}
                                </h3>
                                <p className="text-sm text-indigo-800 mb-3">
                                    {algoritmoInfo?.description}
                                </p>
                                <div className="bg-white/60 rounded-lg p-3 border border-indigo-200">
                                    <p className="text-xs font-mono text-indigo-700">
                                        <strong>Fórmula:</strong> {algoritmoInfo?.formula}
                                    </p>
                                </div>
                                {algoritmo === "PREDICCION" && (
                                    <div className="mt-3 text-sm text-indigo-800">
                                        <p className="mb-2">
                                            <strong>¿Cómo funciona la tendencia?</strong>
                                        </p>
                                        <ul className="list-disc list-inside space-y-1 text-xs">
                                            <li>Se calcula la <strong>pendiente</strong> de una línea recta que mejor se ajusta a las ventas históricas (regresión lineal)</li>
                                            <li><strong>Tendencia positiva (+)</strong>: Las ventas están creciendo → se predice que necesitarás más stock</li>
                                            <li><strong>Tendencia negativa (-)</strong>: Las ventas están bajando → se predice que necesitarás menos stock</li>
                                            <li>La predicción proyecta esta tendencia hacia los meses de cobertura objetivo ({mesesCobertura} meses)</li>
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Resumen */}
                    {
                        data && (
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
                                <div className="flex items-center gap-6">
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-slate-900">{data.totalItems}</p>
                                        <p className="text-sm text-slate-500">Productos analizados</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-indigo-600">
                                            {data.totalUnidades.toLocaleString("es-CL")}
                                        </p>
                                        <p className="text-sm text-slate-500">Unidades Sugeridas</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-emerald-600">{mesesCobertura}</p>
                                        <p className="text-sm text-slate-500">Meses Cobertura</p>
                                    </div>
                                </div>
                            </div>
                        )
                    }

                    {/* Búsqueda */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4">
                        <div className="relative max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Buscar por SKU o descripción..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                    </div>

                    {/* Tabla de Resultados */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        {loading ? (
                            <div className="flex items-center justify-center h-64">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                            </div>
                        ) : error ? (
                            <div className="flex items-center justify-center h-64 text-red-600">
                                Error: {error}
                            </div>
                        ) : !data || data.items.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                                <Calculator className="h-12 w-12 mb-4 text-slate-300" />
                                <p className="font-medium">Sin datos para analizar</p>
                                <p className="text-sm">Selecciona una familia y ajusta los parámetros</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 border-b border-slate-200">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-600">SKU</th>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-600">Descripción</th>
                                            <th className="px-4 py-3 text-right font-semibold text-slate-600">Stock Actual</th>
                                            <th className="px-4 py-3 text-right font-semibold text-red-600">Stock Mín.</th>
                                            <th className="px-4 py-3 text-right font-semibold text-blue-600">Stock Ópt.</th>
                                            <th className="px-4 py-3 text-right font-semibold text-slate-600">Prom. Venta</th>
                                            {algoritmo === "PREDICCION" && (
                                                <>
                                                    <th className="px-4 py-3 text-right font-semibold text-purple-700 bg-purple-50">
                                                        Tendencia
                                                    </th>
                                                    <th className="px-4 py-3 text-right font-semibold text-purple-700 bg-purple-50">
                                                        Predicción
                                                    </th>
                                                </>
                                            )}
                                            <th className="px-4 py-3 text-right font-semibold text-amber-700 bg-amber-50">
                                                Pendiente (3M)
                                            </th>
                                            <th className="px-4 py-3 text-right font-semibold text-emerald-700 bg-emerald-50">
                                                Sugerido
                                            </th>
                                            <th className="px-4 py-3 text-center font-semibold text-blue-700 bg-blue-50">
                                                A Comprar
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {itemsFiltrados.map((item, idx) => {
                                            const bajoMinimo = item.stockMinimo !== null && item.stockActual < item.stockMinimo;
                                            const isEditing = editingValues[item.id] !== undefined;
                                            const currentValue = isEditing
                                                ? editingValues[item.id]
                                                : (item.compraRealizar ?? "").toString();

                                            return (
                                                <tr
                                                    key={item.id}
                                                    className={bajoMinimo ? "bg-red-50" : idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}
                                                >
                                                    <td className="px-4 py-3 font-mono font-medium text-slate-900">
                                                        {item.sku}
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-600 max-w-[250px] truncate">
                                                        {item.descripcion}
                                                    </td>
                                                    <td className="px-4 py-3 text-right tabular-nums">
                                                        {item.stockActual.toLocaleString("es-CL")}
                                                    </td>
                                                    <td className="px-4 py-3 text-right tabular-nums text-red-600 font-medium">
                                                        {item.stockMinimo !== null
                                                            ? item.stockMinimo.toLocaleString("es-CL")
                                                            : <span className="text-slate-300">-</span>
                                                        }
                                                    </td>
                                                    <td className="px-4 py-3 text-right tabular-nums text-blue-600">
                                                        {item.stockOptimo !== undefined && item.stockOptimo !== null
                                                            ? item.stockOptimo.toLocaleString("es-CL")
                                                            : <span className="text-slate-300">-</span>
                                                        }
                                                    </td>
                                                    <td className="px-4 py-3 text-right tabular-nums">
                                                        {item.promedioVenta.toLocaleString("es-CL")}
                                                    </td>
                                                    {algoritmo === "PREDICCION" && (
                                                        <>
                                                            <td className="px-4 py-3 text-right bg-purple-50">
                                                                <div className="flex items-center justify-end gap-1">
                                                                    {item.tendencia > 0 ? (
                                                                        <ArrowUp className="h-4 w-4 text-green-600" />
                                                                    ) : item.tendencia < 0 ? (
                                                                        <ArrowDown className="h-4 w-4 text-red-600" />
                                                                    ) : (
                                                                        <Minus className="h-4 w-4 text-slate-400" />
                                                                    )}
                                                                    <span className={
                                                                        item.tendencia > 0 ? "text-green-600 font-medium" :
                                                                            item.tendencia < 0 ? "text-red-600 font-medium" :
                                                                                "text-slate-500"
                                                                    }>
                                                                        {item.tendencia > 0 ? "+" : ""}{item.tendencia.toFixed(1)}/mes
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3 text-right bg-purple-50 tabular-nums font-medium text-purple-700">
                                                                {item.prediccionProximoMes?.toLocaleString("es-CL") || "-"}
                                                            </td>
                                                        </>
                                                    )}
                                                    <td className="px-4 py-3 text-right bg-amber-50 tabular-nums font-medium text-amber-700">
                                                        {fetchingPendientes ? (
                                                            <div className="h-4 w-8 bg-amber-200 animate-pulse rounded ml-auto"></div>
                                                        ) : (
                                                            pendientesData[item.sku] ? pendientesData[item.sku].toLocaleString("es-CL") : "0"
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-bold text-emerald-700 bg-emerald-50 tabular-nums">
                                                        {/* Restar pendientes del sugerido si existen */}
                                                        {Math.max(0, item.cantidadSugerida - (pendientesData[item.sku] || 0)).toLocaleString("es-CL")}
                                                    </td>
                                                    <td className="px-4 py-2 bg-blue-50">
                                                        <div className="flex items-center gap-1">
                                                            <input
                                                                type="text"
                                                                inputMode="numeric"
                                                                value={currentValue}
                                                                onChange={(e) => setEditingValues(prev => ({
                                                                    ...prev,
                                                                    [item.id]: e.target.value
                                                                }))}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === "Enter") handleSaveCompra(item);
                                                                }}
                                                                className="w-20 px-2 py-1 text-right border border-blue-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                                                                placeholder="0"
                                                            />
                                                            {isEditing && (
                                                                <button
                                                                    onClick={() => handleSaveCompra(item)}
                                                                    disabled={savingId === item.id}
                                                                    className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                                                                >
                                                                    <Save className={`h-4 w-4 ${savingId === item.id ? "animate-pulse" : ""}`} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </main >
            </div >
        </div >
    );
}
