import { useMemo, useState, useEffect } from "react";
import { PieChart as PieIcon, Filter, X, Plus, Trash2, Save, Users, Edit2, Check, ArrowRight, Wand2 } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { formatTooltipCLP } from "@/lib/utils";
import { MarketShareRow } from "@/lib/api";

interface FamilyGroup {
    id: string;
    name: string;
    families: string[];
    color: string;
}

interface MarketShareChartProps {
    data: (MarketShareRow & { isGroup?: boolean; color?: string })[] | undefined;
    meta: { anoActual: number; totalVentaAnual?: number; totalVentaPeriodo?: number } | undefined;
    allEntities: string[];
    selectedEntities: string[];
    onToggleEntity: (entity: string) => void;
    onSelectAll: () => void;
    onClearAll: () => void;
    loading: boolean;
    familyGroups: FamilyGroup[];
    rawFamilies: string[];
    onUpdateGroups: (groups: FamilyGroup[]) => void;
    colors: string[];
    marketShareRaw?: MarketShareRow[];
}

type ModalTab = "manage" | "create";

export function MarketShareChart({
    data,
    meta,
    allEntities,
    selectedEntities,
    onToggleEntity,
    onSelectAll,
    onClearAll,
    loading,
    familyGroups,
    rawFamilies,
    onUpdateGroups,
    colors,
    marketShareRaw
}: MarketShareChartProps) {
    const [showFilterDropdown, setShowFilterDropdown] = useState(false);
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [activeTab, setActiveTab] = useState<ModalTab>("manage");

    // Form State
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [groupName, setGroupName] = useState("");
    const [selectedForGroup, setSelectedForGroup] = useState<string[]>([]);
    const [groupError, setGroupError] = useState("");
    const [searchTerm, setSearchTerm] = useState("");

    // Smart Rules State
    const [smartThreshold, setSmartThreshold] = useState<string>("1.0");
    const [smartOperator, setSmartOperator] = useState<"<" | ">">("<");

    const filteredMarketShare = useMemo(() => {
        if (!data) return [];
        return data.filter(m => selectedEntities.includes(m.name));
    }, [data, selectedEntities]);

    const totalFiltrado = useMemo(() => {
        return filteredMarketShare.reduce((acc, curr) => acc + curr.value, 0);
    }, [filteredMarketShare]);

    const totalVentas = meta?.totalVentaPeriodo ?? meta?.totalVentaAnual ?? 0;

    // --- Logic ---

    // All families currently in use by other groups (excluding the one being edited)
    const familiesInOtherGroups = useMemo(() => {
        const used = new Set<string>();
        familyGroups.forEach(g => {
            if (g.id !== editingGroupId) {
                g.families.forEach(f => used.add(f));
            }
        });
        return used;
    }, [familyGroups, editingGroupId]);

    // Available families: Not in other groups, matches search
    const candidates = useMemo(() => {
        return rawFamilies
            .filter(f => !familiesInOtherGroups.has(f))
            .filter(f => f.toLowerCase().includes(searchTerm.toLowerCase()))
            .sort();
    }, [rawFamilies, familiesInOtherGroups, searchTerm]);

    const startCreating = () => {
        setEditingGroupId(null);
        setGroupName("");
        setSelectedForGroup([]);
        setGroupError("");
        setActiveTab("create");
    };

    const startEditing = (group: FamilyGroup) => {
        setEditingGroupId(group.id);
        setGroupName(group.name);
        setSelectedForGroup([...group.families]);
        setGroupError("");
        setActiveTab("create");
    };

    const handleSaveGroup = () => {
        if (!groupName.trim()) {
            setGroupError("El nombre es obligatorio.");
            return;
        }
        if (selectedForGroup.length < 2) {
            setGroupError("Selecciona al menos 2 familias.");
            return;
        }
        // Name duplicate check
        const nameConflict = familyGroups.some(g => g.name.toLowerCase() === groupName.trim().toLowerCase() && g.id !== editingGroupId);
        if (nameConflict) {
            setGroupError("Ya existe un grupo con ese nombre.");
            return;
        }

        let updatedGroups = [...familyGroups];

        if (editingGroupId) {
            // Edit
            updatedGroups = updatedGroups.map(g => g.id === editingGroupId ? {
                ...g,
                name: groupName.trim(),
                families: selectedForGroup
            } : g);
        } else {
            // Create
            const newGroup: FamilyGroup = {
                id: crypto.randomUUID(),
                name: groupName.trim(),
                families: selectedForGroup,
                color: colors[familyGroups.length % colors.length]
            };
            updatedGroups.push(newGroup);
        }

        onUpdateGroups(updatedGroups);
        setActiveTab("manage");
    };

    const handleDeleteGroup = (groupId: string) => {
        if (confirm("¿Estás seguro de eliminar este grupo?")) {
            onUpdateGroups(familyGroups.filter(g => g.id !== groupId));
        }
    };

    const toggleCandidate = (family: string) => {
        setSelectedForGroup(prev =>
            prev.includes(family) ? prev.filter(f => f !== family) : [...prev, family]
        );
    };

    const selectBySmartRule = () => {
        const threshold = parseFloat(smartThreshold);
        if (isNaN(threshold) || threshold <= 0) return;

        const toSelect: string[] = [];

        // Use raw data if available (best source), otherwise fallback to chart data
        const sourceData = marketShareRaw || data || [];

        const valuesMap = new Map<string, number>();
        sourceData.forEach(d => {
            // In raw data, isGroup doesn't exist (it's undefined), so !d.isGroup is true.
            // In chart data, we only want !d.isGroup.
            if (!d.isGroup) valuesMap.set(d.name, d.value);
        });

        candidates.forEach(fam => {
            const val = valuesMap.get(fam);
            // If value is missing and we used rawData, it might be 0 or simply not in top entries?
            // Assuming 0 if not found.
            const value = val || 0;

            if (value > 0 && totalVentas > 0) {
                const pct = (value / totalVentas) * 100;

                const matches = smartOperator === "<" ? pct < threshold : pct > threshold;
                if (matches) {
                    toSelect.push(fam);
                }
            }
        });

        // OVERWRITE selection (clears previous)
        setSelectedForGroup(toSelect);
    };

    if (loading) {
        return (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative h-[400px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <PieIcon className="h-5 w-5 text-indigo-500" />
                        Market Share Interno
                    </h3>
                    <p className="text-xs text-slate-500">Participación por Familia ({meta?.anoActual})</p>
                </div>

                <div className="flex items-center gap-2 relative z-10">
                    <button
                        onClick={() => { setShowGroupModal(true); setActiveTab("manage"); }}
                        className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold transition-colors"
                    >
                        <Users className="h-4 w-4" />
                        Grupos
                    </button>

                    <div className="h-6 w-px bg-slate-200 mx-1"></div>

                    <button
                        onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                        className={`p-2 rounded-lg transition-colors ${showFilterDropdown ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-slate-100 text-slate-500'}`}
                    >
                        <Filter className="h-5 w-5" />
                    </button>

                    {/* Dropdown de Filtros Visuales */}
                    {showFilterDropdown && (
                        <>
                            <div className="fixed inset-0 z-[40]" onClick={() => setShowFilterDropdown(false)} />
                            <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 z-[50] p-4 animate-in fade-in zoom-in duration-200 origin-top-right">
                                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                                    <span className="text-sm font-bold text-slate-900">Filtrar Visualización</span>
                                    <button onClick={() => setShowFilterDropdown(false)}><X className="h-4 w-4 text-slate-400" /></button>
                                </div>
                                <div className="flex gap-2 mb-3">
                                    <button onClick={onSelectAll} className="flex-1 text-[10px] font-bold py-1.5 bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100">Todas</button>
                                    <button onClick={onClearAll} className="flex-1 text-[10px] font-bold py-1.5 bg-slate-50 text-slate-600 rounded-md hover:bg-slate-100">Ninguna</button>
                                </div>
                                <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200">
                                    {allEntities.map((entity, idx) => {
                                        const isSelected = selectedEntities.includes(entity);
                                        const dataItem = data?.find(d => d.name === entity);
                                        const color = dataItem?.color || colors[idx % colors.length];
                                        return (
                                            <label key={idx} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer">
                                                <input type="checkbox" checked={isSelected} onChange={() => onToggleEntity(entity)} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }}></div>
                                                <span className={`text-xs ${isSelected ? 'text-slate-900 font-medium' : 'text-slate-500'} ${dataItem?.isGroup ? 'font-bold' : ''}`}>{entity} {dataItem?.isGroup ? '(Grupo)' : ''}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-center p-4">
                <div className="h-[300px] w-[300px] flex-shrink-0 relative">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={filteredMarketShare}
                                cx="50%"
                                cy="50%"
                                innerRadius={80}
                                outerRadius={120}
                                paddingAngle={2}
                                dataKey="value"
                            >
                                {filteredMarketShare.map((entry, index) => {
                                    const fill = entry.color || colors[allEntities.indexOf(entry.name) % colors.length];
                                    return <Cell key={`cell-${index}`} fill={fill} stroke="none" />;
                                })}
                            </Pie>
                            <Tooltip formatter={(value: any) => formatTooltipCLP(Number(value))} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                        </PieChart>
                    </ResponsiveContainer>

                    {/* Centered Total */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="text-center">
                            <span className="text-[10px] text-slate-400 block">Total Visible</span>
                            <span className="text-sm font-bold text-slate-800 block">{formatTooltipCLP(totalFiltrado)}</span>
                        </div>
                    </div>
                </div>

                {/* Side Legend */}
                <div className="flex-1 min-w-[200px] pl-0 md:pl-8 mt-6 md:mt-0 border-l border-transparent md:border-slate-100">
                    <CustomLegend
                        data={filteredMarketShare}
                        allEntities={allEntities}
                        colors={colors}
                    />
                </div>
            </div>

            <div className="mt-2 text-center text-[10px] text-slate-400">
                Total Período: {formatTooltipCLP(totalVentas)}
            </div>

            {/* --- MODAL DE GRUPOS MODERNIZADO --- */}
            {showGroupModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowGroupModal(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>

                        {/* Header */}
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Gestión de Grupos</h3>
                                <p className="text-xs text-slate-500">Agrupa familias pequeñas para limpiar la visualización.</p>
                            </div>
                            <button onClick={() => setShowGroupModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="h-5 w-5 text-slate-400" /></button>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-slate-100">
                            <button
                                onClick={() => setActiveTab("manage")}
                                className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === "manage" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                            >
                                Mis Grupos
                            </button>
                            <button
                                onClick={startCreating}
                                className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === "create" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                            >
                                {editingGroupId ? "Editar Grupo" : "Crear Nuevo"}
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-hidden relative bg-slate-50/50 flex flex-col">

                            {/* TAB: MANAGE */}
                            {activeTab === "manage" && (
                                <div className="p-6 h-full overflow-y-auto">
                                    {familyGroups.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-400 py-10">
                                            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                                <Users className="h-8 w-8 text-slate-300" />
                                            </div>
                                            <p className="text-sm">No tienes grupos creados.</p>
                                            <button onClick={startCreating} className="mt-4 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors">
                                                Crear el primero
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {familyGroups.map(group => (
                                                <div key={group.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow group relative">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: group.color }}></div>
                                                            <h4 className="font-bold text-slate-800 text-sm">{group.name}</h4>
                                                        </div>
                                                        <div className="flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button onClick={() => startEditing(group)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md"><Edit2 className="h-4 w-4" /></button>
                                                            <button onClick={() => handleDeleteGroup(group.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md"><Trash2 className="h-4 w-4" /></button>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {group.families.slice(0, 5).map(f => (
                                                            <span key={f} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{f}</span>
                                                        ))}
                                                        {group.families.length > 5 && (
                                                            <span className="text-[10px] text-slate-400 px-1 py-0.5">+{group.families.length - 5} más</span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                            <button onClick={startCreating} className="border-2 border-dashed border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center text-slate-400 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/10 transition-all min-h-[100px]">
                                                <Plus className="h-6 w-6 mb-1" />
                                                <span className="text-xs font-bold">Nuevo Grupo</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TAB: CREATE / EDIT */}
                            {activeTab === "create" && (
                                <div className="p-6 flex-1 flex flex-col overflow-hidden min-h-0">
                                    <div className="mb-4">
                                        <label className="block text-xs font-bold text-slate-700 mb-1.5">Nombre del Grupo</label>
                                        <input
                                            type="text"
                                            value={groupName}
                                            onChange={e => setGroupName(e.target.value)}
                                            placeholder="Ej: Otros, Muebles..."
                                            className="w-full px-3 py-2 text-sm border-slate-200 border rounded-lg focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                                            autoFocus
                                        />
                                    </div>

                                    {/* Smart Selection Tool */}
                                    <div className="mb-4 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Wand2 className="h-4 w-4 text-indigo-600" />
                                            <span className="text-xs font-bold text-indigo-900">Selección Inteligente</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[11px] text-slate-600">Seleccionar familias con</span>

                                            <div className="relative bg-white rounded-md border border-indigo-200 flex items-center">
                                                <select
                                                    value={smartOperator}
                                                    onChange={e => setSmartOperator(e.target.value as "<" | ">")}
                                                    className="appearance-none pl-2 pr-6 py-1 text-xs font-bold text-indigo-700 bg-transparent focus:outline-none border-r border-indigo-100 cursor-pointer"
                                                >
                                                    <option value="<">&lt;</option>
                                                    <option value=">">&gt;</option>
                                                </select>
                                                <div className="absolute right-2 top-1.5 pointer-events-none">
                                                    <div className="w-0 h-0 border-l-[3px] border-l-transparent border-t-[4px] border-t-indigo-400 border-r-[3px] border-r-transparent"></div>
                                                </div>
                                            </div>

                                            <div className="relative w-16">
                                                <input
                                                    type="number"
                                                    value={smartThreshold}
                                                    onChange={e => setSmartThreshold(e.target.value)}
                                                    className="w-full pl-2 pr-4 py-1 text-xs border border-indigo-200 rounded-md focus:outline-none focus:border-indigo-500 text-center font-bold"
                                                    step="0.1"
                                                />
                                                <span className="absolute right-1.5 top-1 text-[10px] text-slate-400">%</span>
                                            </div>
                                            <span className="text-[11px] text-slate-600">de participación</span>
                                            <button
                                                onClick={selectBySmartRule}
                                                className="ml-auto px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-md shadow-sm transition-colors"
                                            >
                                                Auto-Seleccionar
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-xs font-bold text-slate-700">Familias Candidatas</label>
                                        <span className="text-[10px] text-slate-400">{selectedForGroup.length} seleccionadas</span>
                                    </div>

                                    <div className="relative mb-2">
                                        <input
                                            type="text"
                                            placeholder="Buscar familias..."
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white"
                                        />
                                        <Filter className="absolute left-2.5 top-1.5 h-3.5 w-3.5 text-slate-400" />
                                    </div>

                                    <div className="flex-1 border border-slate-200 rounded-xl overflow-hidden bg-white flex flex-col min-h-0">
                                        <div className="overflow-y-auto flex-1 p-1 space-y-0.5 scrollbar-thin">
                                            {candidates.length === 0 && selectedForGroup.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs p-4 text-center">
                                                    <p>No hay familias disponibles que coincidan.</p>
                                                </div>
                                            ) : (
                                                <>
                                                    {/* Selected ALWAYS at top if search is empty or if matched */}
                                                    {selectedForGroup.length > 0 && !searchTerm && (
                                                        <div className="mb-2">
                                                            <div className="text-[10px] font-bold text-indigo-800 bg-indigo-50 px-2 py-1 rounded mb-1">Seleccionadas</div>
                                                            {selectedForGroup.map(fam => (
                                                                <label key={fam} onClick={() => toggleCandidate(fam)} className="flex items-center gap-2 p-2 mx-1 rounded-lg bg-indigo-50/50 hover:bg-indigo-100 cursor-pointer transition-colors border border-indigo-100/50">
                                                                    <div className="flex items-center justify-center w-4 h-4 rounded bg-indigo-600 text-white">
                                                                        <Check className="h-3 w-3" />
                                                                    </div>
                                                                    <span className="text-xs font-medium text-slate-800">{fam}</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {candidates.map(fam => {
                                                        const isSelected = selectedForGroup.includes(fam);
                                                        if (isSelected && !searchTerm) return null; // Already shown above
                                                        return (
                                                            <label key={fam} onClick={() => toggleCandidate(fam)} className={`flex items-center gap-2 p-2 mx-1 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50 border border-indigo-100' : 'hover:bg-slate-50 border border-transparent'}`}>
                                                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'}`}>
                                                                    {isSelected && <Check className="h-3 w-3 text-white" />}
                                                                </div>
                                                                <span className={`text-xs ${isSelected ? 'font-bold text-indigo-700' : 'text-slate-700'}`}>{fam}</span>
                                                            </label>
                                                        );
                                                    })}
                                                </>
                                            )}
                                        </div>
                                        <div className="p-2 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-500 text-center">
                                            Mínimo 2 familias requeridas
                                        </div>
                                    </div>

                                    {groupError && (
                                        <div className="mt-2 text-xs text-red-600 font-bold bg-red-50 p-2 rounded-lg border border-red-100 flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                                            {groupError}
                                        </div>
                                    )}

                                    <div className="mt-4 flex gap-3">
                                        <button onClick={() => setActiveTab("manage")} className="flex-1 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">
                                            Cancelar
                                        </button>
                                        <button onClick={handleSaveGroup} className="flex-[2] py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2">
                                            <Save className="h-4 w-4" />
                                            {editingGroupId ? "Guardar Cambios" : "Crear Grupo"}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


function CustomLegend({ data, allEntities, colors }: { data: (MarketShareRow & { isGroup?: boolean; color?: string })[], allEntities: string[], colors: string[] }) {
    if (!data || data.length === 0) return null;

    return (
        <div className="w-full">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-indigo-200 scrollbar-track-translate hover:scrollbar-thumb-indigo-300">
                {data.map((entry, index) => {
                    const fill = entry.color || colors[allEntities.indexOf(entry.name) % colors.length];
                    return (
                        <div key={index} className="flex items-center gap-3 w-full group hover:bg-slate-50 p-1.5 rounded-lg transition-colors cursor-default min-w-0">
                            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: fill }}></div>
                            <div className="flex flex-col min-w-0 flex-1">
                                <span className={`text-xs truncate w-full ${entry.isGroup ? 'font-bold text-slate-800' : 'text-slate-600 group-hover:text-slate-900'}`} title={entry.name}>
                                    {entry.name}
                                </span>
                                <span className="text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity truncate">
                                    {formatTooltipCLP(entry.value)}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
