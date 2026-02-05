"use client";

import { useEffect, useState } from "react";
import { Download, Upload, FileText } from "lucide-react";
import { OrderCell } from "@/components/order-cell";
import { ProductoDashboard, saveOrders } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";

import { Pagination } from "@/components/pagination";
import { SortButton, SortConfig, SortColumn } from "@/components/product-table";

interface SummaryTableProps {
    title: string;
    items: ProductoDashboard[];
    onUpdate: (id: number, qty: number, tipo: string) => void;
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

function SummaryTable({ title, items, onUpdate, sortConfig, onSort, pagination }: SummaryTableProps) {
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

export default function OcsOcisPage() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<ProductoDashboard[]>([]);
    const [lastUpdate, setLastUpdate] = useState<string>("");

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
            .catch(err => console.error(err))
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
    const hasKC = pendingItems.some(i => !i.producto.sku.startsWith("T-"));

    const handleExportKC = () => {
        const items = pendingItems.filter(i => !i.producto.sku.startsWith("T-"));
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
                            <button className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-400 rounded-md cursor-not-allowed text-xs font-medium border border-slate-200" disabled>
                                <Upload className="h-3.5 w-3.5" /> Manager
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
        </div>
    );
}
