"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { api } from "@/lib/api";

interface User {
    id: number;
    username: string;
    nombre: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (username: string, password: string) => Promise<void>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth debe usarse dentro de un AuthProvider");
    }
    return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Initialize from localStorage
    useEffect(() => {
        const storedToken = localStorage.getItem("axam_token");
        if (storedToken) {
            setToken(storedToken);
            // Verify token is still valid
            api.get("/auth/me", {
                headers: { Authorization: `Bearer ${storedToken}` }
            })
                .then((res) => {
                    setUser(res.data);
                    setToken(storedToken);
                })
                .catch(() => {
                    // Token invalid
                    localStorage.removeItem("axam_token");
                    setToken(null);
                    setUser(null);
                })
                .finally(() => {
                    setIsLoading(false);
                });
        } else {
            setIsLoading(false);
        }
    }, []);

    // Setup axios interceptor for auto-attaching token
    useEffect(() => {
        const requestInterceptor = api.interceptors.request.use((config) => {
            const currentToken = localStorage.getItem("axam_token");
            if (currentToken) {
                config.headers.Authorization = `Bearer ${currentToken}`;
            }
            return config;
        });

        const responseInterceptor = api.interceptors.response.use(
            (response) => response,
            (error) => {
                if (error.response?.status === 401) {
                    localStorage.removeItem("axam_token");
                    setToken(null);
                    setUser(null);
                    // Redirect to login if not already there
                    if (typeof window !== "undefined" && !window.location.pathname.includes("/login")) {
                        window.location.href = "/login";
                    }
                }
                return Promise.reject(error);
            }
        );

        return () => {
            api.interceptors.request.eject(requestInterceptor);
            api.interceptors.response.eject(responseInterceptor);
        };
    }, []);

    const login = useCallback(async (username: string, password: string) => {
        const { data } = await api.post("/auth/login", { username, password });
        localStorage.setItem("axam_token", data.token);
        setToken(data.token);
        setUser(data.user);
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem("axam_token");
        setToken(null);
        setUser(null);
        if (typeof window !== "undefined") {
            window.location.href = "/login";
        }
    }, []);

    return (
        <AuthContext.Provider
            value={{
                user,
                token,
                isAuthenticated: !!token && !!user,
                isLoading,
                login,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
