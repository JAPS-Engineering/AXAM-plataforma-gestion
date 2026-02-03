"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Sidebar } from "@/components/sidebar";
import { Pagination } from "@/components/pagination";
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
    XCircle,
    ChevronUp,
    ChevronDown,
    ChevronsUpDown
} from "lucide-react";
import { PendingShipmentsSync } from "@/components/pending-shipments-sync";
import { cn } from "@/lib/utils";

interface SuggestedPurchase {
    id: number;
    sku: string;
    descripcion: string;
    familia: string;
    stockActual: number;
    stockMinimo: number | null;
    stockOptimo?: number | null;
    promedioVenta: number;
    tendencia: number;
    prediccionProximoMes: number;
    cantidadSugerida: number;
    mesesCobertura: number;
    algoritmo: string;
    compraRealizar: number | null;
    pendientes?: number;
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

type SortDirection = "asc" | "desc" | null;
interface SortConfig {
    column: string | null;
    direction: SortDirection;
}

function SortButton({ column, currentSort, onSort, isNumeric = false }: { column: string, currentSort: SortConfig, onSort: (c: string) => void, isNumeric?: boolean }) {
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

const ALGORITMOS = [
    // ... (rest of the code remains the same until AnalisisPage)
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

    // Ordenamiento
    const [sortConfig, setSortConfig] = useState<SortConfig>({ column: null, direction: null });

    // Paginación
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(12);

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

    // Función para manejar ordenamiento
    const handleSort = (column: string) => {
        setSortConfig((prev) => {
            if (prev.column === column) {
                if (prev.direction === "desc") return { column, direction: "asc" };
                if (prev.direction === "asc") return { column: null, direction: null };
                return { column, direction: "desc" };
            }
            return { column, direction: column === "sku" || column === "descripcion" ? "asc" : "desc" };
        });
    };

    // Función para calcular sugerencias
    const calcularSugerencias = useCallback(async () => {
        if (!proveedorSeleccionado) return;

        setLoading(true);
        setError(null);
        setCurrentPage(1);

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
        let result = [...data.items];

        if (search.trim()) {
            const term = search.toLowerCase();
            result = result.filter(item =>
                item.sku.toLowerCase().includes(term) ||
                item.descripcion.toLowerCase().includes(term)
            );
        }

        if (salesStatus === 'with_sales') {
            result = result.filter((p) => (p.promedioVenta || 0) > 0);
        } else if (salesStatus === 'without_sales') {
            result = result.filter((p) => (p.promedioVenta || 0) === 0);
        }

        // Aplicar Ordenamiento
        const { column, direction } = sortConfig;
        if (column && direction) {
            result.sort((a, b) => {
                let aVal: any;
                let bVal: any;

                if (column === "pendientes") {
                    aVal = pendientesData[a.sku] || 0;
                    bVal = pendientesData[b.sku] || 0;
                } else if (column === "sugerido_final") {
                    aVal = Math.max(0, a.cantidadSugerida - (pendientesData[a.sku] || 0));
                    bVal = Math.max(0, b.cantidadSugerida - (pendientesData[b.sku] || 0));
                } else {
                    aVal = a[column as keyof SuggestedPurchase];
                    bVal = b[column as keyof SuggestedPurchase];
                }

                if (typeof aVal === "string" && typeof bVal === "string") {
                    return direction === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                }

                const numA = Number(aVal) || 0;
                const numB = Number(bVal) || 0;

                return direction === "asc" ? numA - numB : numB - numA;
            });
        }

        return result;
    }, [data?.items, search, salesStatus, sortConfig, pendientesData]);

    // Lógica de Paginación
    const { paginatedItems, totalPages } = useMemo(() => {
        const total = pageSize === -1 ? 1 : Math.ceil(itemsFiltrados.length / pageSize);
        const start = (currentPage - 1) * pageSize;
        const end = pageSize === -1 ? itemsFiltrados.length : start + pageSize;

        return {
            paginatedItems: pageSize === -1 ? itemsFiltrados : itemsFiltrados.slice(start, end),
            totalPages: total || 1,
        };
    }, [itemsFiltrados, currentPage, pageSize]);

    useEffect(() => {
        setCurrentPage(1);
    }, [search, salesStatus, algoritmo, mesesHistorico, mesesCobertura, soloEnQuiebre, sortConfig]);

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

            if (data) {
                setData({
                    ...data,
                    items: data.items.map(i =>
                        i.id === item.id ? { ...i, compraRealizar: cantidad } : i
                    )
                });
            }
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
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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

                            <div className="flex items-end">
                                <div className="flex flex-col gap-1">
                                    <span className="text-xs font-medium text-transparent select-none">
                                        Filtro
                                    </span>
                                    <button
                                        onClick={() => setSoloEnQuiebre(!soloEnQuiebre)}
                                        className={cn(
                                            "flex items-center gap-2 px-3 py-2 text-sm font-medium border rounded-lg transition-all shadow-sm whitespace-nowrap",
                                            soloEnQuiebre
                                                ? "bg-red-50 text-red-700 border-red-200 ring-1 ring-red-200"
                                                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                                        )}
                                    >
                                        <div className={cn(
                                            "h-4 w-4 rounded border flex items-center justify-center transition-colors",
                                            soloEnQuiebre ? "bg-red-600 border-red-600" : "border-slate-400 bg-white"
                                        )}>
                                            {soloEnQuiebre && <CheckCircle2 className="h-3 w-3 text-white" />}
                                        </div>
                                        <span>Solo bajo mínimo</span>
                                    </button>
                                </div>
                            </div>

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
                                <div className="bg-white/60 rounded-lg p-3 border border-indigo-200 mb-3">
                                    <p className="text-xs font-mono text-indigo-700">
                                        <strong>Fórmula:</strong> {algoritmoInfo?.formula}
                                    </p>
                                </div>
                                <div className="bg-white/60 rounded-lg p-3 border border-indigo-200">
                                    <p className="text-sm text-indigo-800 mb-1">
                                        <strong>¿Qué es la Cobertura Objetivo?</strong>
                                    </p>
                                    <p className="text-xs text-indigo-700">
                                        Es la cantidad de meses de stock que deseas mantener en inventario. Si seleccionas <strong>{mesesCobertura} {mesesCobertura === 1 ? 'mes' : 'meses'}</strong>, el sistema calculará cuántas unidades necesitas para cubrir {mesesCobertura} {mesesCobertura === 1 ? 'mes' : 'meses'} de ventas promedio.
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

                    {
                        data && (
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
                                <div className="flex items-center gap-6">
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-slate-900">{itemsFiltrados.length}</p>
                                        <p className="text-sm text-slate-500">Productos filtrados</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-indigo-600">
                                            {itemsFiltrados.reduce((acc, i) => acc + i.cantidadSugerida, 0).toLocaleString("es-CL")}
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

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                        {loading ? (
                            <div className="flex items-center justify-center h-64">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                            </div>
                        ) : error ? (
                            <div className="flex items-center justify-center h-64 text-red-600">
                                Error: {error}
                            </div>
                        ) : !data || itemsFiltrados.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                                <Calculator className="h-12 w-12 mb-4 text-slate-300" />
                                <p className="font-medium">Sin datos para analizar</p>
                                <p className="text-sm">Selecciona una familia y ajusta los parámetros</p>
                            </div>
                        ) : (
                            <>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50 border-b border-slate-200">
                                            <tr>
                                                <th className="px-4 py-3 text-left font-semibold text-slate-600 min-w-[120px]">
                                                    <div className="flex items-center gap-1">
                                                        SKU
                                                        <SortButton column="sku" currentSort={sortConfig} onSort={handleSort} />
                                                    </div>
                                                </th>
                                                <th className="px-4 py-3 text-left font-semibold text-slate-600 min-w-[200px]">
                                                    <div className="flex items-center gap-1">
                                                        Descripción
                                                        <SortButton column="descripcion" currentSort={sortConfig} onSort={handleSort} />
                                                    </div>
                                                </th>
                                                <th className="px-4 py-3 text-right font-semibold text-slate-600">
                                                    <div className="flex items-center justify-end gap-1">
                                                        Stock Actual
                                                        <SortButton column="stockActual" currentSort={sortConfig} onSort={handleSort} isNumeric />
                                                    </div>
                                                </th>
                                                <th className="px-4 py-3 text-right font-semibold text-red-600">
                                                    <div className="flex items-center justify-end gap-1">
                                                        Stock Mín.
                                                        <SortButton column="stockMinimo" currentSort={sortConfig} onSort={handleSort} isNumeric />
                                                    </div>
                                                </th>
                                                <th className="px-4 py-3 text-right font-semibold text-blue-600">
                                                    <div className="flex items-center justify-end gap-1">
                                                        Stock Ópt.
                                                        <SortButton column="stockOptimo" currentSort={sortConfig} onSort={handleSort} isNumeric />
                                                    </div>
                                                </th>
                                                <th className="px-4 py-3 text-right font-semibold text-slate-600">
                                                    <div className="flex items-center justify-end gap-1">
                                                        Prom. Venta
                                                        <SortButton column="promedioVenta" currentSort={sortConfig} onSort={handleSort} isNumeric />
                                                    </div>
                                                </th>
                                                {algoritmo === "PREDICCION" && (
                                                    <>
                                                        <th className="px-4 py-3 text-right font-semibold text-purple-700 bg-purple-50">
                                                            <div className="flex items-center justify-end gap-1">
                                                                Tendencia
                                                                <SortButton column="tendencia" currentSort={sortConfig} onSort={handleSort} isNumeric />
                                                            </div>
                                                        </th>
                                                        <th className="px-4 py-3 text-right font-semibold text-purple-700 bg-purple-50">
                                                            <div className="flex items-center justify-end gap-1">
                                                                Predicción
                                                                <SortButton column="prediccionProximoMes" currentSort={sortConfig} onSort={handleSort} isNumeric />
                                                            </div>
                                                        </th>
                                                    </>
                                                )}
                                                <th className="px-4 py-3 text-right font-semibold text-amber-700 bg-amber-50">
                                                    <div className="flex items-center justify-end gap-1">
                                                        Pendiente (3M)
                                                        <SortButton column="pendientes" currentSort={sortConfig} onSort={handleSort} isNumeric />
                                                    </div>
                                                </th>
                                                <th className="px-4 py-3 text-right font-semibold text-emerald-700 bg-emerald-50">
                                                    <div className="flex items-center justify-end gap-1">
                                                        Sugerido
                                                        <SortButton column="sugerido_final" currentSort={sortConfig} onSort={handleSort} isNumeric />
                                                    </div>
                                                </th>
                                                <th className="px-4 py-3 text-center font-semibold text-blue-700 bg-blue-50">
                                                    A Comprar
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {paginatedItems.map((item, idx) => {
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

                                <div className="border-t border-slate-200">
                                    <Pagination
                                        currentPage={currentPage}
                                        totalPages={totalPages}
                                        pageSize={pageSize}
                                        totalItems={itemsFiltrados.length}
                                        onPageChange={setCurrentPage}
                                        onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
                                        className="border-none shadow-none"
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
