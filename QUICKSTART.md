# Guía de CI/CD - Auth Backend (Quickstart)

Esta guía describe la arquitectura de Integración y Entrega Continua (CI/CD) implementada para el microservicio **Auth-Backend** (NestJS), basada en el estándar institucional de [`zackspike/cicd-test`](https://github.com/zackspike/cicd-test).

---

## 1. Pasos para Configurar GitHub Actions en el Repositorio

1. **Permisos de GitHub Container Registry (GHCR):**
   - En GitHub, ve a **Settings > Actions > General**.
   - En la sección *Workflow permissions*, selecciona **Read and write permissions**.
   - Guarda los cambios. Esto permite que el workflow publique imágenes de Docker en `ghcr.io/fmat-restaurant/auth-backend`.

2. **Cargar Secretos del Repositorio (Cuando estén disponibles):**
   - Ve a **Settings > Secrets and variables > Actions > New repository secret**.
   - Añade:
     - `SONAR_TOKEN`: Token de SonarCloud para activar el escaneo de Quality Gate.
     - `DISCORD_WEBHOOK`: URL del webhook del canal de Discord de tu equipo para recibir alertas en tiempo real.
   - *Nota:* Si estos secretos aún no están cargados, los pasos correspondientes en el pipeline se omitirán de manera segura sin romper la ejecución de pruebas ni de build.

3. **Branch Protection en `main`:**
   - Ve a **Settings > Branches > Add branch protection rule**.
   - Branch name pattern: `main`.
   - Activa:
     - [x] **Require a pull request before merging**
     - [x] **Require status checks to pass before merging**
     - Selecciona los checks obligatorios:
       - `test (20.x)`
       - `test (22.x)`
     - [x] **Do not allow force pushes**

---

## 2. Comandos de Desarrollo Local

```bash
# Instalar dependencias
npm install

# Compilar proyecto
npm run build

# Ejecutar linter
npm run lint

# Ejecutar pruebas unitarias con cobertura
npm run test:cov

# Levantar en modo desarrollo
npm run start:dev
```
