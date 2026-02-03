
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

type SortDirection = "asc" | "desc" | null;

interface SortConfig {
    column: string | null;
    direction: SortDirection;
}

export function SortButton({ column, currentSort, onSort, isNumeric = false }: { column: string, currentSort: SortConfig, onSort: (c: string) => void, isNumeric?: boolean }) {
    const isActive = currentSort.column === column;
    const direction = isActive ? currentSort.direction : null;

    return (
        <button
            onClick={() => onSort(column)}
            className={cn(
                "ml-1 p-0.5 rounded hover:bg-slate-200/50 transition-colors inline-flex items-center",
                isActive && "text-indigo-600"
            )}
            title={isNumeric
                ? (direction === "desc" ? "Ordenar de menor a mayor" : "Ordenar de mayor a menor")
                : (direction === "asc" ? "Ordenar Z-A" : "Ordenar A-Z")
            }
        >
            {direction === "asc" ? (
                <ChevronUp className="h-4 w-4" />
            ) : direction === "desc" ? (
                <ChevronDown className="h-4 w-4" />
            ) : (
                <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
            )}
        </button>
    );
}
