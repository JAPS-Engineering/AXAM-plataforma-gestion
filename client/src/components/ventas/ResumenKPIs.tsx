import { DollarSign, TrendingUp, Activity, PieChart as PieIcon } from "lucide-react";
import { formatTooltipCLP } from "@/lib/utils";
import { VentasResumenKPIs } from "@/lib/api";

interface ResumenKPIsProps {
    kpis: VentasResumenKPIs | undefined;
    loading: boolean;
    error: any;
}

export function ResumenKPIs({ kpis, loading, error }: ResumenKPIsProps) {
    if (loading) return null; // Or a skeleton
    if (error) return null;

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <DollarSign className="h-24 w-24 text-indigo-600 transform translate-x-4 -translate-y-4" />
                </div>
                <p className="text-sm font-medium text-slate-500 relative z-10">Ventas Totales (Periodo)</p>
                <h3 className="text-3xl font-bold text-slate-900 mt-2 relative z-10">
                    {formatTooltipCLP(kpis?.totalMonto || 0)}
                </h3>
                <div className="mt-4 flex items-center gap-2 relative z-10">
                    <div className="p-1.5 bg-green-100 rounded text-green-700">
                        <TrendingUp className="h-4 w-4" />
                    </div>
                    <span className="text-sm text-slate-600">Periodo seleccionado</span>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Activity className="h-24 w-24 text-blue-600 transform translate-x-4 -translate-y-4" />
                </div>
                <p className="text-sm font-medium text-slate-500 relative z-10">Promedio Mensual</p>
                <h3 className="text-3xl font-bold text-slate-900 mt-2 relative z-10">
                    {formatTooltipCLP(kpis?.promedioMensual || 0)}
                </h3>
                <div className="mt-4 flex items-center gap-2 relative z-10">
                    <span className={`px-2 py-0.5 rounded text-sm font-bold ${(kpis?.crecimiento || 0) >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {(kpis?.crecimiento || 0) > 0 ? '+' : ''}{(kpis?.crecimiento || 0).toFixed(1)}%
                    </span>
                    <div className="flex items-center gap-1 group/tooltip relative cursor-help">
                        <span className="text-xs text-slate-500">vs promedio</span>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-white text-[10px] rounded shadow-lg opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-50 text-center pointer-events-none">
                            Comparación del último mes cerrado vs Promedio del período
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <PieIcon className="h-24 w-24 text-purple-600 transform translate-x-4 -translate-y-4" />
                </div>
                <p className="text-sm font-medium text-slate-500 relative z-10">Producto Estrella</p>
                <h3 className="text-lg font-bold text-slate-900 mt-2 truncate max-w-[90%] relative z-10" title={kpis?.topProducto?.producto.descripcion}>
                    {kpis?.topProducto?.producto.sku || "N/A"}
                </h3>
                <p className="text-2xl font-semibold text-indigo-600 mt-1 relative z-10">
                    {formatTooltipCLP(kpis?.topProducto?.totalMonto || 0)}
                </p>
            </div>
        </div>
    );
}
