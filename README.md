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

   # Secretos JWT
   JWT_SECRET=super_secret_jwt_key_restaurant_auth_2026!
   JWT_ACCESS_SECRET=secret_jwt_access_fmat_restaurant_2026
   JWT_REFRESH_SECRET=secret_jwt_refresh_fmat_restaurant_2026

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
* `GET /auth/setup-status` — Verifica si ya existe un administrador configurado en el sistema.
* `POST /auth/setup-admin` — Registro inicial del Gerente General (solo si no existe uno previamente).
* `POST /auth/login` — Inicio de sesión unificado (correo electrónico para administrador o `StaffID` para personal operativo).
* `POST /auth/change-initial-password` — Cambio obligatorio de contraseña temporal al primer inicio de sesión.
* `GET /auth/me` — Datos de sesión activa, roles y permisos PBAC efectivos del usuario autenticado.
* `POST /auth/refresh` — Renovación de tokens mediante Refresh Token.
* `PATCH /auth/profile` — Modificación de información personal del usuario autenticado.
* `POST /auth/logout` — Cierre de sesión y revocación del refresh token.

### Personal Operativo (`/staff`) *(Requiere rol ADMINISTRADOR)*
* `GET /staff` — Listado de colaboradores, identificadores (`M000001`, `C000001`, etc.), estado y contraseñas provisionales.
* `POST /staff` — Registro de nuevo colaborador, generación automática de Staff ID y clave temporal segura.
* `GET /staff/:id` — Expediente detallado del colaborador por UUID o Staff ID.
* `PATCH /staff/:id` — Actualización de nombres, apellidos, roles o estado activo/inactivo.
* `POST /staff/:id/reset-password` — Restablecimiento seguro de contraseña provisional.
* `DELETE /staff/:id` — Eliminación protegida del colaborador (exclusiva del administrador).

### Roles y Permisos PBAC (`/roles`) *(Requiere rol ADMINISTRADOR)*
* `GET /roles` — Listado de roles del sistema y roles personalizados con sus permisos.
* `GET /roles/catalog` — Catálogo agrupado de permisos por microservicio (Inventario, Cocina/KDS, Pedidos/POS, etc.).
* `POST /roles` — Creación de nuevos roles basados en permisos seleccionados.
* `PATCH /roles/:code` — Modificación de nombre, descripción y permisos de roles personalizados.
