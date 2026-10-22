# Sala de control de Alphataco en TaskApp

Propuesta para decidir · 2026-10-22 · solo análisis (no se tocó código, base de datos ni despliegues).

**Base de la evidencia:**

- Alphataco: `origin/main` = `ad81b21f` (#73). El worktree está en `refactor/calidad-codigo` (`b8ae9d8b`, 117 commits por delante y 0 por detrás). Los archivos citados se compararon contra `origin/main`. Los que cambian entre las dos ramas se citan con la línea de `origin/main`.
- TaskApp: `taskApp-backend` en `main` (`c024073`) y `taskApp-frontend` en `main` (`27436ce`).
- VPS `31.97.42.82`: se hicieron solo lecturas por SSH y llamadas GET a la API de Dokploy, sin imprimir secretos.

Convención: **[verificado]** quiere decir leído en el código o medido; **[supuesto]** es criterio o inferencia sin comprobar.

---

## 1. Resumen y recomendación

1. **Hoy no hay forma de apagar un módulo por empresa, pero sí hay un interruptor por instancia a medio camino, y conviene construir sobre él.** [verificado]
   - `modules.is_active` y `tabs.is_active` ya existen (`prisma/schema.prisma:1885-1897` y `:2653-2672`).
   - Toda la cadena de permisos los filtra: `get_user_permissions` exige `m.is_active` y `t.is_active` (`prisma/sql/permissions.sql:104-105` y `:131-132`). De esa función dependen:
     - el sidebar;
     - las pestañas;
     - `checkPermissionServer`;
     - la API móvil;
     - los destinatarios de notificaciones;
     - las políticas RLS por permiso (`app_has_permission`);
     - el editor de permisos.
   - Poner `is_active = false` en un módulo **ya lo oculta y le niega todos los permisos a todos los usuarios**.
   - Ni el seed ni el reset de la demo pisan ese campo.
   - Lo que **no** corta: jobs, API externa, rutas públicas (QR de mantenimiento, `/operator`, `/clothing`), server actions sin guarda, dashboards que leen datos de otros módulos y `/capabilities`.
   - Propuesta: guardar el estado de cada clave funcional en una tabla nueva, `instance_modules` (vacía quiere decir todo encendido), y proyectarlo sobre `is_active` en la misma transacción (§3.2). A eso se suma `requireModule` en las entradas que `is_active` no cubre (§5.2).
2. **«Instancia» = un cliente = un repo + una VPS + una base** (`PROPUESTA-ACEPTADA.md:9,24`). Dentro de cada instancia puede haber varias empresas (multiempresa con RLS por `company_id`). El módulo se vende por cliente, así que **se activa por instancia**. El nivel por empresa queda como fase opcional, y es barato en SQL porque `get_user_permissions` ya recibe `p_company_id`.
3. **Orden recomendado:**
   - **F1:** en TaskApp, el registro de instancias, los chequeos HTTP (`/api/health` y `/capabilities`) y las alertas por campanita y Telegram. No toca Alphataco.
   - **F2:** recursos de la VPS (CPU, RAM y disco) con un agente de empuje casi sin consumo, el aviso de que la VPS dejó de reportar y, en Alphataco, `GET /api/admin/v1/status` de solo lectura (jobs con error, sha, migraciones).
   - **F3:** control de módulos (catálogo con dependencias, guarda central `requireModule`, endpoints de escritura y panel en TaskApp).
   - **F4 (opcional):** RLS restrictiva por módulo y overrides por empresa.
4. **Monitoreo:** sin Prometheus ni Grafana. La VPS tiene **2 vCPU y 7,9 GB de RAM, con 5,2 GB usados y unos 2,7 GB disponibles**, y corre 70 contenedores [verificado, `free -m` y `docker.getServerHealth`]. Un planificador en Go dentro del backend de TaskApp, más un script con `systemd` en la VPS, cuesta casi 0 MB extra.
5. **Punto ciego que hay que aceptar o cubrir:** TaskApp corre **en la misma VPS** que la demo (`taskapp-backend-*` y `alphataco-app-*` en `docker ps`) [verificado]. Si esa VPS cae, nadie avisa. Se propone un latido hacia un vigilante externo (ver §2.5).

---

## 2. Arquitectura

### 2.1 Diagrama

```
                   ┌──────────────────────── TaskApp (VPS 31.97.42.82) ─────────────────────────┐
 Yordan / Fabricio │ Frontend (Vite+React 19)          Backend Go (chi)                         │
 ───────────────►  │  /alphataco  (vista nueva) ──────► /api/alphataco/*  (Auth + allowlist)    │
                   │   ├ Instancias y servicios         ├ handler / service / repository        │
                   │   ├ Incidentes                     ├ AlphatacoMonitor (goroutine, ticker)  │
                   │   └ Módulos (F3)                   ├ IncidentEngine → NotificationService  │
                   │                                    │      (campanita + SSE + Telegram)     │
                   │                                    └ Postgres TaskApp: alphataco_* (066+)  │
                   └─────────▲──────────────────────────┬──────────────┬────────────────────────┘
                             │ push métricas (F2)       │ HTTP pull    │ HTTP admin (F2/F3)
                             │ Bearer token por host    │ sin token    │ Bearer por instancia
                   ┌─────────┴────────┐      ┌──────────▼───┐   ┌──────▼─────────────────────────┐
                   │ agente en la VPS │      │ /api/health  │   │ Alphataco /api/admin/v1/*      │
                   │ systemd timer    │      │ /api/mobile/ │   │  status (lectura)              │
                   │ df, meminfo,     │      │ v1/capab.    │   │  modules GET / PUT (escritura) │
                   │ loadavg, docker  │      └──────────────┘   │  → proyección en is_active     │
                   └──────────────────┘                         │  → instance_modules + log      │
                                                                └────────────────────────────────┘
   (opcional) vigilante externo (otra VPS o un servicio gratuito) → pinga TaskApp /health y el latido
```

### 2.2 TaskApp: qué hay hoy [verificado] y qué se agrega

| Tema                                   | Hoy                                                                                                                                                                                                                                                   | Para la sala de control                                                                                                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack                                  | Backend Go 1.25 + chi + `database/sql`/pgx (`go.mod`). Frontend Vite 8 + React 19 + react-router 7 + TanStack Query + zustand + Tailwind 4 (`package.json`)                                                                                           | Lo mismo, sin dependencias nuevas (para cifrar alcanzan `crypto/aes` y `crypto/cipher` de la biblioteca estándar)                                               |
| Migraciones                            | SQL numerados en `db/migrations/`, aplicados en orden al arrancar (`db/postgres.go:26-50`, tabla `schema_migrations`). El último es `065_create_booking_pages.sql`                                                                                    | `066_alphataco_core.sql` en adelante                                                                                                                            |
| Auth                                   | JWT Bearer (`internal/middleware/auth.go:15-40`); el token vive en zustand con `persist` (`src/stores/auth-store.ts`)                                                                                                                                 | Sin cambios                                                                                                                                                     |
| Roles                                  | Solo `admin`, `agent` y `auditor` (`db/migrations/035_approver_arrays_and_auditor.sql:16`). `RequireRole` y `ReadOnlyForRole` (`internal/middleware/role.go`)                                                                                         | **Ningún rol significa "solo Yordan y Fabricio".** Se propone una lista de IDs permitidos (ver §2.4)                                                            |
| Sidebar                                | `src/components/app-sidebar.tsx`. El grupo Admin aparece con `isAdmin && (...)` (`:856`)                                                                                                                                                              | Un ítem «Alphataco» visible si `me.capabilities.alphataco_console`                                                                                              |
| Rutas                                  | `src/App.tsx`. **Las rutas `/admin/*` no tienen guarda en el frontend** (`:134-141`): solo las oculta el sidebar y las protege el backend (`main.go:580-582`)                                                                                         | Una ruta nueva `/alphataco/*` con guarda propia (`AlphatacoConsoleRoute`, siguiendo el patrón de `AuditorBlockedRoute` en `src/components/protected-route.tsx`) |
| Jobs                                   | `MeetingReminderScheduler`: goroutine con ticker de 1 min, `recover` y claim (`internal/service/meeting_reminder.go:43-86`, arranca en `main.go:667`)                                                                                                 | `AlphatacoMonitor` con el mismo patrón                                                                                                                          |
| Avisos                                 | `NotificationService.Notify` escribe en la campanita, el SSE y Telegram (`internal/service/notification.go:60-72`, `main.go:174`). El bot de Telegram es único y cada usuario lo vincula (`045_create_telegram.sql`). El email sale de `EmailService` | Se reusa tal cual. No hace falta canal nuevo                                                                                                                    |
| Secretos                               | **No hay cifrado en ningún lado.** `project_credentials.password` va en claro, y es una decisión documentada (`063_project_environments.sql:21-24`). El token del bot de Telegram está en `app_settings` (JSONB)                                      | Tokens de instancia cifrados con AES-256-GCM y la clave en una variable de entorno (ver §2.4)                                                                   |
| Integración ya existente con Alphataco | Alphataco consume `GET /api/public/v1/events` de TaskApp con `X-Project-Key` (`alphataco-arq/src/app/api/taskapp/events/route.ts`)                                                                                                                    | Es el sentido contrario: ahora TaskApp llama a Alphataco                                                                                                        |

**Módulo nuevo en el backend** (mismo estilo que el resto: un archivo por capa):

- `internal/model/alphataco.go`
- `internal/repository/alphataco.go`
- `internal/service/alphataco_monitor.go` (planificador)
- `internal/service/alphataco_incidents.go`
- `internal/service/alphataco_client.go` (HTTP hacia Alphataco)
- `internal/service/secretbox.go` (AES-GCM)
- `internal/handler/alphataco.go`
- `internal/middleware/console.go` (lista de permitidos)

**Rutas propuestas en TaskApp:**

| Método y ruta                                                | Uso                                                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `GET/POST/PUT/DELETE /api/alphataco/instances`               | Registro de instancias. Los tokens se pueden escribir pero nunca se devuelven                                |
| `GET /api/alphataco/instances/{id}/services`                 | Servicios con su estado actual                                                                               |
| `GET /api/alphataco/incidents?open=1`                        | Incidentes                                                                                                   |
| `POST /api/alphataco/incidents/{id}/ack`                     | Marcar un incidente como visto                                                                               |
| `POST /api/alphataco/instances/{id}/mute`                    | Silencio temporal                                                                                            |
| `POST /api/alphataco/agent/metrics`                          | Ingreso del agente. **Va fuera del `Auth` de usuario**, con token por host y `RateLimitByIP` (que ya existe) |
| `GET/PUT /api/alphataco/instances/{id}/modules[/{key}]` (F3) | Proxy auditado hacia Alphataco                                                                               |

**Vista frontend** `src/pages/alphataco/` con tres pestañas: «Instancias» (tarjeta por instancia con un semáforo por servicio, sha, última verificación y uso de la VPS), «Incidentes» y «Módulos» (F3). Datos con TanStack Query (`refetchInterval` de 30 s), o mejor empujados por el SSE que ya existe (`internal/realtime/hub.go`).

### 2.3 Alphataco: piezas nuevas

| Pieza                                                                                      | Dónde                                                                                                                                                                                                                                                                                                                                                        | Fase |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `GET /api/admin/v1/status`                                                                 | `src/app/api/admin/v1/status/route.ts`. Lee `jobs_runs` (corridas y errores de las últimas 24 h; la tabla ya existe, `src/features/Jobs/lib/runs.ts`), el `sha`, `SELECT 1` con latencia, el storage (reusa `checkStorage` de `src/app/api/health/route.ts`), la última migración (`_prisma_migrations`), la cantidad de empresas y el estado de los módulos | F2   |
| Catálogo de módulos funcionales                                                            | `src/modules/catalog.ts`. Es el manifiesto `module.ts` que ya prevé `PROPUESTA-ACEPTADA.md:184`, con `requires` y `softDeps`                                                                                                                                                                                                                                 | F3   |
| `requireModule(key)` e `isModuleEnabled(key)`                                              | `src/shared/lib/modules.server.ts`. Con `cache()` de React por request y lectura fresca en los jobs                                                                                                                                                                                                                                                          | F3   |
| `GET /api/admin/v1/modules` y `PUT /api/admin/v1/modules/{key}`                            | Usan `prismaSystem`, transacción, validación de dependencias, `?dryRun=1` y auditoría                                                                                                                                                                                                                                                                        | F3   |
| Tablas `instance_modules` (estado por clave, vacía = todo encendido) y `module_change_log` | Migración aditiva (§3.2)                                                                                                                                                                                                                                                                                                                                     | F3   |

**Excepción a la regla «Server Actions, no API routes»:** `CLAUDE.md` y `.claude/rules/server-actions.md` del repo piden Server Actions. Estos endpoints son de máquina a máquina, igual que `/api/health`, `/api/jobs/*` y `/api/external/v1/*`, que ya son excepciones aceptadas. Hay que documentarlo en el código como se hizo en `src/app/api/taskapp/events/route.ts`.

**Autenticación entre sistemas:**

- Dos tokens por instancia, **distintos de `JOBS_TOKEN`**:
  - `ADMIN_STATUS_TOKEN`, de lectura (F2);
  - `ADMIN_MODULES_TOKEN`, de escritura (F3).
- Se comparan con el patrón de `src/features/Jobs/lib/auth.ts`: SHA-256 más `timingSafeEqual`, y sin token configurado no entra nadie.
- `/api/admin/*` no pasa por el proxy de sesión, porque el `matcher` es solo `/dashboard/:path*` (`src/proxy.ts:73`) [verificado]. Por eso no hay riesgo de que la cookie lo abra y la autenticación depende solo del token.
- Endurecimiento opcional: lista de IPs permitidas en Traefik o Caddy (TaskApp sale siempre desde `31.97.42.82`, mientras siga ahí) y limitación de frecuencia.
- El `PUT` exige el encabezado `X-Actor-Email` (el usuario de TaskApp) y un `reason`. Las dos cosas quedan en `module_change_log`.

### 2.4 Seguridad en TaskApp

- **Quién ve la vista:**
  - Variable `ALPHATACO_CONSOLE_USER_IDS` (por ejemplo `"3,7"`), revisada en el backend por un middleware `RequireConsole`.
  - `/api/auth/me` (`main.go:283`) suma `capabilities.alphataco_console`. El frontend solo lo usa para mostrar el ítem; la protección real es el backend.
  - Mejor IDs que emails: un admin puede editar usuarios desde `/admin/users`, y una lista de emails se podría saltar cambiando el email de una cuenta [supuesto: no se verificó si el endpoint permite cambiar el email].
- **Tokens de instancia:**
  - AES-256-GCM con la clave en `ALPHATACO_SECRETS_KEY`, guardados en columnas `bytea`.
  - Alphataco ya tiene el mismo patrón con versión de clave en `src/shared/lib/arca/secrets.ts:9-18`.
  - La API solo devuelve `has_status_token: true`.
- **API de Dokploy:** su key es **de administrador total**. Puede desplegar, borrar y leer el `env` descifrado de todas las apps (`~/.claude/docs/dokploy.md:15,65`). **No se recomienda guardarla en TaskApp.** Si se usa (ver §2.5), que sea por variable de entorno, solo para GET en una lista blanca de endpoints, y nunca en la base.
- **Auditoría:** `alphataco_module_changes` en TaskApp (quién pidió, qué respondió Alphataco) y `module_change_log` en Alphataco (qué se aplicó). Que la auditoría esté en los dos lados permite detectar un cambio hecho por fuera del panel.

### 2.5 Monitoreo: fuentes y alternativas

**Qué se puede obtener hoy [verificado en la VPS]:**

| Fuente                                                                                                                                                        | Qué da                                                                                                                                                                                                                 | Limitaciones                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET {app}/api/health`                                                                                                                                        | `{status, sha, storage}`. Responde **503 si la base no responde** y 200 con `storage:"error"` si falla solo el storage (`src/app/api/health/route.ts:66-77`)                                                           | Mide app, base y storage _desde la app_, que es lo que importa                                                                                                                                                                                                                                                                                                                                                                |
| `GET {app}/api/mobile/v1/capabilities`                                                                                                                        | 200 con `apiVersion`, `serverSha` y `modules` (`src/app/api/mobile/v1/capabilities/route.ts`). Sirve como liveness de `alphataco-api` (enrutado por path `/api/mobile` en el mismo dominio, según `LOOP-ESTADO.md:86`) | `modules` es una constante (`MobileApi/lib/config.ts:12`), no el estado real. **Un 200 no prueba que respondió el contenedor `api`:** `alphataco-app` y `app-input-wireless-hard-drive-feyykf` corren la misma imagen (`alphataco:main` en `docker service ls`) y las dos tienen la ruta. La liveness real del `api` sale del chequeo de réplicas de F2, o de un campo nuevo en `capabilities` que diga qué proceso respondió |
| Dokploy `docker.getServerHealth`                                                                                                                              | Memoria total y usada, disco total y usado, `cpuCount`, cantidad de contenedores y servicios                                                                                                                           | **No trae CPU en uso.** Exige la key de admin                                                                                                                                                                                                                                                                                                                                                                                 |
| Dokploy `docker.getContainersByAppNameMatch`, `swarm.getContainerStats`, `application.readAppMonitoring`, `server.getServerMetrics`, `server.setupMonitoring` | Existen en la API v0.30.8 (por `settings.getOpenApiDocument`)                                                                                                                                                          | **El monitoreo propio de Dokploy no está activado** (`user.getMetricsToken` devuelve `enabledFeatures:false`, umbrales en 0). Su comportamiento y su `urlCallback` no se probaron                                                                                                                                                                                                                                             |
| Dokploy `applicationStatus`                                                                                                                                   | Devuelve `done`                                                                                                                                                                                                        | **Es el resultado del último deploy, no si el servicio está vivo.** No sirve como señal de caída                                                                                                                                                                                                                                                                                                                              |

**Gotcha verificado:** el `appName` de Dokploy es inmutable y autogenerado. `alphataco-api` corre como servicio `app-input-wireless-hard-drive-feyykf`, y `alphataco-storage` como compose `compose-compress-wireless-transmitter-amgfd1`. **El registro debe guardar `appName` y el ID de Dokploy, no el nombre que muestra el panel.**

**Comparación de alternativas para CPU, RAM, disco y caídas** (los consumos de RAM son de memoria y documentación pública, no medidos acá):

| Opción                                                                                                                                                                                                                 | RAM aprox.                            | Esfuerzo | Encaje con el panel en TaskApp                                                                                                                                                                                    | Veredicto                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **A. Agente propio de empuje** (bash + `systemd` timer cada minuto: `/proc/loadavg`, `/proc/meminfo`, `df`, `docker ps --filter health=unhealthy`, réplicas `docker service ls`) → `POST /api/alphataco/agent/metrics` | ~0 (un proceso efímero por minuto)    | S        | Total: los datos caen en las tablas de TaskApp. **Además funciona como latido**: si la VPS deja de reportar, hay alerta. Sirve igual para cada VPS de cliente futura sin darle a TaskApp ninguna llave de esa VPS | **Recomendada**                                                |
| B. API de Dokploy desde TaskApp                                                                                                                                                                                        | 0 en la VPS                           | S        | Bueno para réplicas por `appName`. Sin CPU en uso                                                                                                                                                                 | Complemento opcional. Riesgo por la key de administrador total |
| C. Monitoreo nativo de Dokploy (`setupMonitoring`)                                                                                                                                                                     | Un contenedor más [supuesto: liviano] | S        | Tiene umbrales y `urlCallback` → podría avisar a TaskApp                                                                                                                                                          | Probar en F2; si anda, reemplaza parte de A                    |
| D. Uptime Kuma                                                                                                                                                                                                         | ~100-150 MB                           | S        | Interfaz aparte; chequeos HTTP, TCP y Docker, y Telegram incluido. No controla módulos                                                                                                                            | Solo si no se quiere código propio                             |
| E. Beszel (hub + agente)                                                                                                                                                                                               | ~20-50 MB                             | S        | Interfaz aparte, buena para métricas de Docker                                                                                                                                                                    | Mismo problema que D: otra pantalla                            |
| F. Prometheus + Grafana + node_exporter + cAdvisor                                                                                                                                                                     | 0,5-1 GB+                             | L        | Malo                                                                                                                                                                                                              | **Descartada** para 2 vCPU y ~2,7 GB libres                    |

**Vigilante externo:** el patrón de `vps-monitor` en `vps-yordan` (servicio `systemd` sin IA, con frenos de cooldown) es exactamente lo que falta para vigilar al vigilante.

- Propuesta (no se toca nada sin aprobación): un chequeo externo de `https://<taskapp>/health` (`main.go:265`) y de `/api/health` de la demo, desde otra máquina (esa VPS) o desde un servicio gratuito tipo healthchecks.io o UptimeRobot.
- Así, si cae `31.97.42.82`, alguien se entera.

### 2.6 Modelo de alertas

| Chequeo              | Falla si                                                                                                                                                        | Umbral para abrir             | Cierre (histéresis) | Severidad                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------- | ------------------------------------- |
| App `/api/health`    | timeout de 5 s, HTTP ≠ 200 o `status ≠ ok`                                                                                                                      | 3 fallas seguidas (cada 60 s) | 2 OK seguidos       | crítica                               |
| Base                 | `/api/health` devuelve 503 `db_unavailable`                                                                                                                     | 2 seguidas                    | 2 OK                | crítica                               |
| Storage              | `storage:"error"`                                                                                                                                               | 3 seguidas                    | 2 OK                | alta                                  |
| API móvil            | `/capabilities` ≠ 200                                                                                                                                           | 3 seguidas                    | 2 OK                | alta (si la instancia tiene `mobile`) |
| App y API desparejas | `serverSha` de `/capabilities` ≠ `sha` de `/api/health` durante más de 15 min. Se despliegan juntas (`PROPUESTA-ACEPTADA.md:132`): si difieren, una quedó atrás | 1                             | al coincidir        | media                                 |
| Deploy detectado     | cambia el `sha` de `/api/health`                                                                                                                                | — (solo evento)               | —                   | info; dispara el silencio automático  |
| Disco                | uso > 85 %                                                                                                                                                      | 2 muestras                    | < 80 %              | alta (> 92 % crítica)                 |
| RAM                  | disponible < 10 %                                                                                                                                               | 5 muestras seguidas           | > 15 %              | alta                                  |
| CPU                  | `load1 / cpuCount` > 1,5                                                                                                                                        | 10 muestras                   | < 1,0               | media                                 |
| Contenedor           | réplicas 0/1 o `unhealthy` en un servicio registrado                                                                                                            | 2 muestras                    | 2 OK                | crítica                               |
| Latido               | sin métricas del agente en 5 min                                                                                                                                | —                             | al volver           | crítica                               |
| Jobs (F2)            | `jobs_runs.status='error'` de las últimas 24 h, o un job sin correr dentro de su ventana                                                                        | 1                             | al correr OK        | media                                 |

**Reglas para no hacer ruido:**

- **Un incidente abierto por (servicio, tipo):** índice único parcial `WHERE resolved_at IS NULL`. Las fallas siguientes solo actualizan `last_seen_at`.
- Aviso al abrir y al cerrar. Si sigue abierto, recordatorio cada 6 h, y nunca más de uno por hora por instancia.
- **Silencio** por instancia (`muted_until`):
  - manual;
  - automático por 10 min cuando cambia el `sha` (deploy);
  - en la ventana del reset diario de la demo [supuesto: hay que confirmar la hora del reset].
- Las fallas de los chequeos de TaskApp (DNS o timeout propio) no se cuentan si fallan **todas** las instancias a la vez: se abre un único incidente «el monitor no tiene red».

**Destinatarios:** la misma lista `ALPHATACO_CONSOLE_USER_IDS`, por `Notify` (campanita, SSE y Telegram, si cada uno vinculó su Telegram). El email solo para los críticos [decisión abierta].

---

## 3. Modelo de datos

### 3.1 TaskApp (migraciones `066_*` en adelante; todas nuevas)

```sql
-- 066_alphataco_core.sql
alphataco_hosts (
  id BIGSERIAL PK, name TEXT, ip TEXT, provider TEXT,
  agent_token_hash BYTEA NOT NULL,           -- SHA-256; el token se muestra una sola vez
  cpu_count INT, last_seen_at TIMESTAMPTZ, muted_until TIMESTAMPTZ,
  created_at, updated_at)

alphataco_instances (
  id BIGSERIAL PK, slug TEXT UNIQUE, name TEXT, client_name TEXT,
  environment TEXT CHECK (environment IN ('demo','prod','staging')),
  host_id BIGINT REFERENCES alphataco_hosts,
  app_url TEXT NOT NULL, api_url TEXT,           -- api_url NULL = sin app móvil
  dokploy_project_id TEXT, dokploy_environment_id TEXT,
  expected_sha TEXT, base_version TEXT,
  status_token_enc BYTEA, modules_token_enc BYTEA, token_key_version SMALLINT,
  monitoring_enabled BOOLEAN DEFAULT TRUE, muted_until TIMESTAMPTZ, notes TEXT,
  created_at, updated_at)

alphataco_services (
  id BIGSERIAL PK, instance_id BIGINT REFERENCES alphataco_instances ON DELETE CASCADE,
  kind TEXT CHECK (kind IN ('app','api','db','storage','landing','cron','backup')),
  label TEXT, dokploy_app_name TEXT, dokploy_id TEXT,      -- appName inmutable, no el nombre del panel
  check_type TEXT CHECK (check_type IN ('http_health','http_status','health_field','container','job')),
  target TEXT, expected JSONB, interval_s INT DEFAULT 60,
  fail_threshold INT DEFAULT 3, recover_threshold INT DEFAULT 2, enabled BOOLEAN DEFAULT TRUE)

alphataco_check_state (               -- 1 fila por servicio, se pisa en cada chequeo
  service_id BIGINT PK REFERENCES alphataco_services ON DELETE CASCADE,
  status TEXT,                          -- ok | degraded | down | unknown
  consecutive_fail INT, consecutive_ok INT, last_checked_at, last_ok_at,
  last_latency_ms INT, last_error TEXT, last_payload JSONB)

-- 067_alphataco_history.sql
alphataco_check_samples (id BIGSERIAL, service_id, checked_at, ok BOOLEAN, latency_ms INT, error TEXT)
alphataco_host_metrics  (id BIGSERIAL, host_id, at, load1 REAL, mem_avail_pct REAL, disk_used_pct REAL,
                         swap_used_pct REAL, unhealthy_containers JSONB)
-- retención: el planificador borra > 7 días (1/min x ~6 servicios ≈ 8,6 k filas/día/instancia)

alphataco_incidents (
  id BIGSERIAL PK, instance_id, service_id NULL, host_id NULL,
  kind TEXT,            -- service_down | db_down | storage | resource_disk | resource_mem | resource_cpu
                        -- | heartbeat | sha_mismatch | job_failed
  severity TEXT, summary TEXT, details JSONB,
  opened_at, last_seen_at, acknowledged_at, acknowledged_by BIGINT REFERENCES users,
  resolved_at, last_notified_at, notify_count INT)
CREATE UNIQUE INDEX ... ON alphataco_incidents (COALESCE(service_id,0), COALESCE(host_id,0), kind)
  WHERE resolved_at IS NULL;

-- 068_alphataco_module_changes.sql (F3)
alphataco_module_changes (
  id BIGSERIAL PK, instance_id, module_key TEXT, to_enabled BOOLEAN, cascade_keys TEXT[],
  reason TEXT NOT NULL, actor_user_id BIGINT REFERENCES users, requested_at,
  result TEXT CHECK (result IN ('applied','blocked','error')), response JSONB)
```

### 3.2 Alphataco (aditivo; por defecto todo sigue habilitado)

- **Estado por clave en una tabla propia** (migración aditiva `2026xxxxxxxxxx_instance_modules`):

  ```sql
  CREATE TABLE public.instance_modules (
    module_key text PRIMARY KEY,                -- clave funcional del catálogo (§4.2)
    enabled boolean NOT NULL DEFAULT true,      -- sin fila = habilitado
    changed_at timestamptz NOT NULL DEFAULT now(),
    changed_by text);                           -- email del actor (TaskApp o script)

  CREATE TABLE public.module_change_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    module_key text NOT NULL, enabled boolean NOT NULL, cascade_keys text[] NOT NULL DEFAULT '{}',
    actor_email text NOT NULL, origin text NOT NULL CHECK (origin IN ('taskapp','script')),
    reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
  ```

  - La tabla arranca **vacía**, y «sin fila = habilitado». Las instancias existentes no cambian en nada al desplegar.
  - Son tablas globales (sin `company_id`), con RLS habilitada y sin políticas para `alphataco_app`. Solo escribe y lee `alphataco_system` (BYPASSRLS), igual que los catálogos globales según `RLS-DISENO.md`.

- **`modules.is_active` y `tabs.is_active` como proyección, no como fuente.** El `PUT` escribe `instance_modules` y, en la misma transacción, recalcula la proyección:
  - una fila de `modules` o `tabs` **que pertenece a alguna clave** queda activa solo si están encendidas **todas** las claves dueñas de esa fila o de cualquiera de sus ancestros (la pestaña padre y el módulo);
  - una fila que ninguna clave posee no se toca (si ya estaba apagada por catálogo, sigue apagada);
  - las subpestañas heredan del padre: así se tapa la fuga de `hasInferredView`.
- **Esto hace el resultado independiente del orden.** Dos secuencias de prueba que dan lo mismo:
  - apagar `mantenimiento`, apagar `equipos` y volver a encender `mantenimiento`: `historial-mantenimiento-equipo` (dueño `mantenimiento`, ancestro `equipos`) sigue apagado porque `equipos` está apagado;
  - apagar `mantenimiento` (dueño de la fila del módulo) con `gomeria` encendida: `mantenimiento:gomeria` queda apagada por ancestro. Por eso §4.3 declara `gomeria → mantenimiento` como **dependencia estructural dura**, y la regla de bloqueo (§4.4) impide llegar a ese estado sin cascada explícita.
- **Antes del primer despliegue:** `SELECT slug, is_active FROM modules` y el equivalente en `tabs` en cada instancia, para confirmar que todo está en `true`. **No se verificó en la demo** (Alphataco no tiene MCP de base).
- **F4, opcional por empresa:** `company_module_overrides(company_id uuid, module_key text, enabled boolean)` más una cláusula `NOT EXISTS` en `get_user_permissions`, que ya recibe `p_company_id`. Solo puede **restringir** lo que la instancia tiene encendido, nunca encender algo apagado.

**Por qué proyectar sobre `is_active` en vez de agregar un JOIN a `get_user_permissions`:** se obtienen sin tocar SQL el sidebar, las pestañas, los permisos, la API móvil, los destinatarios de avisos, la RLS por permiso y el editor de permisos.

**Riesgos:**

1. Si alguien cambia `is_active` a mano por SQL, la proyección queda desincronizada hasta el siguiente `PUT`. Se mitiga con un endpoint `POST /api/admin/v1/modules/reproject` y un chequeo en `status` que compare.
2. Las subpestañas de `get_user_permissions` miran solo su propia fila y no las de sus ancestros, y `canViewServer` infiere que el padre es visible por los hijos (`src/features/Permissions/lib/visibility.ts`, `hasInferredView`) [verificado]. Por eso la proyección **debe** recorrer el subárbol.

La alternativa (sin proyección: un JOIN contra `instance_modules` dentro de `get_user_permissions`) es más directa, pero toca la función más usada del sistema y hay que replicar la herencia de ancestros en SQL. Queda como decisión abierta (§7).

---

## 4. Catálogo real de módulos y dependencias

### 4.1 Módulos de permisos que existen [verificado, `src/features/Permissions/permissions-map.ts`]

| Módulo (`slug`, línea) | Pestañas de primer nivel `[subpestañas]`                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dashboard` (L60)      | principal · documentacion[empleados, vehiculos] · estadisticas[operaciones, rrhh, mantenimiento, desvios]                                                                                                                                                                                                                                                                                            |
| `configuracion` (L143) | general[company, cost-center, organigrama, org-chart, users, kpis, documentacion, datos-fiscales] · rrhh[listado, diagrams, convenios, contract-types, positions, aptitudes, listado_maestro_articulos] · vehicles[tipos, marcas, modelos, subtipos, titulares] · mantenimiento[talleres, sectores_taller, type_of_repair, maintenance_groups] · documentos[tipos-docs-personas, -equipos, -empresa] |
| `empleados` (L480)     | employees[activos, inactivos] · diagrams[old, new, massive_diagram, reports] · detalle-empleado[…, indumentaria_empleado]                                                                                                                                                                                                                                                                            |
| `equipos` (L602)       | equipos[vehicles, others, inactive] · checklist-equipo · cubiertas-equipo · detalle-otro-equipo[…] · detalle-equipo[…, historial-mantenimiento-equipo]                                                                                                                                                                                                                                               |
| `operaciones` (L735)   | preparte · dailyreportstable · detalle-parte-diario                                                                                                                                                                                                                                                                                                                                                  |
| `formularios` (L770)   | formularios                                                                                                                                                                                                                                                                                                                                                                                          |
| `ayuda` (L789)         | tickets · manual                                                                                                                                                                                                                                                                                                                                                                                     |
| `documentacion` (L819) | documentos-de-empleados · documentos-de-equipos · documentos-de-empresa · detalle-de-documento (cada uno con permanentes y mensuales)                                                                                                                                                                                                                                                                |
| `mantenimiento` (L929) | workshop_view · nuevo_pedido · maint_operaciones[equipments_with_deviations, maintenance_requests, pendientes_ejecutar, para_taller, seguimiento_taller] · maint_taller[5] · gomeria[catalogo_cubiertas, plantillas, ordenes_gomeria, marcas, tipos]                                                                                                                                                 |
| `comercial` (L1120)    | comerce[customers, service, mensure_units, reglas-precio, certificaciones, facturacion, daily_reports]                                                                                                                                                                                                                                                                                               |
| `seleccion` (L1277)    | candidatos                                                                                                                                                                                                                                                                                                                                                                                           |
| `almacenes` (L1302)    | stock · movimientos · prestamos · pedidos · materiales · depositos · config-almacen                                                                                                                                                                                                                                                                                                                  |
| `compras` (L1377)      | solicitudes · cotizaciones · ordenes · recepciones · facturas · pagos · retenciones · libro-iva · proveedores · config-compras                                                                                                                                                                                                                                                                       |
| `tesoreria` (L1485)    | cuentas · movimientos · transferencias · config-tesoreria · cobranzas · cheques · cheques-propios · conciliacion · retenciones-sufridas                                                                                                                                                                                                                                                              |

El sidebar los declara a mano en `src/features/Layout/sidebar/constants/navigation.ts:121-296`, en 14 entradas. Los filtra por `get_user_accessible_modules` y `resolveVisibleTabs` (`components/async/NavMainAsync.tsx`, `utils/tabs-visibility.ts`).

**Ropa (indumentaria), Checklists y Gomería no son módulos de permisos.** Son pestañas repartidas:

- Indumentaria: `configuracion:rrhh:listado_maestro_articulos`, `empleados:detalle-empleado:indumentaria_empleado` y el portal `/clothing`.
- Checklists: `equipos:checklist-equipo` (más el uso dentro de Mantenimiento).
- Gomería: `mantenimiento:gomeria` y `equipos:cubiertas-equipo`.

Por eso hace falta un **catálogo funcional** propio.

### 4.2 Catálogo funcional propuesto (lo que se enciende y apaga)

| Clave                       | Filas que apaga                                                                                                                                                          | Rutas y entradas fuera de permisos                              | Jobs                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------- |
| `nucleo` (no apagable)      | `configuracion:general`, `dashboard:principal`, `ayuda`                                                                                                                  | `/dashboard`, `/login`                                          | `processed-commands-purge`                    |
| `empleados`                 | módulo `empleados`, `configuracion:rrhh` (sin artículos), `dashboard:estadisticas:rrhh`                                                                                  | API externa `employees`                                         | —                                             |
| `seleccion`                 | módulo `seleccion`                                                                                                                                                       | —                                                               | —                                             |
| `equipos`                   | `equipos:equipos`, `detalle-*`, `configuracion:vehicles`                                                                                                                 | API externa `vehicles`, `other-equipment`                       | —                                             |
| `documentacion`             | módulo `documentacion`, `configuracion:documentos`, `dashboard:documentacion`                                                                                            | —                                                               | `documents-status`, `documents-expiry`        |
| `clientes` (comercial base) | `comercial:comerce:{customers, service, mensure_units, reglas-precio}`                                                                                                   | API externa `customers`, `commercial-sectors`, `customer-areas` | —                                             |
| `operaciones`               | módulo `operaciones`, `dashboard:estadisticas:operaciones`                                                                                                               | `/api/mobile/v1/*` (ya filtrado por permiso)                    | `daily-indicators`, `daily-report-deviations` |
| `certificacion`             | `comercial:comerce:{certificaciones, daily_reports}`                                                                                                                     | —                                                               | —                                             |
| `facturacion`               | `comercial:comerce:facturacion`, `configuracion:general:datos-fiscales`                                                                                                  | —                                                               | —                                             |
| `mantenimiento`             | `mantenimiento` (sin gomería), `configuracion:mantenimiento`, `equipos:detalle-equipo:historial-mantenimiento-equipo`, `dashboard:estadisticas:{mantenimiento, desvios}` | `/maintenance` (QR anónimo), `/operator`                        | —                                             |
| `gomeria`                   | `mantenimiento:gomeria`, `equipos:cubiertas-equipo`                                                                                                                      | —                                                               | —                                             |
| `checklists`                | `equipos:checklist-equipo`                                                                                                                                               | —                                                               | —                                             |
| `formularios`               | módulo `formularios`                                                                                                                                                     | —                                                               | —                                             |
| `almacenes`                 | módulo `almacenes`                                                                                                                                                       | —                                                               | `warehouse-batch-expiry`                      |
| `indumentaria`              | `configuracion:rrhh:listado_maestro_articulos`, `empleados:detalle-empleado:indumentaria_empleado`                                                                       | `/clothing`                                                     | —                                             |
| `compras`                   | módulo `compras` (sin `pagos`)                                                                                                                                           | —                                                               | —                                             |
| `pagos`                     | `compras:pagos`                                                                                                                                                          | —                                                               | —                                             |
| `tesoreria`                 | módulo `tesoreria`                                                                                                                                                       | —                                                               | —                                             |

Los jobs se verificaron en `src/app/api/jobs/*`, y la API externa en `src/app/api/external/v1/*`. La asignación de pestañas a claves es propuesta [supuesto] y conviene validarla con quien conoce el negocio.

### 4.3 Matriz de dependencias (evidencia: FKs de `prisma/schema.prisma` y flujos en código)

Hay **tres tipos** de dependencia, y solo los dos primeros importan para encender y apagar:

- **D, dura:** una FK obligatoria o un flujo que escribe en tablas del otro; sin el otro no funciona.
- **B, blanda:** muestra un dato extra o tiene una FK opcional; se degrada.
- **Acoplamiento de código** (imports de utilidades): no afecta el encendido. Solo complica llevar un módulo a otro clon. Ejemplos: Tesorería importa 32 veces `Comercial/Facturacion/lib/invoice-math`; Compras importa 40 veces `Warehouses/lib/format`.

| Módulo → depende de                                        | Tipo                         | Evidencia                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| seleccion → empleados                                      | D                            | `pre_employees.employees` (paso a empleado), `company_positions`, `hierarchy`; `features/Seleccion` importa `Employees` 9 veces                                                                                                                               |
| seleccion → documentacion (tipos)                          | D                            | `documents_pre_employees.document_types` es obligatoria                                                                                                                                                                                                       |
| documentacion → empleados / equipos                        | D (por lado)                 | `documents_employees.employees` y `documents_equipment.vehicles`, `onDelete: Cascade`                                                                                                                                                                         |
| empleados → documentacion                                  | B                            | El listado muestra el estado documental (`Employees` importa `Documentacion/shared/compliance/server/document-status.server`). El job `documents-status` reescribe el estado de empleados y equipos (`LOOP-ESTADO.md:86`: «cambió 24 empleados y 22 equipos») |
| equipos → documentacion                                    | B                            | Lo mismo (`Equipos` importa `Documentacion` 9 veces)                                                                                                                                                                                                          |
| operaciones → clientes                                     | D                            | `preparte.customers` y `preparte.customer_services` son obligatorias; `dailyreportrows.customers` y `service_*` son opcionales                                                                                                                                |
| operaciones → empleados                                    | D [supuesto en lo funcional] | `dailyreportemployeerelations.employees` (Cascade): asignar personal es el núcleo del parte                                                                                                                                                                   |
| operaciones → equipos                                      | B/D                          | `dailyreportequipmentrelations.vehicles` (Cascade), `dailyreport_customer_equipment_relations.equipos_clientes` es obligatoria. Sin equipos el parte funciona solo con personal [supuesto]                                                                    |
| certificacion → operaciones                                | D                            | `certification_lines.dailyreportrows` (SetNull); se certifica a partir de partes (`Comercial` importa `Operaciones/Certificacion/*`)                                                                                                                          |
| facturacion → clientes                                     | D                            | `invoices.customers` (Restrict, obligatoria) y `sales_points`                                                                                                                                                                                                 |
| facturacion → certificacion                                | B                            | `invoice_certifications`                                                                                                                                                                                                                                      |
| mantenimiento → equipos                                    | D                            | `maintenance_orders`, `maintenance_requests` y `work_orders` → `vehicles` u `other_equipment` (Cascade)                                                                                                                                                       |
| mantenimiento → empleados                                  | D (sectores) / B             | `employee_workshop_sectors.employees` es obligatoria; `maintenance_requests.employees` es opcional                                                                                                                                                            |
| mantenimiento → almacenes                                  | B                            | `material_requests.maintenance_orders` y `work_orders` son opcionales; consumo de repuestos (`Mantenimiento` importa `Warehouses` 22 veces)                                                                                                                   |
| mantenimiento → checklists                                 | B                            | `maintenance_requests.checklist_answers` y `maintenance_request_items.checklist_deviations` son opcionales (desvíos que generan pedidos)                                                                                                                      |
| gomeria → mantenimiento                                    | D (estructural)              | Sus pestañas cuelgan del módulo `mantenimiento` (`permissions-map.ts` L929, `gomeria`): con `mantenimiento` apagado, la proyección las apaga por ancestro                                                                                                     |
| gomeria → equipos                                          | D                            | `tire_service_orders`, `vehicle_tire_positions` y `vehicle_axle_tire_sizes` → `vehicles` obligatorias                                                                                                                                                         |
| gomeria → almacenes                                        | D                            | `tire_materials.materials` es obligatoria; `tires.material_units`, `tire_service_items.stock_movements`                                                                                                                                                       |
| checklists → equipos                                       | D                            | `checklist_answers.vehicles` es obligatoria; `checklist_deviations.vehicles` (Cascade)                                                                                                                                                                        |
| checklists → mantenimiento                                 | B                            | Un desvío crítico abre una reparación (`Checklists` importa `Mantenimiento/actions/maintenance-actions`)                                                                                                                                                      |
| indumentaria → empleados                                   | D                            | `clothing_deliveries.employees` es obligatoria                                                                                                                                                                                                                |
| indumentaria → almacenes                                   | D                            | `clothing_item_materials.materials` es obligatoria y usa `Warehouses/lib/stock-engine` (desde la migración `20261007200000_clothing_stock`)                                                                                                                   |
| almacenes → equipos / empleados / clientes / mantenimiento | B                            | `material_requests` y `stock_movements` tienen esas FKs, todas opcionales                                                                                                                                                                                     |
| compras → almacenes                                        | D                            | `purchase_request_lines.measurement_units` es obligatoria; `purchase_receipts.stock_movements` y `warehouses` (la recepción mueve stock)                                                                                                                      |
| pagos → tesoreria                                          | D                            | `payment_order_payments.treasury_accounts` es obligatoria; `Purchases` importa `Treasury/actions/accounts.server`                                                                                                                                             |
| tesoreria → clientes                                       | D                            | `customer_receipts.customers` y `third_party_checks.customers` son obligatorias                                                                                                                                                                               |
| tesoreria → compras                                        | B/D                          | `payment_orders.suppliers` es obligatoria (la orden de pago es de Compras); `own_checks.suppliers` es opcional. Tesorería sin Compras funciona sin órdenes de pago [supuesto]                                                                                 |
| clientes → mantenimiento (sectores)                        | revisar                      | `service_sectors.sectors` es obligatoria y `sectors.customers` también. `sectors` parece ser un sector de cliente, no de taller [supuesto: el clasificador por prefijo no lo resolvió]                                                                        |
| dashboard (cada pestaña) → su fuente                       | B                            | `canViewDashboard` mira solo `dashboard:<tab>` (`src/features/Dashboard/lib/permissions.server.ts:23-24` en main), no el módulo fuente                                                                                                                        |
| formularios, ayuda                                         | —                            | Sin dependencias de datos relevantes                                                                                                                                                                                                                          |

**Hoy no existe ninguna lógica de dependencias entre módulos** [verificado: no hay `requires` ni nada parecido en `permissions-map.ts`, `navigation.ts` ni el SQL de permisos]. Ese es el riesgo que anticipaste.

### 4.4 Reglas de activación y desactivación

1. **Apagar X está bloqueado** si algún módulo encendido tiene dependencia **D** con X. La respuesta es 409 con la lista de dependientes. Hay dos salidas explícitas:
   - `cascade: true`: apaga X y sus dependientes duros encendidos, mostrados antes con `dryRun`.
   - Apagar primero los dependientes.
2. **Encender Y está bloqueado** si alguna dependencia **D** de Y está apagada. La salida es `withDependencies: true`, que enciende esas dependencias tras una confirmación con la lista.
3. **Dependencias B: se degrada, sin bloquear.** Cada consumidor pregunta `isModuleEnabled` y oculta la columna, el widget o la acción. Ejemplos: el chip de estado documental en Empleados, el botón «crear reparación» en Checklists, los widgets del Dashboard.
4. **`nucleo` no se apaga nunca.** `empleados`, `equipos` y `clientes` se pueden apagar, pero en la práctica la regla 1 los bloquea casi siempre. Es lo correcto: son datos maestros.
5. **Los datos nunca se borran.** Apagar solo bloquea el acceso. `role_permissions` y `user_permissions` quedan intactos (las funciones solo los filtran), así que al reencender cada usuario recupera exactamente lo que tenía.
6. **La regla vive en Alphataco** (el catálogo del repo), no en TaskApp. Cada clon puede divergir (`PROPUESTA-ACEPTADA.md:25`). TaskApp muestra lo que le devuelve `GET /modules`, incluido el grafo, y pide cambios.

---

## 5. Cómo se apaga la lógica con garantías (Alphataco)

### 5.1 Qué corta ya `is_active` (capa 1, sin código) [verificado]

| Superficie                                                                            | Por qué queda cortada                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sidebar                                                                               | `get_user_accessible_modules` exige `m.is_active` (`permissions.sql:55`)                                                                                                                                                                                                                                                                                                                                                                              |
| Pestañas y subpestañas                                                                | `createTabVisibilityChecker` lee el mapa de `get_user_permissions`                                                                                                                                                                                                                                                                                                                                                                                    |
| Actions con guarda (`checkPermissionServer` y helpers)                                | `user_has_permission` → `get_user_permissions` (`permissions.sql:168-187`)                                                                                                                                                                                                                                                                                                                                                                            |
| API móvil                                                                             | `hasDailyReportPermission` llama a `user_has_permission` (`src/features/MobileApi/lib/permissions.ts`)                                                                                                                                                                                                                                                                                                                                                |
| Destinatarios de avisos                                                               | `resolve_notification_recipients` usa `user_has_permission` (`permissions.sql:196+`)                                                                                                                                                                                                                                                                                                                                                                  |
| RLS por permiso (rol `alphataco_app`, ya activo en la demo según `LOOP-ESTADO.md:85`) | `app_has_permission`. Hoy solo cubre escrituras en tablas de configuración: `treasury_accounts`, `treasury_concepts`, `withholding_regimes`, `purchase_expense_categories`, `supplier_categories`, `warehouse_settings` y `arca_credentials` (`migrations/20261027150000_*`, `20261028110000_*`). **No genera cascadas entre módulos en flujos operativos** (por ejemplo, un pago de Compras escribe `treasury_movements`, que no tiene esa política) |
| Contadores del sidebar y Resumen                                                      | `section-count-loaders.ts:46-50` usa `checkPermissionServer`                                                                                                                                                                                                                                                                                                                                                                                          |
| Editor de permisos                                                                    | `getModulesWithTabsServer` filtra `is_active: true` (`roles.server.ts:196-203`)                                                                                                                                                                                                                                                                                                                                                                       |
| Persistencia                                                                          | El seed no toca `is_active` (`scripts/seed-company.ts:167-169` y `:184+` en main); el reset de la demo conserva `modules` y `tabs` (`scripts/demo/lib/wipe.ts:16-22`)                                                                                                                                                                                                                                                                                 |

### 5.2 Qué queda abierto y dónde cortar (capa 2: `requireModule`)

| Superficie                                                           | Estado                                                                                                                                                                                                                                                              | Corte propuesto                                                                                                                                                                               | Costo |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Páginas `src/app/dashboard/<x>/page.tsx`                             | Renderizan el componente igual; solo quedan sin pestañas (por ejemplo `equipment/page.tsx` lee permisos y renderiza)                                                                                                                                                | `layout.tsx` por segmento con `await requireModule('<key>')` → `notFound()`. Son 13 segmentos                                                                                                 | S     |
| Server actions sin guarda                                            | **97 de 330** archivos `'use server'` sin una guarda reconocible (heurística por nombre; coincide con los ~94 de `PROPUESTA-ACEPTADA.md:270`). Los IDs de las actions son globales: **se pueden invocar desde cualquier URL**, así que ocultar la página no alcanza | `requireModule` en las actions de escritura de cada módulo, empezando por las de los módulos que se vayan a apagar primero; o capa 3                                                          | M-L   |
| Jobs `/api/jobs/*`                                                   | Recorren **todas** las empresas con `prismaSystem` (BYPASSRLS), por ejemplo `documents-status.ts:38` y `daily-indicators.ts:82`                                                                                                                                     | Al inicio de cada job, `if (!isModuleEnabled(key)) → status 'skipped', reason 'módulo desactivado'` (`jobs_runs` ya admite `skipped`). Los Schedules de Dokploy siguen disparando, sin efecto | S     |
| API externa `/api/external/v1/*` (6 recursos)                        | Credencial Basic, sin permisos de usuario                                                                                                                                                                                                                           | Mapear cada recurso a su módulo dentro de `createExternalListHandler` → 404 `MODULE_DISABLED`                                                                                                 | S     |
| Rutas públicas `/maintenance` (QR anónimo), `/operator`, `/clothing` | Fuera del proxy y de los permisos de rol                                                                                                                                                                                                                            | `layout.tsx` con `requireModule('mantenimiento')` o `('indumentaria')`                                                                                                                        | S     |
| `/api/mobile/v1/capabilities`                                        | `MOBILE_MODULES` es una constante                                                                                                                                                                                                                                   | Calcularlo con `isModuleEnabled`                                                                                                                                                              | S     |
| Dashboards                                                           | Miran `dashboard:<tab>`, no la fuente                                                                                                                                                                                                                               | Mapear pestaña → módulo fuente en `canViewDashboard`                                                                                                                                          | S     |
| Avisos de documentación en Empleados y Equipos                       | Dependencia blanda                                                                                                                                                                                                                                                  | Ocultar el chip y no tomar en cuenta el estado documental si `documentacion` está apagado                                                                                                     | S-M   |
| Datos con `'use cache'` (10 archivos de Mantenimiento y Usuarios)    | Pueden servir datos cacheados                                                                                                                                                                                                                                       | No es un problema si la guarda corre antes de leer [supuesto]                                                                                                                                 | —     |
| Triggers SQL                                                         | Todos son internos a su módulo (`prisma/sql/*.sql`: maintenance, daily-report, invoicing, documents, diagrams) [verificado]                                                                                                                                         | Nada que cortar                                                                                                                                                                               | —     |
| Exportaciones (PDF y Excel)                                          | Corren dentro de actions                                                                                                                                                                                                                                            | Las cubre la fila de actions                                                                                                                                                                  | —     |

**`requireModule` común:** `src/shared/lib/modules.server.ts`.

- `isModuleEnabled(key)` lee `instance_modules` (sin fila = encendido) con `prismaSystem` y `cache()` por request.
- `requireModule(key)` lanza `ModuleDisabledError` (sus adaptadores lo traducen a `notFound()`, 404 o `skipped`).
- Nada de caché entre requests: un cambio de módulo tiene que verse en el request siguiente.

### 5.3 Capa 3 (opcional, F4): RLS restrictiva por módulo

Política `AS RESTRICTIVE FOR ALL USING ((SELECT app_module_enabled('mantenimiento')))` sobre las tablas de cada módulo. Es el mismo mecanismo que `app_require_permission_for_writes`, y el `SELECT` envolvente hace que se evalúe una sola vez por consulta.

- **A favor:** tapa de golpe las 97 actions sin guarda para el rol `alphataco_app`.
- **En contra:**
  - las dependencias blandas que leen tablas del módulo apagado pasan a ver 0 filas (puede mostrar estados engañosos, como «sin documentos»);
  - los jobs con `prismaSystem` no quedan cubiertos;
  - hay que asignar cada una de las ~215 tablas a un módulo, con pgTAP.

Conviene hacerlo después de F3, módulo por módulo.

### 5.4 Costo y riesgo de F3

- **Costo:** M-L. El catálogo, el helper, los endpoints, los 13 layouts, los 6 jobs, la API externa y `/capabilities` son M. Endurecer las 97 actions es L, o se sustituye por la capa 3.
- **Riesgos:**
  - apagar el padre sin los hijos (se mitiga con el subárbol);
  - divergencia entre clones (el catálogo vive en cada repo);
  - un token de escritura filtrado permite apagar módulos (tokens separados, auditoría y opcionalmente lista de IPs);
  - estados derivados (estado documental) que quedan desactualizados mientras `documentacion` está apagado y se recalculan al reencender con el job.

---

## 6. Plan por fases

| Fase                                      | Qué                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Tamaño | Toca                                                                                          | Cómo se verifica                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F1. Sala mínima**                       | Migraciones 066-067; middleware de la lista de permitidos y `capabilities` en `/me`; ABM de instancias y servicios (alta de la demo: app, API vía `/api/mobile/v1/capabilities`, base y storage vía campos del health, landing); `AlphatacoMonitor` con chequeos HTTP cada 60 s; motor de incidentes con umbrales, histéresis y deduplicación; `Notify`; vista «Alphataco» (Instancias e Incidentes); purga de 7 días                                           | M      | Solo TaskApp                                                                                  | Demo en verde. Una instancia de prueba con una URL inexistente abre **un** incidente tras 3 fallas, avisa por Telegram una vez y se cierra al corregir la URL. Un usuario admin fuera de la lista recibe 403 en `/api/alphataco/*` y no ve el ítem                                                                                                      |
| **F2. Recursos, latido y estado interno** | (a) Agente de empuje (script + `systemd` timer en `31.97.42.82`, con token por host); umbrales de disco, RAM y CPU; contenedores unhealthy o con 0 réplicas por `appName` (es la **liveness real** de `alphataco-api`); incidente de latido; probar `setupMonitoring` de Dokploy como alternativa; vigilante externo de TaskApp. (b) `GET /api/admin/v1/status` en Alphataco con `ADMIN_STATUS_TOKEN`; TaskApp muestra los jobs con error y la última migración | M      | VPS (requiere aprobación: instala un servicio), Alphataco (una ruta y una variable) y TaskApp | Bajar el umbral de disco a 40 % abre un incidente y subirlo lo cierra. Detener el timer genera el aviso de latido a los 5 min. `status` sin token responde 401 y con token, JSON. Un job forzado a error (local) aparece como incidente `job_failed`                                                                                                    |
| **F3. Control de módulos**                | Catálogo y grafo en Alphataco; `requireModule` en layouts, jobs, API externa, rutas públicas, capabilities y dashboard; `instance_modules` con proyección sobre `is_active` y `module_change_log`; `GET/PUT /api/admin/v1/modules` con `dryRun` y apagado del subárbol; pestaña «Módulos» en TaskApp con vista previa del impacto y motivo obligatorio                                                                                                          | L      | Los dos                                                                                       | En el compose local: apagar `gomeria` la quita del sidebar, la URL directa da 404, la action invocada a mano devuelve error, `warehouse-batch-expiry` sigue y nada de Gomería corre. Apagar `almacenes` con `gomeria` encendida da 409. Reencender restaura los permisos idénticos. Se verifica que los datos quedan intactos (conteos antes y después) |
| **F4. Opcionales**                        | Capa 3 (RLS por módulo); overrides por empresa; herramientas de estado en `taskapp-mcp` y `taskapp-cli`; Uptime externo                                                                                                                                                                                                                                                                                                                                         | M c/u  | Los dos                                                                                       | pgTAP de aislamiento por módulo                                                                                                                                                                                                                                                                                                                         |

**Riesgos transversales:**

- **Punto ciego por misma VPS:** se mitiga con el vigilante externo de F2.
- **Falsos positivos en el reset diario o los deploys de la demo:** silencio automático.
- **Key de Dokploy de administrador total:** no se guarda en la base de TaskApp.
- **Crecimiento de tablas:** purga.
- **Regla del repo:** según el `CLAUDE.md` de Alphataco, toda tab o `role_permissions` nueva se carga para los 3 roles de acceso completo. El control de módulos **no** crea tabs nuevas, así que no aplica, pero cualquier tab nueva del catálogo sí la sigue.

---

## 7. Decisiones abiertas (con recomendación)

1. **Quién ve la vista.** Recomendación: la variable `ALPHATACO_CONSOLE_USER_IDS` con los IDs de Yordan y Fabricio, sin rol nuevo. No se sabe cuántos `admin` tiene hoy TaskApp: verificar antes.
2. **Fuente de verdad del encendido.** Recomendación: la tabla `instance_modules` (estado por clave; vacía = todo encendido) con **proyección** sobre `modules.is_active` y `tabs.is_active` en la misma transacción, para no tocar `get_user_permissions`. La alternativa es un JOIN contra `instance_modules` dentro de esa función, con la herencia de ancestros escrita en SQL.
3. **Nivel de activación.** Recomendación: por instancia (F3) y por empresa solo si un cliente lo pide (F4).
4. **Política ante dependencias.** Recomendación: bloquear por defecto, con cascada explícita y vista previa. Nunca en cascada silenciosa.
5. **Recursos de la VPS.** Recomendación: agente de empuje propio (F2), y probar en paralelo el monitoreo nativo de Dokploy. No Uptime Kuma ni Beszel salvo que se prefiera no escribir código.
6. **Canales y destinatarios.** Recomendación: campanita y Telegram para todo; email solo para los críticos. Los dos tienen que vincular su Telegram en TaskApp.
7. **Vigilante externo.** Recomendación: un chequeo desde fuera de `31.97.42.82` (`vps-yordan` siguiendo el patrón de `vps-monitor`, o un servicio gratuito). Se decide quién y dónde.
8. **Hasta dónde endurecer las actions en F3.** Recomendación: guardas en las entradas (layouts, jobs, APIs) y en las actions de escritura de los módulos que se vayan a apagar de verdad. Capa 3 de RLS después, módulo por módulo.

## 8. Lo que no se sabe o no se verificó

- Si en la demo todos los `modules` y `tabs` tienen hoy `is_active = true` (no hay MCP de base para Alphataco).
- Cuántos usuarios `admin` tiene TaskApp en producción, y si `/admin/users` permite cambiar el email de un usuario.
- El comportamiento real del monitoreo nativo de Dokploy (`setupMonitoring`, `urlCallback`, umbrales): está desactivado y no se probó.
- La hora exacta del reset diario de la demo y de cada Schedule de Dokploy (para las ventanas de silencio y la alerta de «job que no corrió»).
- Las dependencias marcadas [supuesto] en §4.3: Operaciones sin Equipos, Tesorería sin Compras, y qué es exactamente `sectors`.
- Si `alphataco-api` responde en `/api/mobile/v1/capabilities` del mismo dominio de la app: lo dice `LOOP-ESTADO.md:86`, pero no se probó en esta sesión.
- Los consumos de RAM de Uptime Kuma, Beszel y Prometheus en §2.5 son aproximados, no medidos.
- La cifra de 97 actions sin guarda viene de una heurística por nombres de función. Son candidatos, no vulnerabilidades confirmadas.
