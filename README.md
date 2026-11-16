# Microservicio de Autenticación y Control de Personal (Auth-Backend)

API REST centralizada para la autenticación, autorización basada en permisos (PBAC), gestión de colaboradores y auditoría del sistema **FMAT Restaurant**.

---

## 🛠️ Tecnologías y Stack

* **Framework:** [NestJS](https://nestjs.com/) (Node.js 20+)
* **Lenguaje:** TypeScript
* **ORM:** TypeORM
* **Base de Datos:** PostgreSQL (compatible con PostgreSQL local o Neon en la nube)
* **Seguridad:** JWT (Access Tokens y Refresh Tokens con rotación segura), bcrypt para hash de contraseñas
* **Eventos:** RabbitMQ (publicación de eventos de dominio: `staff.created`, `staff.updated`, etc.)
* **Contenedores:** Docker & Docker Compose (Multi-stage build)
* **Pruebas y Calidad:** Jest (60 pruebas unitarias y de integración) y ESLint

---

## 🚀 Inicio Rápido

### Opción 1: Con Docker (Recomendado para otros equipos)

Este microservicio es completamente autónomo y cuenta con su propio `docker-compose.yml`. Cualquier desarrollador de otro equipo solo necesita clonar este repositorio y ejecutar:

```bash
docker compose up --build
```

Esto levantará automáticamente el microservicio y su base de datos PostgreSQL aislada (en el puerto `5433` para no colisionar con otros microservicios). La API estará lista en `http://localhost:4000/api/v1` sin necesidad de instalar Node.js ni configurar bases de datos.

> **Uso directo sin compilar (Imagen GHCR):**
> También pueden consumir la imagen Docker ya compilada que publica automáticamente nuestro pipeline:
> ```yaml
> auth-backend:
>   image: ghcr.io/fmat-restaurant/auth-backend:latest
>   ports:
>     - "4000:3000"
> ```

---

### Opción 2: Desarrollo Local (sin Docker)

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Configurar variables de entorno:**
   Copia el archivo `.env.example` como `.env`:
   ```bash
   cp .env.example .env
   ```

   Variables principales:
   ```env
   PORT=4000
   NODE_ENV=development

   # Base de datos
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fmat_auth

   # Secreto JWT (obligatorio, mínimo 32 caracteres, el mismo que usa el API Gateway).
   # Genera uno con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   JWT_SECRET=

   # RabbitMQ (opcional en desarrollo offline)
   RABBITMQ_URL=amqp://localhost:5672
   ```

3. **Iniciar en modo desarrollo:**
   ```bash
   npm run start:dev
   ```

4. **Ejecutar pruebas automatizadas:**
   ```bash
   npm test
   ```

5. **Verificar linter y compilación:**
   ```bash
   npm run lint
   npm run build
   ```

---

## 📡 Endpoints Principales (`/api/v1`)

### Autenticación (`/auth`)
* `GET /auth/setup-status` — Indica si el sistema ya está configurado (si existe cualquier usuario).
* `POST /auth/setup-admin` — Registro inicial del Gerente General (solo con la base vacía).
* `POST /auth/login` — Inicio de sesión unificado (correo electrónico para administrador o `StaffID` para personal operativo).
* `POST /auth/change-initial-password` — Cambio obligatorio de contraseña temporal al primer inicio de sesión.
* `GET /auth/me` — Datos de sesión activa, roles y permisos PBAC efectivos del usuario autenticado.
* `POST /auth/refresh` — Renovación de tokens mediante Refresh Token.
* `PATCH /auth/profile` — Modificación de información personal del usuario autenticado.
* `POST /auth/request-password-reset` — Solicitud al Administrador para que asigne una contraseña temporal nueva (no es un reseteo automático).
* `POST /auth/logout` — Cierre de sesión: revoca el refresh token y los access tokens vigentes.

### Personal Operativo (`/staff`) *(Requiere rol ADMINISTRADOR)*
* `GET /staff` — Listado de colaboradores, identificadores (`M000001`, `C000001`, etc.) y estado. `?passwordResetRequested=true` muestra solo las solicitudes de reseteo pendientes.
* `POST /staff` — Registro de nuevo colaborador, generación automática de Staff ID y clave temporal segura (se muestra solo en esta respuesta).
* `GET /staff/:id` — Expediente detallado del colaborador por UUID o Staff ID.
* `PATCH /staff/:id` — Actualización de nombres, apellidos, roles o estado activo/inactivo.
* `POST /staff/:id/reset-password` — Asigna una contraseña temporal nueva (se muestra solo en esta respuesta) y registra en la auditoría qué administrador lo hizo.
* `DELETE /staff/:id` — Eliminación protegida del colaborador (exclusiva del administrador).

### Roles y Permisos PBAC (`/roles`) *(Requiere rol ADMINISTRADOR)*
* `GET /roles` — Listado de roles del sistema y roles personalizados con sus permisos.
* `GET /roles/catalog` — Catálogo agrupado de permisos por microservicio (Inventario, Cocina/KDS, Pedidos/POS, etc.).
* `POST /roles` — Creación de nuevos roles basados en permisos seleccionados.
* `PATCH /roles/:code` — Modificación de nombre, descripción y permisos de roles personalizados.

---

## 🔐 Notas de seguridad y operación

### Esquema de la base de datos
* **Desarrollo** (`NODE_ENV` distinto de `production`): TypeORM sincroniza las tablas con las entidades automáticamente.
* **Producción** (`NODE_ENV=production`, como en `docker-compose.yml`): no se sincroniza; al arrancar se aplican las migraciones de `src/database/migrations`.
* Si cambias una entidad, agrega una migración nueva en esa carpeta y regístrala en `src/database/migrations/index.ts`.

### Restablecimiento de contraseña
1. El colaborador usa "¿Olvidaste tu contraseña?" (`POST /auth/request-password-reset`).
2. Su cuenta queda marcada con `passwordResetRequested` y aparece en el panel de personal.
3. El Administrador asigna una contraseña temporal (`POST /staff/:id/reset-password`) y se la entrega en persona.
4. El colaborador entra con ella y está obligado a cambiarla.

### Variables de seguridad
| Variable | Uso |
| --- | --- |
| `JWT_SECRET` | Obligatoria, mínimo 32 caracteres, igual a la del API Gateway. |
| `CORS_ORIGINS` | Orígenes permitidos. En producción solo valen los de esta lista. |
| `AUTH_RATE_LIMIT` | Intentos por minuto e IP en login y recuperación de contraseña. |
| `AUTH_IDENTIFIER_RATE_LIMIT` / `AUTH_IDENTIFIER_WINDOW_MINUTES` | Intentos por cuenta y duración del bloqueo. |
| `TRUST_PROXY` | Proxies de confianza para `X-Forwarded-For` (por defecto, solo el proxy privado inmediato). |
| `RABBITMQ_URL` | Broker de eventos. Sin conexión, `/health` responde `degraded`. |
| `REFRESH_TOKEN_TTL_DAYS` | Días que dura un refresh token sin usarse (1 a 30, por defecto 7). Cada renovación emite uno nuevo y revoca el anterior. |
