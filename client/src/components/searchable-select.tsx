"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Option {
    value: string;
    label: string;
}

interface SearchableSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: Option[];
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    searchPlaceholder?: string;
}

export function SearchableSelect({
    value,
    onChange,
    options,
    placeholder = "Seleccionar...",
    disabled = false,
    className,
    searchPlaceholder = "Buscar..."
}: SearchableSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Close when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Focus input when opening
    useEffect(() => {
        if (isOpen && searchInputRef.current) {
            // setTimeout to ensure render is complete
            setTimeout(() => {
                searchInputRef.current?.focus();
            }, 50);
        } else {
            setSearchTerm(""); // Reset search when closing
        }
    }, [isOpen]);

    const filteredOptions = useMemo(() => {
        if (!searchTerm.trim()) return options;
        const term = searchTerm.toLowerCase();
        return options.filter(opt =>
            opt.label.toLowerCase().includes(term)
        );
    }, [options, searchTerm]);

    const selectedOption = options.find(opt => opt.value === value);

    const handleSelect = (val: string) => {
        onChange(val);
        setIsOpen(false);
    };

    return (
        <div ref={containerRef} className={cn("relative", className)}>
            {/* Trigger */}
            <div
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className={cn(
                    "w-full px-3 py-2 text-sm border bg-white rounded-lg flex items-center justify-between cursor-pointer transition-all",
                    disabled ? "opacity-50 cursor-not-allowed bg-slate-100" : "hover:border-indigo-400 focus:ring-2 focus:ring-indigo-500",
                    isOpen ? "border-indigo-500 ring-2 ring-indigo-500/20" : "border-slate-300",
                )}
            >
                <span className={cn("block truncate", !selectedOption && "text-slate-500")}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", isOpen && "rotate-180")} />
            </div>

            {/* Dropdown */}
            {isOpen && !disabled && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 origin-top">
                    {/* Search Bar */}
                    <div className="p-2 border-b border-slate-100 bg-slate-50/50">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder={searchPlaceholder}
                                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white"
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    </div>

                    {/* Options List */}
                    <div className="max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200">
                        {filteredOptions.length > 0 ? (
                            <div className="p-1">
                                {filteredOptions.map((opt) => {
                                    const isSelected = opt.value === value;
                                    return (
                                        <div
                                            key={opt.value}
                                            onClick={() => handleSelect(opt.value)}
                                            className={cn(
                                                "px-3 py-2 text-sm rounded-md cursor-pointer flex items-center justify-between group transition-colors",
                                                isSelected ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-700 hover:bg-slate-50"
                                            )}
                                        >
                                            <span className="truncate mr-2">{opt.label}</span>
                                            {isSelected && <Check className="h-3.5 w-3.5 text-indigo-600 flex-shrink-0" />}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="px-4 py-8 text-center text-xs text-slate-500">
                                No se encontraron resultados
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
