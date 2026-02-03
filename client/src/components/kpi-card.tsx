import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Info, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPICardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: LucideIcon;
    trend?: "up" | "down" | "neutral";
    className?: string;
    tooltip?: React.ReactNode;
}

export function KPICard({
    title,
    value,
    subtitle,
    icon: Icon,
    trend,
    className,
    tooltip,
}: KPICardProps) {
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!tooltip) return;
        const rect = e.currentTarget.getBoundingClientRect();
        setTooltipPosition({
            top: rect.top - 8,
            left: rect.left + rect.width / 2,
        });
        setShowTooltip(true);
    };

    const tooltipContent = showTooltip && mounted && tooltip && (
        <div
            className="fixed z-[9999] w-64 p-3 bg-slate-900 text-white text-xs rounded-lg shadow-xl pointer-events-none"
            style={{
                top: tooltipPosition.top,
                left: tooltipPosition.left,
                transform: 'translate(-50%, -100%)',
            }}
        >
            {typeof tooltip === 'string' ? (
                <div className="font-medium text-slate-200 leading-relaxed">{tooltip}</div>
            ) : (
                tooltip
            )}
            {/* Arrow */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
        </div>
    );

    return (
        <>
            <div
                className={cn(
                    "bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow relative",
                    className
                )}
            >
                <div className="flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-1.5 mb-2">
                            <p className="text-sm font-medium text-slate-500">{title}</p>
                            {tooltip && (
                                <div
                                    className="cursor-help text-slate-400 hover:text-slate-600 transition-colors"
                                    onMouseEnter={handleMouseEnter}
                                    onMouseLeave={() => setShowTooltip(false)}
                                >
                                    <Info className="h-3.5 w-3.5" />
                                </div>
                            )}
                        </div>
                        <p className="text-3xl font-bold text-slate-900">{value}</p>
                        {subtitle && (
                            <p
                                className={cn(
                                    "mt-1 text-sm",
                                    trend === "up" && "text-green-600",
                                    trend === "down" && "text-red-600",
                                    trend === "neutral" && "text-slate-500"
                                )}
                            >
                                {subtitle}
                            </p>
                        )}
                    </div>
                    <div className="p-3 bg-blue-50 rounded-lg">
                        <Icon className="h-6 w-6 text-blue-600" />
                    </div>
                </div>
            </div>
            {mounted && showTooltip && createPortal(tooltipContent, document.body)}
        </>
    );
}
