"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Database, ExternalLink, CheckCircle2, Loader2, AlertCircle, Sparkles, ArrowRight } from "lucide-react";

interface PendingShipmentsSyncProps {
    onPendientesLoaded: (data: Record<string, number>) => void;
}

export function PendingShipmentsSync({ onPendientesLoaded }: PendingShipmentsSyncProps) {
    const [fetching, setFetching] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const linkRef = useRef<HTMLAnchorElement>(null);

    // Cargar los últimos pendientes guardados en el servidor al iniciar
    useEffect(() => {
        const fetchCurrentPendientes = async () => {
            try {
                const res = await fetch("/api/sync/pendientes-data"); // Necesitamos este endpoint
                const json = await res.json();
                if (json.success && json.data) {
                    onPendientesLoaded(json.data);
                }
            } catch (err) {
                console.error("Error fetching persisted pendientes:", err);
            }
        };
        fetchCurrentPendientes();
    }, [onPendientesLoaded]);

    // Detectar si venimos de una sincronización exitosa (?synced=1)
    useEffect(() => {
        if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            if (params.get("synced") === "1") {
                // Limpiar la URL y refrescar localmente
                const newUrl = window.location.pathname;
                window.history.replaceState({}, document.title, newUrl);
                // Forzar recarga de datos (el useEffect de arriba lo hará)
            }
        }
    }, [onPendientesLoaded]);

    const generateBookmarklet = () => {
        if (typeof window === "undefined") return "#";

        const origin = window.location.origin;
        const targetPath = window.location.pathname;

        const script = `(async function(){
            const query = \`query GetPendingShipments($fromDate: Date, $toDate: Date, $documentType: String!, $offset: Int, $first: Int) {
                getPendingShipments(
                    offset: $offset
                    first: $first
                    fromDate: $fromDate
                    toDate: $toDate
                    documentType: $documentType
                    shipmentStatus: ["Sin movimientos", "Parcial"]
                ) {
                    edges {
                        node {
                            documentNumber
                            billingShipmentDetails {
                                billingShipmentDetail {
                                    productCode
                                    pendingS
                                }
                            }
                        }
                    }
                }
            }\`;
            const end = new Date();
            const start = new Date();
            start.setMonth(start.getMonth() - 3);
            const fromDate = start.toISOString().split('T')[0];
            const toDate = end.toISOString().split('T')[0];

            console.log('AXAM: Iniciando extracción de pendientes...');
            const overlay = document.createElement('div');
            overlay.style = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;font-family:sans-serif;';
            overlay.innerHTML = '<div style="font-size:24px;margin-bottom:20px;">📦 Sincronizando con AXAM...</div><div style="font-size:16px;">Por favor, no cierres esta pestaña</div>';
            document.body.appendChild(overlay);

            try {
                const response = await fetch('https://axam.managermas.cl/graphql/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        query, 
                        variables: { fromDate, toDate, documentType: 'NV', offset: 0, first: 1000 } 
                    })
                });
                
                if (!response.ok) throw new Error('HTTP ' + response.status);
                
                const result = await response.json();
                const edges = result?.data?.getPendingShipments?.edges || [];
                const map = {};
                let totalUnits = 0;

                edges.forEach(edge => {
                    const details = edge.node?.billingShipmentDetails?.billingShipmentDetail || [];
                    details.forEach(item => {
                        if (item.pendingS > 0) {
                            map[item.productCode] = (map[item.productCode] || 0) + item.pendingS;
                            totalUnits += item.pendingS;
                        }
                    });
                });

                const count = Object.keys(map).length;

                console.log('AXAM: Enviando data al dashboard...', map);
                await fetch('${origin}/api/sync/pendientes', {
                    method: 'POST',
                    mode: 'cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ data: map })
                });

                overlay.innerHTML = \`
                    <div style="background:white;padding:30px;border-radius:20px;color:black;text-align:center;box-shadow:0 10px 25px rgba(0,0,0,0.2);max-width:400px;width:90%;">
                        <div style="font-size:50px;margin-bottom:10px;">✅</div>
                        <div style="font-size:20px;font-weight:bold;margin-bottom:10px;color:#10b981;">¡Sincronización Exitosa!</div>
                        <div style="font-size:14px;color:#6b7280;margin-bottom:20px;">
                            Se encontraron <b>\${count}</b> productos con unidades pendientes para un total de <b>\${totalUnits.toLocaleString()}</b> unidades.
                        </div>
                        <button id="returnBtn" style="background:#4f46e5;color:white;border:none;padding:12px 24px;border-radius:10px;font-weight:bold;cursor:pointer;width:100%;transition:background 0.2s;">
                            Volver al Dashboard
                        </button>
                    </div>
                \`;
                document.getElementById('returnBtn').onclick = () => {
                    window.location.href = '${origin}${targetPath}?synced=1';
                };
            } catch (e) {
                overlay.innerHTML = '<div style="background:white;padding:30px;border-radius:20px;color:black;text-align:center;max-width:400px;width:90%;"><div style="font-size:50px;margin-bottom:10px;">❌</div><div style="color:#ef4444;font-size:18px;font-weight:bold;">Error de Sincronización</div><div style="font-size:14px;margin-top:10px;color:#6b7280;">' + e.message + '</div><button onclick="location.reload()" style="margin-top:20px;padding:10px 20px;background:#f3f4f6;border:none;border-radius:8px;cursor:pointer;">Cerrar</button></div>';
                console.error('AXAM Error:', e);
            }
        })()`;

        return `javascript:${encodeURIComponent(script.replace(/\s+/g, ' '))}`;
    };

    const bookmarkletUrl = generateBookmarklet();

    useEffect(() => {
        if (showModal && linkRef.current && bookmarkletUrl !== "#") {
            linkRef.current.href = bookmarkletUrl;
        }
    }, [showModal, bookmarkletUrl]);

    return (
        <>
            <button
                onClick={() => setShowModal(true)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors border text-sm font-medium bg-white text-slate-700 border-slate-200 hover:bg-slate-50`}
            >
                <Database className={`h-4 w-4 ${fetching ? "animate-pulse" : ""}`} />
                Obtener Pendientes (Manager)
            </button>

            {showModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-indigo-500" />
                                Smart Worker Bookmarklet
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 font-medium text-xl">&times;</button>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                                <p className="text-sm text-indigo-700 font-medium">
                                    Este método ejecuta la extracción directamente en tu navegador, permitiendo obtener los pendientes de manera ágil y segura.
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</div>
                                    <p className="text-sm text-slate-600">
                                        Inicia sesión en <b>Manager+</b> en una pestaña nueva.
                                    </p>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</div>
                                    <p className="text-sm text-slate-600">
                                        Arrastra el botón azul a tu barra de marcadores.
                                    </p>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">3</div>
                                    <p className="text-sm text-slate-600">
                                        Estando en Manager+, haz clic en el marcador guardado.
                                    </p>
                                </div>
                            </div>

                            <div className="bg-slate-50 rounded-xl p-6 border border-slate-200 flex flex-col items-center gap-4">
                                <a
                                    ref={linkRef}
                                    className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:scale-105 transition-transform cursor-move flex items-center gap-2"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        alert("¡Arrástrame! No hagas clic aquí.");
                                    }}
                                >
                                    <Sparkles className="h-5 w-5" />
                                    SYNC WORKER
                                </a>
                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Arrastra este botón a tus favoritos</p>
                            </div>

                            <div className="flex items-center gap-4">
                                <a
                                    href="https://axam.managermas.cl/inicio"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                                >
                                    <ExternalLink className="h-4 w-4" />
                                    Abrir Manager+
                                </a>
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 px-4 py-2.5 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
                                >
                                    Listo
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
