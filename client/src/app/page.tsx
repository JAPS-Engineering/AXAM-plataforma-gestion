"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchDashboard, resetOrders, syncProductsApi, api } from "@/lib/api";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { KPICard } from "@/components/kpi-card";
import { FiltersBar, StockStatus, calculateProductStatus } from "@/components/filters-bar";
import { ProductTable, SortConfig, SortColumn } from "@/components/product-table";
import { Pagination } from "@/components/pagination";
import { SyncModal } from "@/components/sync-modal";
import { useState, useMemo, useEffect } from "react";
import { Package, TrendingUp, AlertTriangle, ShoppingCart, Download, FileText, Database } from "lucide-react";
import { PendingShipmentsSync } from "@/components/pending-shipments-sync";

export default function DashboardPage() {
  const queryClient = useQueryClient();

  // Modal state
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  // Filters state
  const [marca, setMarca] = useState("");
  const [meses, setMeses] = useState(3);
  const [frequency, setFrequency] = useState<'MONTHLY' | 'WEEKLY'>('MONTHLY');
  const [busqueda, setBusqueda] = useState("");

  const [salesStatus, setSalesStatus] = useState<'all' | 'with_sales' | 'without_sales'>('all');
  const [estadosSeleccionados, setEstadosSeleccionados] = useState<StockStatus[]>([]);
  const [soloBajoMinimo, setSoloBajoMinimo] = useState(false);

  // Sorting state
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: null, direction: null });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  // Manager+ Sync State
  const [pendientesData, setPendientesData] = useState<Record<string, number>>({});

  // Data fetching
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["dashboard", meses, marca, frequency],
    queryFn: () => fetchDashboard(meses, marca || undefined, frequency),
  });

  // ... (rest of code) ...



  // Refetch on window focus (fix for sync issue)
  useEffect(() => {
    const onFocus = () => {
      refetch();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refetch]);

  // Reset mutation
  const resetMutation = useMutation({
    mutationFn: resetOrders,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  // Handle reset with confirmation
  const handleReset = () => {
    if (confirm("¿Estás seguro de que quieres reiniciar TODAS las compras a 0?\n\nEsta acción eliminará todas las cantidades ingresadas en 'A Comprar'.")) {
      resetMutation.mutate();
    }
  };

  // Handle manual sync
  const handleSyncProducts = () => {
    setIsSyncModalOpen(true);
  };

  // Productos con compra registrada (para exportación)
  const productosParaExportar = useMemo(() => {
    if (!data?.productos) return [];
    return data.productos.filter(p => p.compraRealizar && p.compraRealizar > 0);
  }, [data?.productos]);

  // Funciones de exportación
  const exportarCSV = async () => {
    if (!productosParaExportar.length) return;

    const items = productosParaExportar.map(p => ({
      sku: p.producto.sku,
      descripcion: p.producto.descripcion,
      cantidadSugerida: p.compraRealizar
    }));

    const res = await api.post("/purchase/export/csv", { items }, { responseType: 'blob' });
    const blob = res.data;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `OC_KC_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportarTorkTxt = async () => {
    if (!productosParaExportar.length) return;

    const items = productosParaExportar.map(p => ({
      sku: p.producto.sku,
      descripcion: p.producto.descripcion,
      cantidadSugerida: p.compraRealizar
    }));

    const res = await api.post("/purchase/export/tork-txt", { items }, { responseType: 'blob' });
    const blob = res.data;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `OC_Tork_${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Apply local filters
  const productosFiltered = useMemo(() => {
    if (!data?.productos) return [];

    let result = data.productos;

    // Filter by "Solo bajo mínimo" (Priority filter)
    if (soloBajoMinimo) {
      result = result.filter(p => p.bajoMinimo === true);
    }

    // Search filter
    if (busqueda.trim()) {
      const term = busqueda.toLowerCase();
      result = result.filter((p) => {
        const sku = p.producto.sku.toLowerCase();
        const desc = p.producto.descripcion.toLowerCase();
        const fam = (p.producto.familia || "").toLowerCase();
        return sku.includes(term) || desc.includes(term) || fam.includes(term);
      });
    }

    // Unified sales filter logic
    if (salesStatus === 'with_sales') {
      result = result.filter((p) => (p.promedio || 0) > 0);
    } else if (salesStatus === 'without_sales') {
      result = result.filter((p) => (p.promedio || 0) === 0);
    }

    // Filter by status
    if (estadosSeleccionados.length > 0) {
      result = result.filter((p) => {
        const stock = p.mesActual?.stockActual || 0;
        const promedio = p.promedio || 0;
        const sugerido = p.compraSugerida || 0;
        const status = calculateProductStatus(stock, promedio, sugerido);
        return estadosSeleccionados.includes(status);
      });
    }



    // Apply sorting
    if (sortConfig.column && sortConfig.direction) {
      result = [...result].sort((a, b) => {
        let aValue: string | number;
        let bValue: string | number;

        switch (sortConfig.column) {
          case "familia":
            aValue = (a.producto.familia || "").toLowerCase();
            bValue = (b.producto.familia || "").toLowerCase();
            break;
          case "sku":
            aValue = a.producto.sku.toLowerCase();
            bValue = b.producto.sku.toLowerCase();
            break;
          case "descripcion":
            aValue = a.producto.descripcion.toLowerCase();
            bValue = b.producto.descripcion.toLowerCase();
            break;
          case "promedio":
            aValue = a.promedio || 0;
            bValue = b.promedio || 0;
            break;
          case "ventaMes":
            aValue = a.mesActual?.ventaActual || 0;
            bValue = b.mesActual?.ventaActual || 0;
            break;
          case "stock":
            aValue = a.mesActual?.stockActual || 0;
            bValue = b.mesActual?.stockActual || 0;
            break;
          case "sugerido":
            aValue = a.compraSugerida || 0;
            bValue = b.compraSugerida || 0;
            break;
          case "aComprar":
            aValue = a.compraRealizar || 0;
            bValue = b.compraRealizar || 0;
            break;
          case "pendientes":
            aValue = pendientesData[a.producto.sku] || 0;
            bValue = pendientesData[b.producto.sku] || 0;
            break;
          default:
            // Handle mes_X columns
            if (sortConfig.column?.startsWith("mes_")) {
              const mesIndex = parseInt(sortConfig.column.split("_")[1], 10);
              aValue = a.ventasMeses[mesIndex]?.cantidad || 0;
              bValue = b.ventasMeses[mesIndex]?.cantidad || 0;
            } else {
              return 0;
            }
        }

        if (typeof aValue === "string" && typeof bValue === "string") {
          return sortConfig.direction === "asc"
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue);
        }

        // Numbers: desc = mayor primero
        return sortConfig.direction === "desc"
          ? (bValue as number) - (aValue as number)
          : (aValue as number) - (bValue as number);
      });
    }

    return result;
  }, [data?.productos, busqueda, salesStatus, estadosSeleccionados, soloBajoMinimo, sortConfig, pendientesData]);

  // Paginated products
  const { paginatedProducts, totalPages } = useMemo(() => {
    if (pageSize === -1) {
      return { paginatedProducts: productosFiltered, totalPages: 1 };
    }

    const total = Math.ceil(productosFiltered.length / pageSize);
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;

    return {
      paginatedProducts: productosFiltered.slice(start, end),
      totalPages: total || 1,
    };
  }, [productosFiltered, currentPage, pageSize]);

  // Reset to page 1 when filters change
  const handleFilterChange = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value);
    setCurrentPage(1);
  };

  // Handle page size change
  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const handleSort = (column: SortColumn) => {
    setSortConfig((prev) => {
      if (prev.column === column) {
        // Cycle: null -> asc -> desc -> null
        if (prev.direction === null) return { column, direction: "asc" };
        if (prev.direction === "asc") return { column, direction: "desc" };
        return { column: null, direction: null };
      }
      return { column, direction: "asc" };
    });
  };

  // KPI calculations
  const kpis = useMemo(() => {
    const productos = productosFiltered;
    const todosProductos = data?.productos || [];
    const totalProductos = productos.length;

    const productosConSugerencia = productos.filter((p) => (p.compraSugerida || 0) > 0).length;

    // Stock Crítico: sobre TODOS los productos (no filtrado) para siempre mostrar el total real
    const productosCriticos = todosProductos.filter((p) => {
      const stock = p.mesActual?.stockActual || 0;
      const prom = p.promedio || 0;
      const sugerido = p.compraSugerida || 0;
      // Crítico = sugerido >= 0 (no sobrestock) Y stock < 50% del promedio
      return sugerido >= 0 && prom > 0 && stock / prom < 0.5;
    }).length;

    // Bajo Mínimo: productos con stockMinimo configurado y stock actual por debajo
    const productosBajoMinimo = todosProductos.filter((p) => p.bajoMinimo === true).length;

    const totalCompras = productos.reduce((sum, p) => sum + (p.compraRealizar || 0), 0);

    return {
      totalProductos,
      productosConSugerencia,
      productosCriticos,
      productosBajoMinimo,
      totalCompras,
    };
  }, [productosFiltered, data?.productos]);

  // Last update time
  const lastUpdate = data?.meta?.generadoEn
    ? new Date(data.meta.generadoEn).toLocaleTimeString("es-CL")
    : undefined;

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          lastUpdate={lastUpdate}
          isLoading={isFetching}
          onRefresh={() => refetch()}
          onReset={handleReset}
          isResetting={resetMutation.isPending}
          onSyncProducts={handleSyncProducts}
          isSyncing={isSyncModalOpen}
        />

        <div className="bg-white border-b border-slate-200 px-6 py-2 flex items-center justify-end gap-2">
          <PendingShipmentsSync
            onPendientesLoaded={setPendientesData}
          />
        </div>

        <main className="flex-1 overflow-auto p-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <KPICard
              title="Total Productos"
              value={kpis.totalProductos}
              icon={Package}
            />
            <KPICard
              title="Con Sugerencia"
              value={kpis.productosConSugerencia}
              subtitle="Productos a reabastecer"
              icon={TrendingUp}
              trend="neutral"
            />
            <KPICard
              title="Stock Crítico"
              value={kpis.productosCriticos}
              subtitle={kpis.productosCriticos > 0 ? "Requieren atención" : "Todo OK"}
              icon={AlertTriangle}
              trend={kpis.productosCriticos > 0 ? "down" : "neutral"}
            />
            <KPICard
              title="Bajo Mínimo"
              value={kpis.productosBajoMinimo}
              subtitle={kpis.productosBajoMinimo > 0 ? "Bajo stock mínimo" : "Todos OK"}
              icon={AlertTriangle}
              trend={kpis.productosBajoMinimo > 0 ? "down" : "neutral"}
            />
            <KPICard
              title="Compras Registradas"
              value={kpis.totalCompras.toLocaleString("es-CL")}
              subtitle="Unidades a pedir"
              icon={ShoppingCart}
              trend="neutral"
            />
          </div>

          {/* Barra de Exportación */}
          {productosParaExportar.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Download className="h-5 w-5 text-slate-600" />
                  <div>
                    <p className="font-medium text-slate-900">
                      {productosParaExportar.length} productos listos para exportar
                    </p>
                    <p className="text-sm text-slate-500">
                      Solo se exportan productos con valor en "A Comprar"
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={exportarCSV}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                  >
                    <Download className="h-4 w-4" />
                    CSV Kimberly Clark
                  </button>
                  <button
                    onClick={exportarTorkTxt}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
                  >
                    <FileText className="h-4 w-4" />
                    TXT Tork
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <FiltersBar
            marca={marca}
            onMarcaChange={handleFilterChange(setMarca)}
            meses={meses}
            onMesesChange={handleFilterChange(setMeses)}
            busqueda={busqueda}
            onBusquedaChange={handleFilterChange(setBusqueda)}
            frequency={frequency}
            onFrequencyChange={(newFreq) => {
              setFrequency(newFreq);
              // Set default period when switching
              if (newFreq === 'WEEKLY') {
                setMeses(4); // Default 4 weeks
              } else {
                setMeses(3); // Default 3 months
              }
              setCurrentPage(1);
            }}

            salesStatus={salesStatus}
            onSalesStatusChange={handleFilterChange(setSalesStatus)}
            estadosSeleccionados={estadosSeleccionados}
            onEstadosChange={handleFilterChange(setEstadosSeleccionados)}
            soloBajoMinimo={soloBajoMinimo}
            onSoloBajoMinimoChange={handleFilterChange(setSoloBajoMinimo)}
            totalProductos={data?.productos?.length || 0}
            productosVisibles={productosFiltered.length}
            className="mb-4"
          />

          {/* Pagination - Top */}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={productosFiltered.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={handlePageSizeChange}
            className="mb-4"
          />

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-64 text-red-600">
              Error al cargar datos: {(error as Error).message}
            </div>
          ) : (
            <ProductTable
              productos={paginatedProducts}
              columnas={data?.meta?.columnas || []}
              onOrderUpdated={(id, cant, tipo) => {
                // Optimistic update
                queryClient.setQueryData(
                  ["dashboard", meses, marca, frequency],
                  (oldData: any) => {
                    if (!oldData) return oldData;
                    return {
                      ...oldData,
                      data: oldData.data.map((p: any) =>
                        p.producto.id === id
                          ? { ...p, compraRealizar: cant, tipoCompra: tipo }
                          : p
                      ),
                      // Also update productos array if it exists separately (it does in the response structure)
                      productos: oldData.productos?.map((p: any) =>
                        p.producto.id === id
                          ? { ...p, compraRealizar: cant, tipoCompra: tipo }
                          : p
                      )
                    };
                  }
                );
                // Also invalidate loosely to ensure eventually consistent, but maybe not immediate refetch?
                // Or simply rely on optimistic update. 
                // Given the bug is rate limit, we skip refetch().
              }}
              pendientesMap={pendientesData}
              sortConfig={sortConfig}
              onSort={handleSort}
              frequency={frequency}
            />
          )}

          {/* Pagination - Bottom */}
          {!isLoading && !error && productosFiltered.length > 0 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={productosFiltered.length}
              onPageChange={setCurrentPage}
              onPageSizeChange={handlePageSizeChange}
              className="mt-4"
            />
          )}
        </main>
      </div>
      <SyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
      />
    </div>
  );
}
