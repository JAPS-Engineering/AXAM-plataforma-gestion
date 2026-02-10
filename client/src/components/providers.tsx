"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect, type ReactNode } from "react";
import { AuthProvider, useAuth } from "@/components/auth-provider";

function AuthGuard({ children }: { children: ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth();
    const [isLoginPage, setIsLoginPage] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        setIsLoginPage(window.location.pathname === "/login" || window.location.pathname === "/login/");
    }, []);

    useEffect(() => {
        if (!isLoading && !isAuthenticated && mounted && !isLoginPage) {
            window.location.href = "/login";
        }
    }, [isAuthenticated, isLoading, mounted, isLoginPage]);

    // Login page: always render
    if (isLoginPage || !mounted) {
        return <>{children}</>;
    }

    // Loading auth state
    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-100">
                <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    <p className="text-slate-500 text-sm">Verificando sesión...</p>
                </div>
            </div>
        );
    }

    // Not authenticated: show nothing while redirecting
    if (!isAuthenticated) {
        return null;
    }

    return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 60 * 1000, // 1 minuto
                        refetchOnWindowFocus: false,
                    },
                },
            })
    );

    return (
        <AuthProvider>
            <QueryClientProvider client={queryClient}>
                <AuthGuard>{children}</AuthGuard>
            </QueryClientProvider>
        </AuthProvider>
    );
}
