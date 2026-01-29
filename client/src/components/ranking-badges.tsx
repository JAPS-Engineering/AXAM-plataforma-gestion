"use client";

import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

// --- Classification Badge ---

interface ClassificationBadgeProps {
    classification: "A" | "B" | "C";
    className?: string;
}

const CLASS_CONFIG = {
    A: {
        label: "A", // Top 80%
        description: "Alta Importancia",
        detail: "Representa el 80% de tus ingresos acumulados.",
        styles: "bg-emerald-100 text-emerald-800 border-emerald-200 ring-emerald-500/20",
        tooltipBg: "bg-slate-900"
    },
    B: {
        label: "B", // Next 15%
        description: "Importancia Media",
        detail: "Representa el siguiente 15% de ingresos (80-95%).",
        styles: "bg-blue-100 text-blue-800 border-blue-200 ring-blue-500/20",
        tooltipBg: "bg-slate-900"
    },
    C: {
        label: "C", // Bottom 5%
        description: "Baja Importancia",
        detail: "Representa el último 5% de tus ingresos.",
        styles: "bg-slate-100 text-slate-600 border-slate-200 ring-slate-500/20",
        tooltipBg: "bg-slate-900"
    }
};

export function ClassificationBadge({ classification, className }: ClassificationBadgeProps) {
    const config = CLASS_CONFIG[classification];
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    const handleMouseEnter = (e: React.MouseEvent<HTMLSpanElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setTooltipPosition({
            top: rect.top - 8,
            left: rect.left + rect.width / 2,
        });
        setShowTooltip(true);
    };

    const tooltip = showTooltip && mounted && (
        <div
            className="fixed z-[9999] w-64 p-3 bg-slate-900 text-white text-xs rounded-lg shadow-xl pointer-events-none"
            style={{ top: tooltipPosition.top, left: tooltipPosition.left, transform: 'translate(-50%, -100%)' }}
        >
            <div className="font-bold text-sm mb-1 text-white">Clase {classification}</div>
            <div className="font-medium text-slate-200 mb-2">{config.description}</div>
            <div className="text-slate-400 border-t border-slate-700 pt-2 leading-relaxed">
                {config.detail}
            </div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
        </div>
    );

    return (
        <>
            <span
                className={cn(
                    "inline-flex items-center justify-center w-8 h-6 text-xs font-bold rounded-md border ring-1 ring-inset cursor-help transition-all shadow-sm",
                    config.styles,
                    className
                )}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={() => setShowTooltip(false)}
            >
                {config.label}
            </span>
            {mounted && showTooltip && createPortal(tooltip, document.body)}
        </>
    );
}

// --- Trend Badge ---

interface TrendBadgeProps {
    value: number; // Percentage change
    className?: string;
}

export function TrendBadge({ value, className }: TrendBadgeProps) {
    const isPositive = value > 0;
    const isNegative = value < 0;
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setTooltipPosition({
            top: rect.top - 8,
            left: rect.left + rect.width / 2,
        });
        setShowTooltip(true);
    };

    const tooltip = showTooltip && mounted && (
        <div
            className="fixed z-[9999] w-64 p-3 bg-slate-900 text-white text-xs rounded-lg shadow-xl pointer-events-none"
            style={{ top: tooltipPosition.top, left: tooltipPosition.left, transform: 'translate(-50%, -100%)' }}
        >
            <div className="font-bold text-sm mb-1 text-white">Tendencia Mensual</div>
            <div className="font-medium text-slate-200 mb-2">
                Comparativa: Último Mes vs Promedio.
            </div>
            <div className="text-slate-400 border-t border-slate-700 pt-2 leading-relaxed">
                Indica si el producto vendió más o menos en el último mes registrado comparado con su promedio del período seleccionado.
                <br />
                <span className="font-mono text-slate-500 mt-1 block">Fórmula: (Último - Promedio) / Promedio</span>
            </div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
        </div>
    );

    return (
        <>
            <div
                className={cn("flex items-center gap-1.5 cursor-help", className)}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={() => setShowTooltip(false)}
            >
                <div className={cn(
                    "p-1 rounded-full",
                    isPositive ? "bg-emerald-100 text-emerald-600" :
                        isNegative ? "bg-red-100 text-red-600" :
                            "bg-slate-100 text-slate-500"
                )}>
                    {isPositive ? <TrendingUp className="h-3 w-3" /> :
                        isNegative ? <TrendingDown className="h-3 w-3" /> :
                            <Minus className="h-3 w-3" />}
                </div>
                <span className={cn(
                    "text-xs font-medium tabular-nums",
                    isPositive ? "text-emerald-700" :
                        isNegative ? "text-red-700" :
                            "text-slate-500"
                )}>
                    {isPositive ? "+" : ""}{value.toFixed(1)}%
                </span>
            </div>
            {mounted && showTooltip && createPortal(tooltip, document.body)}
        </>
    );
}

// --- Coverage Badge ---

interface CoverageBadgeProps {
    value: number; // Months of coverage
    className?: string;
}

export function CoverageBadge({ value, className }: CoverageBadgeProps) {
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    const handleMouseEnter = (e: React.MouseEvent<HTMLSpanElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setTooltipPosition({
            top: rect.top - 8,
            left: rect.left + rect.width / 2,
        });
        setShowTooltip(true);
    };

    const tooltip = showTooltip && mounted && (
        <div
            className="fixed z-[9999] w-64 p-3 bg-slate-900 text-white text-xs rounded-lg shadow-xl pointer-events-none"
            style={{ top: tooltipPosition.top, left: tooltipPosition.left, transform: 'translate(-50%, -100%)' }}
        >
            <div className="font-bold text-sm mb-1 text-white">Cobertura de Stock</div>
            <div className="font-medium text-slate-200 mb-2">
                Meses de Inventario Disponible.
            </div>
            <div className="text-slate-400 border-t border-slate-700 pt-2 leading-relaxed">
                Calcula para cuántos meses alcanza el stock actual basado en el ritmo de venta promedio del período.
                <br />
                <span className="font-mono text-slate-500 mt-1 block">Fórmula: Stock Actual / Venta Promedio (Unidades)</span>
            </div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
        </div>
    );

    return (
        <>
            <span
                className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium cursor-help",
                    value < 1 ? "bg-red-100 text-red-800" :
                        value < 3 ? "bg-amber-100 text-amber-800" :
                            "bg-emerald-100 text-emerald-800",
                    className
                )}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={() => setShowTooltip(false)}
            >
                {value.toFixed(1)} m
            </span>
            {mounted && showTooltip && createPortal(tooltip, document.body)}
        </>
    );
}
