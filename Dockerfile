# 1. Etapa de compilación (Build stage)
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar manifiestos de dependencias
COPY package*.json ./

# Instalar todas las dependencias (incluyendo devDependencies para compilar)
RUN npm ci

# Copiar código fuente y configuración de compilación
COPY tsconfig*.json nest-cli.json ./
COPY src/ ./src/

# Compilar la aplicación NestJS
RUN npm run build

# -------------------------------------------------------------
# 2. Etapa de ejecución (Production stage)
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Copiar manifiestos e instalar solo dependencias de producción
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copiar archivos compilados desde la etapa builder
COPY --from=builder /app/dist ./dist

# Puerto expuesto por el microservicio
EXPOSE 4000

# Comando de inicio del microservicio
CMD ["node", "dist/main.js"]
