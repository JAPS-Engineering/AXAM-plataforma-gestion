"use client";

import { useState } from "react";
import { Package2, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";

export default function LoginPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        try {
            const res = await api.post("/auth/login", { username, password });
            const data = res.data;

            if (res.status !== 200) {
                setError(data.error || "Error al iniciar sesión");
                return;
            }

            localStorage.setItem("axam_token", data.token);
            window.location.href = "/";
        } catch {
            setError("Error de conexión. Intente nuevamente.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-3xl" />
            </div>

            <div className="relative z-10 w-full max-w-md px-6">
                {/* Logo & Title */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/30 mb-4 backdrop-blur-sm">
                        <Package2 className="h-8 w-8 text-blue-400" />
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2">AXAM</h1>
                    <p className="text-slate-400 text-sm">Plataforma de Gestión de Compras</p>
                </div>

                {/* Login Card */}
                <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl p-8">
                    <div className="flex items-center gap-2 mb-6">
                        <Lock className="h-5 w-5 text-blue-400" />
                        <h2 className="text-lg font-semibold text-white">Iniciar Sesión</h2>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Username */}
                        <div>
                            <label htmlFor="username" className="block text-sm font-medium text-slate-300 mb-1.5">
                                Usuario
                            </label>
                            <input
                                id="username"
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Ingrese su usuario"
                                autoComplete="username"
                                autoFocus
                                required
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                            />
                        </div>

                        {/* Password */}
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1.5">
                                Contraseña
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Ingrese su contraseña"
                                    autoComplete="current-password"
                                    required
                                    className="w-full px-4 py-3 pr-12 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                                    tabIndex={-1}
                                >
                                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                </button>
                            </div>
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm">
                                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                {error}
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={isLoading || !username || !password}
                            className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-600/25 hover:shadow-blue-500/30"
                        >
                            {isLoading ? (
                                <div className="flex items-center justify-center gap-2">
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                    Iniciando sesión...
                                </div>
                            ) : (
                                "Ingresar"
                            )}
                        </button>
                    </form>
                </div>

                {/* Footer */}
                <p className="text-center text-xs text-slate-500 mt-6">
                    © {new Date().getFullYear()} AXAM — Sistema de Gestión
                </p>
            </div>
        </div>
    );
}
