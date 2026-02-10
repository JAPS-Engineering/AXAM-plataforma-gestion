"use client";

import { useEffect, useState } from "react";
import { Download, Upload, FileText } from "lucide-react";
import { OrderCell } from "@/components/order-cell";
import { ProductoDashboard, saveOrders, updateProductProvider } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";

import { Pagination } from "@/components/pagination";
import { SortButton, SortConfig, SortColumn } from "@/components/product-table";

interface SummaryTableProps {
    title: string;
    items: ProductoDashboard[];
    onUpdate: (id: number, qty: number, tipo: string) => void;
    onSendToManager: () => void; // Nueva prop
    isSending?: boolean;
    // Sorting & Pagination props
    sortConfig: SortConfig;
    onSort: (column: SortColumn) => void;
    pagination: {
        currentPage: number;
        pageSize: number;
        totalItems: number;
        onPageChange: (page: number) => void;
        onPageSizeChange: (size: number) => void;
    };
}

function formatCurrency(val: number | undefined | null) {
    if (!val) return "$ 0";
    return "$ " + val.toLocaleString("es-CL");
}

function SummaryTable({ title, items, onUpdate, onSendToManager, isSending, sortConfig, onSort, pagination }: SummaryTableProps) {
    const handleSave = async (productoId: number, cantidad: number, tipo: string) => {
        await saveOrders([{ productoId, cantidad, tipo }]);
        onUpdate(productoId, cantidad, tipo);
    };

    const totalUnits = items.reduce((sum, item) => sum + (item.compraRealizar || 0), 0);
    const totalCLP = items.reduce((sum, item) => sum + ((item.compraRealizar || 0) * (item.producto.costo || 0)), 0);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col mb-6">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div>
                    <h3 className="font-semibold text-slate-800">{title}</h3>
                    <div className="text-xs text-slate-500 mt-1">
                        {items.length} productos | {totalUnits.toLocaleString("es-CL")} un. | {formatCurrency(totalCLP)}
                    </div>
                </div>
                <button
                    onClick={onSendToManager}
                    disabled={isSending || items.length === 0}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
                        items.length > 0 && !isSending
                            ? "bg-blue-600 text-white hover:bg-blue-700 border-transparent shadow-sm"
                            : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                    )}
                >
                    {isSending ? (
                        <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Enviando...
                        </>
                    ) : (
                        <>
                            <Upload className="w-4 h-4" />
                            Enviar a Manager+
                        </>
                    )}
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                        <tr>
                            <th className="px-4 py-3 font-medium">
                                <div className="flex items-center">
                                    SKU
                                    <SortButton column="sku" currentSort={sortConfig} onSort={onSort} />
                                </div>
                            </th>
                            <th className="px-4 py-3 font-medium">
                                <div className="flex items-center">
                                    Descripción
                                    <SortButton column="descripcion" currentSort={sortConfig} onSort={onSort} />
                                </div>
                            </th>
                            <th className="px-4 py-3 font-medium text-right">
                                <div className="flex items-center justify-end">
                                    Stock
                                    <SortButton column="stock" currentSort={sortConfig} onSort={onSort} isNumeric />
                                </div>
                            </th>
                            <th className="px-4 py-3 font-medium text-right text-slate-600">
                                <div className="flex items-center justify-end">
                                    Última Compra
                                    <SortButton column="promedio" currentSort={sortConfig} onSort={onSort} isNumeric />
                                </div>
                            </th>
                            <th className="px-4 py-3 font-medium text-right text-slate-600">
                                <div className="flex items-center justify-end">
                                    Total Est.
                                    <SortButton column="ventaMes" currentSort={sortConfig} onSort={onSort} isNumeric />
                                </div>
                            </th>
                            <th className="px-4 py-3 font-medium text-right bg-blue-50/50 min-w-[120px]">
                                <div className="flex items-center justify-end">
                                    A Comprar
                                    <SortButton column="aComprar" currentSort={sortConfig} onSort={onSort} isNumeric />
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {items.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                                    No hay órdenes pendientes
                                </td>
                            </tr>
                        ) : (
                            items.map((item) => {
                                const costo = item.producto.costo || 0;
                                const cantidad = item.compraRealizar || 0;
                                const total = costo * cantidad;

                                return (
                                    <tr key={item.producto.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-2 font-medium text-slate-700 whitespace-nowrap">
                                            {item.producto.sku}
                                            <span className="text-slate-400 text-xs ml-1">-{item.producto.dv}</span>
                                        </td>
                                        <td className="px-4 py-2 text-slate-600 max-w-md truncate" title={item.producto.descripcion}>
                                            {item.producto.descripcion}
                                        </td>
                                        <td className="px-4 py-2 text-right text-slate-600 whitespace-nowrap">
                                            {item.mesActual.stockActual.toLocaleString("es-CL")}
                                        </td>
                                        <td className="px-4 py-2 text-right text-slate-600 whitespace-nowrap">
                                            {formatCurrency(costo)}
                                        </td>
                                        <td className="px-4 py-2 text-right font-medium text-slate-700 whitespace-nowrap">
                                            {formatCurrency(total)}
                                        </td>
                                        <td className="px-4 py-2 text-right bg-blue-50/30">
                                            <div className="flex justify-end">
                                                <OrderCell
                                                    productoId={item.producto.id}
                                                    initialValue={item.compraRealizar}
                                                    initialType={item.tipoCompra}
                                                    onSave={handleSave}
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
            <Pagination
                currentPage={pagination.currentPage}
                totalPages={Math.ceil(pagination.totalItems / pagination.pageSize)}
                pageSize={pagination.pageSize}
                totalItems={pagination.totalItems}
                onPageChange={pagination.onPageChange}
                onPageSizeChange={pagination.onPageSizeChange}
                className="border-t border-slate-200 rounded-t-none border-x-0 border-b-0"
            />
        </div>
    );
}

import { ConfirmationModal } from "@/components/confirmation-modal";

const getDollarObserved = async (): Promise<number | null> => {
    try {
        const res = await fetch("https://mindicador.cl/api");
        if (!res.ok) throw new Error("Error fetching mindicador.cl");
        const data = await res.json();
        return data.dolar?.valor || null;
    } catch (error) {
        console.error("Error fetching dollar value:", error);
        return null; // Fallback to manual input
    }
};

export default function OcsOcisPage() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<ProductoDashboard[]>([]);
    const [lastUpdate, setLastUpdate] = useState<string>("");
    const [sendingOC, setSendingOC] = useState(false);
    const [sendingOCI, setSendingOCI] = useState(false);

    // Modal State
    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: "info" | "success" | "warning" | "error";
        onConfirm?: () => void;
        confirmText?: string;
        cancelText?: string;
    }>({
        isOpen: false,
        title: "",
        message: "",
        type: "info"
    });

    const closeConfirmationModal = () => setModalConfig(prev => ({ ...prev, isOpen: false }));

    const showModal = (
        title: string,
        message: string,
        type: "info" | "success" | "warning" | "error" = "info",
        onConfirm?: () => void,
        confirmText?: string
    ) => {
        setModalConfig({
            isOpen: true,
            title,
            message,
            type,
            onConfirm,
            confirmText,
            cancelText: onConfirm ? "Cancelar" : undefined
        });
    };

    const fetchData = () => {
        setLoading(true);
        fetch("/api/dashboard?live=false")
            .then(res => res.json())
            .then(resData => {
                const items: ProductoDashboard[] = resData.productos || [];
                const pending = items.filter(i => (i.compraRealizar || 0) > 0);
                setData(pending);
                if (resData.meta?.lastUpdate) {
                    setLastUpdate(resData.meta.lastUpdate);
                }
            })
            .catch(err => { /* console.error(err) */ })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchData();
    }, []);

    const [sortOC, setSortOC] = useState<SortConfig>({ column: null, direction: null });
    const [pageOC, setPageOC] = useState(1);
    const [pageSizeOC, setPageSizeOC] = useState(10);

    const [sortOCI, setSortOCI] = useState<SortConfig>({ column: null, direction: null });
    const [pageOCI, setPageOCI] = useState(1);
    const [pageSizeOCI, setPageSizeOCI] = useState(10);

    const processData = (items: ProductoDashboard[], sortConfig: SortConfig, page: number, pageSize: number) => {
        let sorted = [...items];

        if (sortConfig.column) {
            sorted.sort((a, b) => {
                let aVal: any = '';
                let bVal: any = '';

                switch (sortConfig.column) {
                    case 'sku':
                        aVal = a.producto.sku;
                        bVal = b.producto.sku;
                        break;
                    case 'descripcion':
                        aVal = a.producto.descripcion;
                        bVal = b.producto.descripcion;
                        break;
                    case 'stock':
                        aVal = a.mesActual.stockActual;
                        bVal = b.mesActual.stockActual;
                        break;
                    case 'promedio':
                        aVal = a.producto.costo || 0;
                        bVal = b.producto.costo || 0;
                        break;
                    case 'ventaMes':
                        aVal = (a.compraRealizar || 0) * (a.producto.costo || 0);
                        bVal = (b.compraRealizar || 0) * (b.producto.costo || 0);
                        break;
                    case 'aComprar':
                        aVal = a.compraRealizar || 0;
                        bVal = b.compraRealizar || 0;
                        break;
                    default:
                        return 0;
                }

                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        const totalItems = sorted.length;
        const start = (page - 1) * pageSize;
        const paged = pageSize === -1 ? sorted : sorted.slice(start, start + pageSize);

        return { paged, totalItems };
    };

    const handleSortOC = (col: SortColumn) => {
        setSortOC(prev => ({
            column: col,
            direction: prev.column === col && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleSortOCI = (col: SortColumn) => {
        setSortOCI(prev => ({
            column: col,
            direction: prev.column === col && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleUpdate = (id: number, qty: number, tipo: string) => {
        setData(prev => prev.map(item =>
            item.producto.id === id
                ? { ...item, compraRealizar: qty, tipoCompra: tipo }
                : item
        ).filter(i => (i.compraRealizar || 0) > 0));
    };

    const ocItemsRaw = data.filter(i => !i.tipoCompra || i.tipoCompra === 'OC');
    const ociItemsRaw = data.filter(i => i.tipoCompra === 'OCI');

    const { paged: ocPaged, totalItems: ocTotal } = processData(ocItemsRaw, sortOC, pageOC, pageSizeOC);
    const { paged: ociPaged, totalItems: ociTotal } = processData(ociItemsRaw, sortOCI, pageOCI, pageSizeOCI);

    const totalProds = data.length;
    const grandTotal = data.reduce((sum, item) => sum + ((item.compraRealizar || 0) * (item.producto.costo || 0)), 0);

    // Identify pending items for export
    const pendingItems = data.filter(i => (i.compraRealizar || 0) > 0);
    const hasTork = pendingItems.some(i => i.producto.sku.startsWith("T-"));
    const hasKC = pendingItems.some(i => i.producto.sku.startsWith("KC"));

    const handleExportKC = () => {
        const items = pendingItems.filter(i => i.producto.sku.startsWith("KC"));
        if (items.length === 0) return;

        // Format: 302 + last 5 digits of SKU, Quantity, CJ
        const csvContent = items.map(item => {
            const sku = item.producto.sku;
            const code = "302" + (sku.length > 5 ? sku.slice(-5) : sku);
            const qty = item.compraRealizar;
            return `${code};${qty};CJ`;
        }).join("\n");

        const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", "pedido_kc.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleExportTork = () => {
        const items = pendingItems.filter(i => i.producto.sku.startsWith("T-"));
        if (items.length === 0) return;

        // Format: Remove T-, Quantity, separated by space
        const txtContent = items.map(item => {
            const code = item.producto.sku.replace("T-", "");
            const qty = item.compraRealizar;
            return `${code} ${qty}`;
        }).join("\n");

        const blob = new Blob([txtContent], { type: "text/plain;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", "pedido_tork.txt");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const executeSendOC = async () => {
        const items = data.filter(i => !i.tipoCompra || i.tipoCompra === 'OC');
        if (items.length === 0) return;

        // 1. Agrupar por rutProveedor
        const groups = new Map<string, typeof items>();
        for (const item of items) {
            const rut = item.producto.rutProveedor || "PENDIENTE";
            if (!groups.has(rut)) groups.set(rut, []);
            groups.get(rut)?.push(item);
        }

        setSendingOC(true);
        // Cerrar modal de confirmación antes de empezar el proceso
        closeConfirmationModal();
        await new Promise(resolve => setTimeout(resolve, 300));

        const results: string[] = [];
        let successCount = 0;
        let errorCount = 0;

        try {
            for (const [rut, groupItems] of groups.entries()) {
                let currentRut = rut;
                let currentNombre = groupItems[0].producto.proveedor || "";

                // 2. Si es PENDIENTE, preguntar al usuario
                if (currentRut === "PENDIENTE") {
                    const resNombre = prompt(`El producto ${groupItems[0].producto.sku} no tiene proveedor. Ingrese nombre:`);
                    if (resNombre === null) {
                        results.push(`⚠️ Grupo PENDIENTE: Cancelado por usuario.`);
                        continue;
                    }

                    const resRut = prompt(`Ingrese RUT para el proveedor "${resNombre}" (ej: 12345678-9):`, "96604460-8");
                    if (resRut === null) {
                        results.push(`⚠️ ${resNombre}: Cancelado por usuario (sin RUT).`);
                        continue;
                    }

                    currentNombre = resNombre;
                    currentRut = resRut;

                    // 3. Guardar en backend para futuras ocasiones
                    for (const item of groupItems) {
                        try {
                            await updateProductProvider(item.producto.id, currentNombre, currentRut);
                            item.producto.proveedor = currentNombre;
                            item.producto.rutProveedor = currentRut;
                        } catch (err) {
                            console.error("Error guardando proveedor:", err);
                        }
                    }
                }

                // 4. Enviar a Manager+
                const payload = {
                    proveedor: {
                        nombre: currentNombre || "Proveedor General",
                        rut: currentRut
                    },
                    items: groupItems.map(i => ({
                        sku: i.producto.sku,
                        descripcion: i.producto.descripcion,
                        cantidad: i.compraRealizar,
                        precioUnit: i.producto.costo,
                        unidad: i.producto.unidad || "U"
                    })),
                    observaciones: "Generado desde Plataforma de Gestión AXAM"
                };

                const res = await fetch("/api/purchase/manager/oc", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });

                const result = await res.json();

                if (result.success) {
                    const msg = `✅ ${currentNombre}: OC Generada (${result.data?.mensaje?.[1] || "OK"})`;
                    console.log(msg);
                    results.push(msg);
                    successCount++;
                } else {
                    let errorDetail = result.message;
                    // Intento de parsear mensaje de error complejo de Manager+
                    if (typeof result.message === 'object') {
                        try {
                            // Ejemplo format: {"00001":["Error A", "Error B"]}
                            const errors = Object.values(result.message).flat().join(". ");
                            errorDetail = errors || JSON.stringify(result.message);
                        } catch (e) {
                            errorDetail = JSON.stringify(result.message);
                        }
                    }

                    const msg = `❌ ${currentNombre}: Error - ${errorDetail}`;
                    console.error(msg);
                    results.push(msg);
                    errorCount++;
                }
            }

            // Mostrar resumen final
            const summaryTitle = errorCount === 0 ? "Proceso Finalizado con Éxito" : "Resumen del Proceso";
            const summaryType = errorCount === 0 ? "success" : (successCount === 0 ? "error" : "warning");

            showModal(summaryTitle, results.join("\n\n"), summaryType);
            fetchData();

        } catch (error) {
            console.error(error);
            showModal("Error Crítico", "Ocurrió un error inesperado de conexión.", "error");
        } finally {
            setSendingOC(false);
        }
    };

    const handleSendOC = () => {
        console.log("handleSendOC click");
        const items = data.filter(i => !i.tipoCompra || i.tipoCompra === 'OC');
        if (items.length === 0) {
            console.log("No items for OC");
            return;
        }

        showModal(
            "Confirmar Envío OC",
            `¿Estás seguro de enviar una Orden de Compra Nacional con ${items.length} productos?`,
            "warning",
            executeSendOC,
            "Enviar OC"
        );
    };

    const executeSendOCI = async () => {
        const items = data.filter(i => i.tipoCompra === 'OCI');
        if (items.length === 0) return;

        const groups = new Map<string, typeof items>();
        for (const item of items) {
            const rut = item.producto.rutProveedor || "PENDIENTE";
            if (!groups.has(rut)) groups.set(rut, []);
            groups.get(rut)?.push(item);
        }

        // Obtener valor del dólar automáticamente o preguntar
        let tipoCambio = 950; // Valor por defecto seguro
        const dollarValue = await getDollarObserved();

        if (dollarValue) {
            console.log(`Usando valor del dólar automático: ${dollarValue}`);
            // Opcional: Avisar al usuario brevemente o solo usarlo. 
            // Para confirmación explicita, podríamos mostrarlo en un confirm, pero el usuario pidió "automáticamente".
            tipoCambio = dollarValue;
        } else {
            const tipoCambioRes = prompt("No se pudo obtener el valor del dólar automáticamente. Ingrese Tipo de Cambio (USD a CLP):", "950");
            if (tipoCambioRes === null) return;
            tipoCambio = Number(tipoCambioRes) || 950;
        }

        setSendingOCI(true);
        closeConfirmationModal();
        await new Promise(resolve => setTimeout(resolve, 300));

        const results: string[] = [];
        let successCount = 0;
        let errorCount = 0;

        try {
            for (const [rut, groupItems] of groups.entries()) {
                let currentRut = rut;
                let currentNombre = groupItems[0].producto.proveedor || "";

                if (currentRut === "PENDIENTE") {
                    const resNombre = prompt(`El producto ${groupItems[0].producto.sku} no tiene proveedor. Ingrese nombre:`);
                    if (resNombre === null) {
                        results.push(`⚠️ Grupo PENDIENTE: Cancelado por usuario.`);
                        continue;
                    }

                    const resRut = prompt(`Ingrese RUT para el proveedor "${resNombre}" (ej: 12345678-9):`, "96604460-8");
                    if (resRut === null) {
                        results.push(`⚠️ ${resNombre}: Cancelado por usuario (sin RUT).`);
                        continue;
                    }

                    currentNombre = resNombre;
                    currentRut = resRut;

                    for (const item of groupItems) {
                        try {
                            await updateProductProvider(item.producto.id, currentNombre, currentRut);
                            item.producto.proveedor = currentNombre;
                            item.producto.rutProveedor = currentRut;
                        } catch (err) {
                            console.error("Error guardando proveedor:", err);
                        }
                    }
                }

                const processedItems = [];
                for (const i of groupItems) {
                    let precioUSD = 0;

                    if (!i.producto.costo || i.producto.costo === 0) {
                        const userPrice = prompt(`El producto ${i.producto.sku} no tiene costo CLP registrado. Ingrese precio unitario en USD:`);
                        if (userPrice === null) {
                            results.push(`⚠️ ${currentNombre}: Cancelado por usuario (precio no ingresado para ${i.producto.sku}).`);
                            processedItems.length = 0; // Clear items to prevent processing
                            break; // Cancel this provider's order
                        }
                        if (userPrice) {
                            // Permitir coma o punto
                            precioUSD = parseFloat(userPrice.replace(',', '.')) || 0;
                        }
                    } else {
                        precioUSD = i.producto.costo / tipoCambio;
                    }

                    // Redondear a un máximo de 2 decimales para cumplir con Manager+
                    precioUSD = Math.round(precioUSD * 100) / 100;

                    processedItems.push({
                        sku: i.producto.sku,
                        descripcion: i.producto.descripcion,
                        cantidad: i.compraRealizar,
                        precioUnit: precioUSD,
                        unidad: i.producto.unidad || "U"
                    });
                }

                if (processedItems.length === 0) continue;

                const payload = {
                    proveedor: {
                        nombre: currentNombre || "Proveedor Importación",
                        rut: currentRut
                    },
                    items: processedItems,
                    moneda: "USD",
                    tipoCambio,
                    observaciones: "Generado desde Plataforma de Gestión AXAM (Importación)"
                };

                const res = await fetch("/api/purchase/manager/oci", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });

                const result = await res.json();

                if (result.success) {
                    const msg = `✅ ${currentNombre}: OCI Generada (${result.data?.mensaje?.[1] || "OK"})`;
                    console.log(msg);
                    results.push(msg);
                    successCount++;
                } else {
                    let errorDetail = result.message;
                    if (typeof result.message === 'object') {
                        try {
                            const errors = Object.values(result.message).flat().join(". ");
                            errorDetail = errors || JSON.stringify(result.message);
                        } catch (e) {
                            errorDetail = JSON.stringify(result.message);
                        }
                    }

                    const msg = `❌ ${currentNombre}: Error - ${errorDetail}`;
                    console.error(msg);
                    results.push(msg);
                    errorCount++;
                }
            }

            // Mostrar resumen
            const summaryTitle = errorCount === 0 ? "Proceso Finalizado con Éxito" : "Resumen del Proceso";
            const summaryType = errorCount === 0 ? "success" : (successCount === 0 ? "error" : "warning");

            showModal(summaryTitle, results.join("\n\n"), summaryType);
            fetchData();
        } catch (error) {
            console.error(error);
            showModal("Error Crítico", "Ocurrió un error inesperado de conexión.", "error");
        } finally {
            setSendingOCI(false);
        }
    };

    const handleSendOCI = () => {
        const items = data.filter(i => i.tipoCompra === 'OCI');
        if (items.length === 0) return;

        showModal(
            "Confirmar Envío OCI",
            `¿Estás seguro de enviar una Orden de Importación con ${items.length} productos?`,
            "warning",
            executeSendOCI,
            "Enviar OCI"
        );
    };

    return (
        <div className="flex h-screen bg-slate-50 overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <Header
                    lastUpdate={lastUpdate}
                    isLoading={loading}
                    onRefresh={fetchData}
                >
                    <div className="flex items-center gap-4 mr-4 border-r border-slate-200 pr-4">
                        <div className="text-right">
                            <div className="text-xs text-slate-500 uppercase font-bold">Total a Comprar</div>
                            <div className="text-sm font-semibold text-slate-800">
                                {totalProds} prods. | {formatCurrency(grandTotal)}
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={handleExportKC}
                                disabled={!hasKC}
                                className={cn(
                                    "flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                                    hasKC
                                        ? "bg-green-50 text-green-700 hover:bg-green-100 border-green-200"
                                        : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                )}
                            >
                                <Download className="h-3.5 w-3.5" /> CSV KC
                            </button>
                            <button
                                onClick={handleExportTork}
                                disabled={!hasTork}
                                className={cn(
                                    "flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                                    hasTork
                                        ? "bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200"
                                        : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                )}
                            >
                                <FileText className="h-3.5 w-3.5" /> TXT Tork
                            </button>

                        </div>
                    </div>
                </Header>

                <main className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200">
                    <div className="max-w-7xl mx-auto flex flex-col gap-6">
                        {loading ? (
                            <div className="flex items-center justify-center h-64">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                            </div>
                        ) : (
                            <>
                                <SummaryTable
                                    title="Ordenes de Compra Nacional (OC)"
                                    items={ocPaged}
                                    onUpdate={handleUpdate}
                                    onSendToManager={handleSendOC}
                                    isSending={sendingOC}
                                    sortConfig={sortOC}
                                    onSort={handleSortOC}
                                    pagination={{
                                        currentPage: pageOC,
                                        pageSize: pageSizeOC,
                                        totalItems: ocTotal,
                                        onPageChange: setPageOC,
                                        onPageSizeChange: setPageSizeOC
                                    }}
                                />
                                <SummaryTable
                                    title="Ordenes de Compra de Importación (OCI)"
                                    items={ociPaged}
                                    onUpdate={handleUpdate}
                                    onSendToManager={handleSendOCI}
                                    isSending={sendingOCI}
                                    sortConfig={sortOCI}
                                    onSort={handleSortOCI}
                                    pagination={{
                                        currentPage: pageOCI,
                                        pageSize: pageSizeOCI,
                                        totalItems: ociTotal,
                                        onPageChange: setPageOCI,
                                        onPageSizeChange: setPageSizeOCI
                                    }}
                                />
                            </>
                        )}
                    </div>
                </main>
            </div>
            <ConfirmationModal
                isOpen={modalConfig.isOpen}
                title={modalConfig.title}
                message={modalConfig.message}
                type={modalConfig.type}
                onConfirm={modalConfig.onConfirm}
                confirmText={modalConfig.confirmText}
                cancelText={modalConfig.cancelText}
                onClose={closeConfirmationModal}
            />
        </div>
    );
}
