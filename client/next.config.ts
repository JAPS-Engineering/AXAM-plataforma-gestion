import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig = (phase: string): NextConfig => {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return {
      // En desarrollo, proxear las llamadas /api al backend Express
      async rewrites() {
        return [
          {
            source: "/api/:path*",
            destination: "http://localhost:3000/api/:path*",
          },
        ];
      },
    };
  }

  return {
    // Configuración para producción (static export)
    output: "export",
    // Desactivar optimización de imágenes (incompatible con export)
    images: {
      unoptimized: true,
    },
  };
};

export default nextConfig;
