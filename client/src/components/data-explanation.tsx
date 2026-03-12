'use client';

import React from 'react';
import { Info, BarChart3, ShoppingCart, ShoppingBag, Target } from 'lucide-react';

interface DataExplanationProps {
    type: 'ventas' | 'compras' | 'analisis' | 'dashboard' | 'metas';
}

export function DataExplanation({ type }: DataExplanationProps) {
    const content = {
        compras: {
            title: 'Lógica de Sincronización de Compras',
            icon: <ShoppingBag className="w-5 h-5 text-blue-600" />,
            description: 'Proceso de extracción y consolidación de costos basado en facturación real del ERP.',
            rules: [
                'Documentación: Se extraen exclusivamente FACE y FIM desde Manager+. No se filtran por White List para asegurar que gastos generales y servicios queden registrados.',
                'Fórmula de Costo: Se utiliza el Precio Unitario Neto de la factura. Si una factura tiene múltiples líneas del mismo producto, se promedia el costo ponderado para el histórico.',
                'Integridad: El sistema recorre cada documento y, si detecta un SKU inexistente, lo crea automáticamente consultando la ficha completa en el ERP en tiempo real.'
            ]
        },
        ventas: {
            title: 'Lógica de Sincronización de Ingresos',
            icon: <BarChart3 className="w-5 h-5 text-green-600" />,
            description: 'Cálculo de ingresos netos mediante la jerarquía de documentos de venta según el período.',
            rules: [
                'Jerarquía de Periodo: En periodos HISTÓRICOS se contabilizan TODAS las Facturas (FAVE), Boletas (BOVE) e Ingresos (BOVE/NCVE) sin considerar guías. En el periodo ACTUAL se priorizan las Guías (GDVE) y se omiten las Facturas que referencien a una guía ya contabilizada.',
                'Cálculo Neto: Venta = Σ(Monto Neto por Ítem) - Notas de Crédito (NCVE). Se utiliza la fórmula exacta de Manager para garantizar consistencia con el balance contable final.',
                'Discrepancias: Al capturar el 100% de la data bruta del ERP, cualquier diferencia entre lo visualizado y lo esperado no depende de la lógica del sistema sino de la correcta emisión y glosa de documentos en Manager+.'
            ]
        },
        analisis: {
            title: 'Transparencia en Análisis de Mercado',
            icon: <ShoppingCart className="w-5 h-5 text-purple-600" />,
            description: 'Metodología detrás de los KPIs de rotación, clasificación ABC y márgenes.',
            rules: [
                'Clasificación ABC: Basada en el Principio de Pareto. Se calcula el % de aporte al ingreso acumulado; "A" representa el 80% de la facturación, "B" el 15% y "C" el 5% restante.',
                'Cobertura de Stock: Stock Actual / Promedio de Venta Mensual. Este ratio indica cuántos meses de inventario quedan basados en la demanda real del período seleccionado.',
                'Tendencia: Compara la venta del último mes cerrado versus el promedio del período. Un valor positivo indica crecimiento en la demanda del producto.'
            ]
        },
        dashboard: {
            title: 'Arquitectura de Datos y Sincronización',
            icon: <Info className="w-5 h-5 text-indigo-600" />,
            description: 'Detalle técnico sobre la obtención de productos, flujos de sincronización e integridad del dashboard.',
            rules: [
                'Captura de Datos: Se toma el 100% de la data bruta de Manager+. El sistema no omite registros contables; el cálculo es una réplica exacta de la información fuente.',
                'Transición de Periodo: Al cerrar un mes, el sistema actualiza automáticamente la data para ese periodo usando únicamente Facturas/Boletas (FAVE/BOVE), descartando la información de Guías usada temporalmente para el "tiempo real".',
                'Integridad del Dashboard: Los ingresos y egresos se calculan sobre el "Monto Neto" por línea. El inventario se actualiza desde la columna "Stock Actual" del ERP en cada ciclo de sincronización.'
            ]
        },
        metas: {
            title: 'Lógica de Ventas por Vendedor',
            icon: <Target className="w-5 h-5 text-rose-600" />,
            description: 'Metodología de atribución y cálculo de cumplimiento para el equipo comercial.',
            rules: [
                'Atribución y Prioridad: Se identifica al vendedor en Manager+. Se suman GDVE (prioridad en mes actual), FAVE y BOVE, descontando automáticamente las NCVE. No quedan documentos "pendientes" de extracción.',
                'Consistencia: La fórmula de cálculo es inalterable y refleja los montos netos emitidos. Cualquier discrepancia debe revisarse directamente en el documento original del ERP.',
                'Universo de Productos: Se considera el 100% de los productos facturados para el cumplimiento de objetivos (Venta Total), asegurando transparencia contable absoluta.'
            ]
        }
    }[type];

    return (
        <div className="relative overflow-hidden mb-6 p-5 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="absolute top-0 right-0 p-4 opacity-[0.03] text-slate-900">
                <Info size={64} />
            </div>

            <div className="flex items-start gap-4">
                <div className="mt-1 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    {content.icon}
                </div>
                <div className="flex-1">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        {content.title}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600 font-medium italic">
                        {content.description}
                    </p>
                    <ul className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                        {content.rules.map((rule, idx) => (
                            <li key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100/50 text-[11px] leading-relaxed text-slate-700 shadow-sm/5">
                                <div className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                                {rule}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}
