"use client";

import { cn } from "@/lib/utils";
import { Package2, ChevronLeft, ChevronRight, LayoutDashboard, AlertTriangle, ShoppingCart, TrendingUp, BarChart3, Target, Users, DollarSign, Percent, FileText, Shield, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";

interface SidebarProps {
    className?: string;
}

export function Sidebar({ className }: SidebarProps) {
    const [collapsed, setCollapsed] = useState(false);
    const pathname = usePathname();
    const { user, logout } = useAuth();

    const navItems = [
        { href: "/", label: "Órdenes de Compra", icon: LayoutDashboard },
        { href: "/compras", label: "Análisis Personalizado", icon: ShoppingCart },
        { href: "/ocs-ocis", label: "OCs y OCIs", icon: FileText },
        { href: "/minimos", label: "Stock Mínimo", icon: AlertTriangle },
        { href: "/ventas", label: "Reporte de Ingresos", icon: TrendingUp },
        { href: "/ventas/graficos", label: "Análisis de Mercado", icon: BarChart3 },
        { href: "/ventas/analisis", label: "Ranking de Productos", icon: TrendingUp },
        { href: "/ventas/objetivos", label: "Objetivos y Vendedores", icon: Target },
        { href: "/ventas/configuracion/vendedores", label: "Gestión de Vendedores", icon: Users },
        { href: "/historial-compras", label: "Historial de Compras", icon: DollarSign },
        { href: "/analisis-margenes", label: "Análisis de Márgenes", icon: Percent },
        { href: "/logistica", label: "Configuración Logística", icon: Package2 },
    ];

    const adminItems = [
        { href: "/usuarios", label: "Gestión de Usuarios", icon: Shield },
    ];

    return (
        <aside
            className={cn(
                "flex flex-col bg-slate-900 text-white transition-all duration-300",
                collapsed ? "w-16" : "w-64",
                className
            )}
        >
            {/* Header */}
            <div className="flex h-16 items-center justify-between px-4 border-b border-slate-700">
                {!collapsed && (
                    <div className="flex items-center gap-2">
                        <Package2 className="h-6 w-6 text-blue-400" />
                        <span className="font-bold text-lg">AXAM</span>
                    </div>
                )}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="p-2 rounded-lg hover:bg-slate-800 transition-colors"
                    aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
                >
                    {collapsed ? (
                        <ChevronRight className="h-5 w-5" />
                    ) : (
                        <ChevronLeft className="h-5 w-5" />
                    )}
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-4 overflow-y-auto">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors",
                                isActive
                                    ? "bg-blue-600/20 text-blue-400 border-r-2 border-blue-400"
                                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                            )}
                        >
                            <Icon className="h-5 w-5 flex-shrink-0" />
                            {!collapsed && <span>{item.label}</span>}
                        </Link>
                    );
                })}

                {/* Separator */}
                <div className="my-3 mx-4 border-t border-slate-700" />

                {/* Admin Section */}
                {adminItems.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors",
                                isActive
                                    ? "bg-blue-600/20 text-blue-400 border-r-2 border-blue-400"
                                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                            )}
                        >
                            <Icon className="h-5 w-5 flex-shrink-0" />
                            {!collapsed && <span>{item.label}</span>}
                        </Link>
                    );
                })}
            </nav>

            {/* Footer */}
            <div className="border-t border-slate-700">
                {/* User info + Logout */}
                <div className="p-3">
                    {!collapsed ? (
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                                <div className="h-8 w-8 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                                    <span className="text-xs font-bold text-blue-400">
                                        {user?.username?.charAt(0).toUpperCase() || "U"}
                                    </span>
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-slate-200 truncate">
                                        {user?.nombre || user?.username || "Usuario"}
                                    </p>
                                    <p className="text-xs text-slate-500 truncate">{user?.username}</p>
                                </div>
                            </div>
                            <button
                                onClick={logout}
                                className="p-2 rounded-lg hover:bg-red-600/20 text-slate-400 hover:text-red-400 transition-colors flex-shrink-0"
                                title="Cerrar sesión"
                            >
                                <LogOut className="h-4 w-4" />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={logout}
                            className="w-full p-2 rounded-lg hover:bg-red-600/20 text-slate-400 hover:text-red-400 transition-colors flex items-center justify-center"
                            title="Cerrar sesión"
                        >
                            <LogOut className="h-5 w-5" />
                        </button>
                    )}
                </div>
            </div>
        </aside>
    );
}
