
"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { X, AlertTriangle, CheckCircle, Info } from "lucide-react";

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm?: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: "info" | "success" | "warning" | "error";
    isLoading?: boolean;
}

export function ConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = "Confirmar",
    cancelText = "Cancelar",
    type = "warning",
    isLoading = false
}: ConfirmationModalProps) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (isOpen) setVisible(true);
        else setTimeout(() => setVisible(false), 200);
    }, [isOpen]);

    if (!visible) return null;

    const getIcon = () => {
        switch (type) {
            case "success": return <CheckCircle className="h-6 w-6 text-green-600" />;
            case "error": return <AlertTriangle className="h-6 w-6 text-red-600" />;
            case "warning": return <AlertTriangle className="h-6 w-6 text-amber-600" />;
            default: return <Info className="h-6 w-6 text-blue-600" />;
        }
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div
            className={cn(
                "fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity duration-200",
                isOpen ? "opacity-100" : "opacity-0"
            )}
            onClick={handleBackdropClick}
        >
            <div
                className={cn(
                    "w-full max-w-md bg-white rounded-xl shadow-2xl p-6 m-4 border border-slate-200 transform transition-all duration-200",
                    isOpen ? "scale-100 opacity-100 translate-y-0" : "scale-95 opacity-0 translate-y-4"
                )}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "p-2 rounded-full",
                            type === "success" && "bg-green-50",
                            type === "error" && "bg-red-50",
                            type === "warning" && "bg-amber-50",
                            type === "info" && "bg-blue-50"
                        )}>
                            {getIcon()}
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 leading-6">
                            {title}
                        </h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isLoading}
                        className="text-slate-400 hover:text-slate-500 transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="mb-6 ml-11">
                    <p className="text-sm text-slate-500 whitespace-pre-wrap">
                        {message}
                    </p>
                </div>

                <div className="flex justify-end gap-3">
                    {onConfirm ? (
                        <>
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isLoading}
                                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                            >
                                {cancelText}
                            </button>
                            <button
                                type="button"
                                onClick={onConfirm}
                                disabled={isLoading}
                                className={cn(
                                    "px-4 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors flex items-center gap-2",
                                    type === "error" ? "bg-red-600 hover:bg-red-700 focus:ring-red-500" : "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500"
                                )}
                            >
                                {isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                {confirmText}
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                        >
                            Cerrar
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
