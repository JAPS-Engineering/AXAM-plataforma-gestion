# ================================
# Stage 1: Build React Frontend
# ================================
FROM node:20-slim AS frontend-builder

WORKDIR /app/client

# Copiar archivos de dependencias del cliente
COPY client/package*.json ./
RUN npm ci

# Copiar código fuente del cliente
COPY client/ ./

# Build de Next.js
RUN npm run build

# ================================
# Stage 2: Production Server
# ================================
FROM node:20-slim AS runner

WORKDIR /app

# Instalar OpenSSL para asegurar compatibilidad con Prisma
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Instalar dependencias de producción para servidor
# Instalar dependencias de producción para servidor
COPY package*.json ./
COPY scripts/ ./scripts/

# Instalar dependencias (permitiendo scripts para que better-sqlite3 compile su binario)
# postinstall.js detectará que no hay carpeta client y saltará la instalación del frontend
RUN npm ci --omit=dev

# Copiar el servidor backend
COPY server.js ./
COPY controllers/ ./controllers/
COPY routes/ ./routes/
COPY services/ ./services/
COPY utils/ ./utils/
COPY prisma/ ./prisma/

# Generar cliente Prisma
RUN npx prisma generate

# Copiar build estático de Next.js
COPY --from=frontend-builder /app/client/out ./client/out

# Variables de entorno
ENV NODE_ENV=production
ENV PORT=3000
ENV TZ=America/Santiago

EXPOSE 3000

# Arrancar servidor Express que sirve API + archivos estáticos
CMD ["node", "server.js"]
