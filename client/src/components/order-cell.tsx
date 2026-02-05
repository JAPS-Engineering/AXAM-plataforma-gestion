"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

export interface OrderCellProps {
    productoId: number;
    initialValue: number | null;
    initialType?: string; // 'OC' | 'OCI'
    onSave: (productoId: number, value: number, tipo: string) => Promise<void>;
}

export function OrderCell({ productoId, initialValue, initialType = 'OC', onSave }: OrderCellProps) {
    const [value, setValue] = useState<string>(initialValue?.toString() ?? "");
    const [tipo, setTipo] = useState<string>(initialType);
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanged, setHasChanged] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const originalValue = useRef(initialValue);
    const originalType = useRef(initialType);

    useEffect(() => {
        setValue(initialValue?.toString() ?? "");
        originalValue.current = initialValue;
    }, [initialValue]);

    useEffect(() => {
        setTipo(initialType || 'OC');
        originalType.current = initialType || 'OC';
    }, [initialType]);

    const handleSave = useCallback(async (newValue: string, newTipo: string) => {
        const numValue = newValue === "" ? 0 : parseFloat(newValue);
        if (isNaN(numValue) || numValue < 0) {
            setValue(originalValue.current?.toString() ?? "");
            return;
        }

        // Only save if something changed
        if (numValue === originalValue.current && newTipo === originalType.current) {
            setHasChanged(false);
            return;
        }

        setIsSaving(true);
        try {
            await onSave(productoId, numValue, newTipo);
            originalValue.current = numValue;
            originalType.current = newTipo;
            setHasChanged(false);
        } catch (error) {
            console.error("Error guardando:", error);
            // Revert on error? Or just keep local state
        } finally {
            setIsSaving(false);
        }
    }, [onSave, productoId]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setValue(newValue);
        setHasChanged(true);

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            handleSave(newValue, tipo);
        }, 800);
    }, [handleSave, tipo]);

    const handleTipoChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        const newTipo = e.target.value;
        setTipo(newTipo);
        setHasChanged(true);
        handleSave(value, newTipo); // Immediate save on type change
    }, [handleSave, value]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.currentTarget.blur();
            handleSave(value, tipo);
        }
    }, [handleSave, value, tipo]);

    return (
        <div className="flex items-center gap-1">
            <input
                type="text"
                inputMode="numeric"
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                className={cn(
                    "w-16 px-2 py-1 text-right bg-amber-50 border border-transparent rounded text-xs",
                    "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white",
                    "hover:border-amber-300 transition-colors",
                    isSaving && "opacity-50"
                )}
                placeholder="0"
                disabled={isSaving}
            />
            {(value !== "" && value !== "0") && (
                <select
                    value={tipo}
                    onChange={handleTipoChange}
                    className="text-xs border border-amber-200 rounded bg-white py-1 px-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    disabled={isSaving}
                >
                    <option value="OC">OC</option>
                    <option value="OCI">OCI</option>
                </select>
            )}
        </div>
    );
}
