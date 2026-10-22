# Blueprint F1 · Sala de control de Alphataco en TaskApp

Diseño de implementación · 2026-10-22 · solo diseño: no se tocó código, base de datos ni despliegues.

**Base de la evidencia:**

- `taskApp-backend` en `main` (`c024073`).
- `taskApp-frontend` en `main` (`27436ce`).
- Alphataco `origin/main` para `/api/health` y `capabilities`.
- `PROPUESTA-SALA-DE-CONTROL.md` (en adelante, «la propuesta»).

Convención: **[verificado]** quiere decir leído en el código. **[supuesto]** quiere decir sin comprobar; se resuelve en el paso 0 (§6).

**Este blueprint manda sobre la propuesta en lo que difieren**, porque incorpora decisiones posteriores del usuario:

- **Sin notificaciones.** No hay `Notify`, campanita ni Telegram. El criterio de F1 de la propuesta (§6, «avisa por Telegram una vez») se reemplaza por «el incidente aparece en la vista».
- **Acceso por permiso explícito por usuario** (tabla `user_capabilities`). No se usa `ALPHATACO_CONSOLE_USER_IDS` (propuesta §2.4 y §7.1).
- **Nada de F2 ni F3 en las migraciones de F1:** ni `alphataco_hosts`, ni `host_metrics`, ni tokens de instancia cifrados, ni `module_changes`.

---

## 0. Convenciones de TaskApp (no son las de Alphataco)

- **Ninguno de los dos repos de TaskApp tiene `CLAUDE.md` ni reglas propias** (`ls -a` en las dos raíces solo muestra `.codegraph`). Las reglas de `alphataco-arq/.claude/rules/` (moment, DataTable, Server Actions, Prisma) **no aplican acá**.
- **Idioma:** identificadores en inglés y comentarios en español, en Go y en TS. Ejemplos: `cmd/server/main.go:142-158`, `internal/service/settlement.go:41`, y en el frontend `src/pages/admin/settlements.tsx:1-7`. Los mensajes de error que ve el usuario van en español (`settlement.go:41`, `use-settlements.ts`). La UI va en español.
- **Backend:** un archivo por capa:
  - `internal/model/*.go`
  - `internal/repository/*.go`: interfaz más implementación SQL con `database/sql`
  - `internal/service/*.go`
  - `internal/handler/*.go`
  - El cableado está en `cmd/server/main.go`. Respuestas con `writeJSON` y `writeError` (`internal/handler/response.go:8-16`).
- **Migraciones:** SQL numerados en `db/migrations/`, aplicados al arrancar en orden alfabético y registrados en `schema_migrations`. **Cada archivo NO va en una transacción** (`db/postgres.go:128-176`, el `db.Exec` de `:164` no abre `BEGIN`). La última es `065_create_booking_pages.sql`, así que **F1 usa 066 y 067** [verificado]. Antes de implementar, volver a listar `db/migrations` por si alguien tomó 066.
- **Frontend:**
  - Stack: Vite, React 19, react-router 7, TanStack Query, axios (`src/api/client.ts`), zustand, Tailwind 4, `date-fns` (no moment).
  - Patrón de pantalla: `src/pages/admin/settlements.tsx` y `settlement-detail.tsx`, con `api/*.ts` más `hooks/use-*.ts`.
  - Componentes de sistema: `PageHeader`, `StatusPill`, `QueryError` y `EmptyState` (`src/components/system/`).
- **Verificación:**
  - Backend: `go build ./... && go vet ./cmd/... ./internal/... ./db/...`.
  - **No se usa `go vet ./...`**: hoy ya falla en `main`, porque `integration_test.go:70` llama a `handler.NewAuthHandler(authService)` con un argumento, cuando la función recibe dos (`internal/handler/auth.go:18`) [verificado]. Arreglarlo es tocar un test, y eso queda fuera de F1.
  - Frontend: `pnpm lint && pnpm build` (`package.json:7-10`; `build` corre `tsc -b`).
  - Prueba a mano con `curl` y el navegador.
  - **No se escriben ni se corren tests** (regla del usuario).

---

## 1. Archivos a crear o modificar

### 1.1 Backend (`taskapp/taskApp-backend`)

| Archivo                                      | Acción    | Responsabilidad                                                                                                                                                                                                                                                          |
| -------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `db/migrations/066_user_capabilities.sql`    | crear     | Catálogo `capabilities` y tabla `user_capabilities`. Siembra la clave `alphataco_console`. **No le otorga el permiso a nadie** (§2.1)                                                                                                                                    |
| `db/migrations/067_alphataco_monitoring.sql` | crear     | `alphataco_instances`, `alphataco_services`, `alphataco_checks` (definición más estado vivo), `alphataco_check_results` e `alphataco_incidents`                                                                                                                          |
| `db/seeds/alphataco_demo.sql`                | crear     | Registro **idempotente** de la instancia `demo` y sus servicios y chequeos. **No es una migración**: `RunMigrations` solo lee `db/migrations` (`postgres.go:137-138`) y el `Dockerfile` solo copia esa carpeta. Se corre a mano (§6, paso 8)                             |
| `internal/model/capability.go`               | crear     | `const CapabilityAlphatacoConsole = "alphataco_console"` y `MeResponse { model.User; Capabilities []string }`                                                                                                                                                            |
| `internal/repository/capability.go`          | crear     | `CapabilityRepository`: `Has(userID, key) (bool, error)` y `ListByUser(userID) ([]string, error)`                                                                                                                                                                        |
| `internal/middleware/capability.go`          | crear     | `RequireCapability(repo, key)`. Mismo estilo que `RequireRole` (`internal/middleware/role.go:9-30`), devuelve 403 `{"error":"forbidden"}`                                                                                                                                |
| `internal/handler/auth.go`                   | modificar | `Me` (`:25-33`) devuelve `MeResponse` con `capabilities` (siempre `[]`, nunca `null`). El repo se inyecta con un setter, `SetCapabilityRepo(repo)`, igual que `SetRelationRepo` y `SetProjectEnvRepo` (`main.go:196-201`). **No se cambia la firma de `NewAuthHandler`** |
| `internal/model/alphataco.go`                | crear     | Entidades (`AlphatacoInstance`, `AlphatacoService`, `AlphatacoCheck`, `AlphatacoCheckResult`, `AlphatacoIncident`) y DTOs de respuesta (`AlphatacoOverview`, `AlphatacoInstanceDetail`)                                                                                  |
| `internal/repository/alphataco.go`           | crear     | `AlphatacoRepository`: lecturas para la vista y escrituras del monitor (claim de instancias, aplicar resultado en transacción, purga). Detalle en §4.6                                                                                                                   |
| `internal/service/alphataco_probes.go`       | crear     | **Adaptadores de salida.** `HTTPProber` (health y capabilities), `TCPProber` y la clasificación de errores de red a texto corto en español                                                                                                                               |
| `internal/service/dokploy_client.go`         | crear     | **Adaptador de solo lectura de Dokploy.** Un único método, `ContainersByAppName`, contra **un único** endpoint GET en lista blanca. No tiene ningún método de escritura (§4.5 y §7)                                                                                      |
| `internal/service/alphataco_evaluator.go`    | crear     | **Lógica pura, sin E/S.** `Evaluate(check, snapshot) Outcome` y `Transition(state, outcome, policy) (newState, IncidentAction)`. Es el corazón del anti-ruido (§4.3)                                                                                                     |
| `internal/service/alphataco_monitor.go`      | crear     | Planificador: ticker, claim, sondas en paralelo, persistencia, circuito de Dokploy y purga horaria. Mismo patrón que `MeetingReminderScheduler` (`internal/service/meeting_reminder.go:43-84`)                                                                           |
| `internal/service/alphataco.go`              | crear     | `AlphatacoService` de consulta para el handler: overview, detalle, historial de un chequeo, incidentes y pausa de una instancia                                                                                                                                          |
| `internal/handler/alphataco.go`              | crear     | Los endpoints de §3                                                                                                                                                                                                                                                      |
| `cmd/server/main.go`                         | modificar | Construir el repo de capabilities y el de alphataco, el cliente de Dokploy (desde el entorno), el monitor y el handler. Registrar `r.Route("/api/alphataco", …)` y `go alphatacoMonitor.Start(context.Background())`, junto a `:663-667`                                 |
| `.env.example`                               | modificar | Documentar `DOKPLOY_API_URL` y `DOKPLOY_API_KEY`, **sin valores**                                                                                                                                                                                                        |

**Puertos y adaptadores, solo donde suman.** El monitor depende de tres interfaces que se declaran en el lado del consumidor, en `alphataco_monitor.go`:

```go
// Lo que el monitor necesita del mundo exterior. Se declaran acá (lado consumidor)
// para que el evaluador y el monitor no conozcan net/http ni la API de Dokploy.
type HealthProber interface {
    Health(ctx context.Context, appURL string) HealthProbe             // GET {app}/api/health
    Capabilities(ctx context.Context, apiURL string) CapabilitiesProbe // GET {api}/api/mobile/v1/capabilities
}
type TCPProber interface {
    Dial(ctx context.Context, hostPort string) TCPProbe
}
type ContainerInspector interface {
    // Configured=false cuando faltan DOKPLOY_API_URL o DOKPLOY_API_KEY.
    Configured() bool
    ContainersByAppName(ctx context.Context, appName, dokployKind string) ([]ContainerInfo, error)
}
```

Para la base no se agrega una capa de dominio aparte ni un paquete nuevo: el repo ya organiza todo por capa en paquetes planos, y se sigue igual. Lo único que se separa es el **evaluador puro**, porque ahí está la regla de negocio que más importa.

### 1.2 Frontend (`taskapp/taskApp-frontend`)

| Archivo                                              | Acción    | Responsabilidad                                                                                                                                                            |
| ---------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types/index.ts`                                 | modificar | `export type Capability = "alphataco_console"` y, en `User` (`:7-17`), `capabilities?: Capability[]`. Es opcional porque la respuesta de login no lo trae: solo `/me`      |
| `src/types/alphataco.ts`                             | crear     | Tipos de la sala, que espejan los DTOs de §3. Sigue el precedente de `src/types/booking.ts`                                                                                |
| `src/lib/capabilities.ts`                            | crear     | `hasCapability(user, cap)`                                                                                                                                                 |
| `src/hooks/use-me.ts`                                | crear     | Extrae el `useQuery(["me"])` que hoy vive en `src/layouts/main-layout.tsx:176-181`, para que lo compartan el layout, la guarda y el sidebar (la caché lo deduplica)        |
| `src/layouts/main-layout.tsx`                        | modificar | Usar `useMe()`. El `useEffect` que sincroniza el store (`:185-187`) queda igual                                                                                            |
| `src/components/protected-route.tsx`                 | modificar | Nuevo `CapabilityRoute({ capability })` que **espera a `/me`** (§5.4)                                                                                                      |
| `src/App.tsx`                                        | modificar | Dos rutas diferidas (`lazy`, como `:40-51`) bajo `<CapabilityRoute capability="alphataco_console">`: `/alphataco` y `/alphataco/instancias/:id`                            |
| `src/components/app-sidebar.tsx`                     | modificar | Grupo «Operación» con el ítem «Alphataco» (icono `Activity`), visible solo con la capability. Va fuera del bloque `isAdmin` (`:856`), porque el permiso no depende del rol |
| `src/components/system/status-pill.tsx`              | modificar | Variante **opt-in** `danger`. Hoy solo existen `success`, `warning` y `neutral` (`:6-21`). Es aditivo: nadie más cambia                                                    |
| `src/api/alphataco.ts`                               | crear     | `alphatacoApi.overview()`, `.instance(id)`, `.checkResults(id, limit)`, `.incidents(params)`, `.setMonitoring(id, enabled)`                                                |
| `src/hooks/use-alphataco.ts`                         | crear     | `useAlphatacoOverview`, `useAlphatacoInstance`, `useCheckResults` (solo con el chequeo abierto), `useAlphatacoIncidents` y `useSetInstanceMonitoring`                      |
| `src/lib/alphataco-status.ts`                        | crear     | **Un solo mapa** de estado → `{ label, pillVariant, icon }` para chequeo, servicio e instancia. No se replica en cada componente                                           |
| `src/pages/alphataco/index.tsx`                      | crear     | `AlphatacoPage`: `PageHeader`, aviso del monitor y pestañas «Instancias» e «Incidentes»                                                                                    |
| `src/pages/alphataco/instance-detail.tsx`            | crear     | `AlphatacoInstancePage`: servicios con sus chequeos, sha, incidentes de la instancia y botón para pausar el monitoreo                                                      |
| `src/pages/alphataco/components/instance-card.tsx`   | crear     | Tarjeta de una instancia en el listado                                                                                                                                     |
| `src/pages/alphataco/components/monitor-banner.tsx`  | crear     | Monitor detenido, Dokploy sin configurar o Dokploy que no responde                                                                                                         |
| `src/pages/alphataco/components/incidents-table.tsx` | crear     | Tabla de incidentes, reusada en la página y en el detalle                                                                                                                  |
| `src/pages/alphataco/components/check-row.tsx`       | crear     | Fila de un chequeo con su historial desplegable                                                                                                                            |

---

## 2. Migraciones SQL

Todas son aditivas, con `IF NOT EXISTS` y `ON CONFLICT`, porque el runner no abre transacción por archivo: si una falla a la mitad, se tiene que poder reaplicar.

### 2.1 `066_user_capabilities.sql`

```sql
-- Permisos explícitos por usuario, independientes del rol.
--
-- Por qué no un rol nuevo ni una lista en una variable de entorno: el rol
-- "admin" no alcanza para decir "solo Yordan y Fabricio" (hay más admins) y,
-- además, el alta pública (/api/auth/register) crea usuarios con rol admin por
-- defecto (repository/user.go:31). Una capability se otorga a un usuario
-- puntual, queda en la base y se revoca borrando una fila.
--
-- El catálogo existe para que un INSERT con una clave mal escrita falle por FK
-- en vez de otorgar un permiso que ningún código consulta.
--
-- Esta migración NO otorga el permiso a nadie: la asignación es un paso manual
-- y verificado (ver BLUEPRINT-F1, §2.1). Otorgarlo por email o por patrón desde
-- una migración podría dárselo a la cuenta equivocada.

CREATE TABLE IF NOT EXISTS capabilities (
    key         TEXT        PRIMARY KEY,
    description TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO capabilities (key, description)
VALUES ('alphataco_console',
        'Sala de control de Alphataco: instancias, chequeos e incidentes')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS user_capabilities (
    user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    capability TEXT        NOT NULL REFERENCES capabilities(key),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Quién lo otorgó, si se sabe. NULL cuando se otorga por SQL a mano.
    granted_by BIGINT      REFERENCES users(id) ON DELETE SET NULL,
    note       TEXT        NOT NULL DEFAULT '',
    PRIMARY KEY (user_id, capability)
);
```

**Cómo se otorga a Yordan y Fabricio.** En el código, los seeds y los docs de TaskApp **no aparece el email de ninguno de los dos** [verificado: búsqueda en los dos repos].

- Hay un único rastro: `065_create_booking_pages.sql:79-89` elige al anfitrión con `lower(u.email) LIKE '%spiritosi%'`.
- **No se reutiliza ese patrón para un permiso.** El alta es pública (`main.go:281`), así que cualquiera puede registrar una cuenta cuyo email contenga ese texto.

El otorgamiento queda como SQL manual sobre la base de producción de TaskApp, en dos pasos. Primero se confirma y después se escribe:

```sql
-- 1) Identificar las dos cuentas. Revisar a ojo email, nombre, rol y fecha de alta.
SELECT id, email, name, role, status, created_at
FROM users
WHERE lower(email) IN (lower('<email de Yordan>'), lower('<email de Fabricio>'));

-- 2) Otorgar por id (los ids que devolvió el paso 1).
INSERT INTO user_capabilities (user_id, capability, note)
VALUES (<id_yordan>,   'alphataco_console', 'alta F1'),
       (<id_fabricio>, 'alphataco_console', 'alta F1')
ON CONFLICT (user_id, capability) DO NOTHING;

-- Revocar:
-- DELETE FROM user_capabilities WHERE user_id = <id> AND capability = 'alphataco_console';
```

- Se puede filtrar por email exacto con seguridad porque `AdminUserHandler.Update` no permite cambiar el email (`internal/handler/admin_user.go:191-208` solo toca `name`, `role` y `hourly_rate`). De todos modos, el permiso queda atado al `user_id`.
- **No se usa el email de la sesión de Claude:** no está verificado que sea el de la cuenta de TaskApp.
- Dónde correrlo: en el Postgres de TaskApp en `31.97.42.82`, con `docker exec` al contenedor de la base. TaskApp no tiene MCP de base (`workspace/CLAUDE.md`, «Proyectos sin MCP de base»).

### 2.2 `067_alphataco_monitoring.sql`

```sql
-- Sala de control de Alphataco (F1): registro de instancias y servicios,
-- chequeos periódicos desde el backend, historial con retención acotada e
-- incidentes con anti-ruido. Sin notificaciones: los incidentes se ven solo en
-- la vista /alphataco.
--
-- Recursos de la VPS, agente, tokens de instancia y control de módulos son
-- F2/F3 y NO van acá.

-- Una instancia = un cliente = un repo + una VPS + una base (PROPUESTA-ACEPTADA.md).
CREATE TABLE IF NOT EXISTS alphataco_instances (
    id                  BIGSERIAL   PRIMARY KEY,
    slug                TEXT        NOT NULL UNIQUE
                                    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
    name                TEXT        NOT NULL,
    environment         TEXT        NOT NULL
                                    CHECK (environment IN ('demo', 'staging', 'prod')),
    -- Base pública de la app web: se chequea {app_url}/api/health.
    app_url             TEXT        NOT NULL CHECK (app_url ~ '^https?://'),
    -- Base de la API móvil. NULL = la instancia no tiene app móvil. En la demo
    -- es el mismo dominio (Traefik enruta /api/mobile al servicio api).
    api_url             TEXT        CHECK (api_url IS NULL OR api_url ~ '^https?://'),
    -- Solo informativo en F1 (IP o nombre de la VPS, proyecto y entorno de Dokploy).
    host_label          TEXT        NOT NULL DEFAULT '',
    dokploy_project     TEXT        NOT NULL DEFAULT '',
    dokploy_environment TEXT        NOT NULL DEFAULT '',
    monitoring_enabled  BOOLEAN     NOT NULL DEFAULT TRUE,
    check_interval_s    INT         NOT NULL DEFAULT 60
                                    CHECK (check_interval_s BETWEEN 30 AND 3600),
    -- El monitor reclama la instancia moviendo next_check_at en un UPDATE
    -- condicional: con dos réplicas del backend, cada pasada la toma una sola.
    next_check_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_checked_at     TIMESTAMPTZ,
    -- Último sha que informó /api/health (app) y /capabilities (api).
    app_sha             TEXT,
    app_sha_changed_at  TIMESTAMPTZ,
    api_sha             TEXT,
    -- Tras ver un sha nuevo (deploy ya terminado) no se abren incidentes hasta
    -- esta hora: cubre el aleteo posterior (api poniéndose al día, arranque en
    -- frío). La caída DURANTE el redeploy la absorbe el umbral de fallas.
    deploy_grace_until  TIMESTAMPTZ,
    notes               TEXT        NOT NULL DEFAULT '',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Servicio de la instancia tal como existe en Dokploy. Se guarda el appName
-- (inmutable y autogenerado) y no el nombre del panel: alphataco-api corre como
-- app-input-wireless-hard-drive-feyykf (propuesta §2.5).
CREATE TABLE IF NOT EXISTS alphataco_services (
    id               BIGSERIAL   PRIMARY KEY,
    instance_id      BIGINT      NOT NULL REFERENCES alphataco_instances(id) ON DELETE CASCADE,
    key              TEXT        NOT NULL CHECK (key ~ '^[a-z0-9-]{1,40}$'),
    label            TEXT        NOT NULL,                -- "alphataco-app"
    kind             TEXT        NOT NULL CHECK (kind IN ('app', 'api', 'db', 'storage')),
    -- Tipo de recurso en Dokploy: cambia cómo se buscan sus contenedores.
    dokploy_kind     TEXT        CHECK (dokploy_kind IN ('application', 'postgres', 'compose')),
    dokploy_app_name TEXT,
    position         INT         NOT NULL DEFAULT 0,
    enabled          BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (instance_id, key),
    CHECK ((dokploy_kind IS NULL) = (dokploy_app_name IS NULL))
);

-- Un chequeo concreto de un servicio, con su política anti-ruido y su estado
-- vivo (una fila por chequeo, que se pisa en cada pasada).
CREATE TABLE IF NOT EXISTS alphataco_checks (
    id                BIGSERIAL   PRIMARY KEY,
    service_id        BIGINT      NOT NULL REFERENCES alphataco_services(id) ON DELETE CASCADE,
    type              TEXT        NOT NULL CHECK (type IN (
                          'app_health',         -- {app}/api/health responde (200 o 503 con JSON)
                          'db_via_health',      -- /api/health no dice db_unavailable
                          'storage_via_health', -- /api/health dice storage = "ok"
                          'api_capabilities',   -- {api}/api/mobile/v1/capabilities = 200
                          'sha_match',          -- serverSha de la api = sha de la app
                          'tcp',                -- conexión TCP a target (host:puerto)
                          'container'           -- Dokploy: al menos un contenedor running
                      )),
    target            TEXT,                     -- solo para tcp
    severity          TEXT        NOT NULL CHECK (severity IN ('critical', 'high', 'medium')),
    fail_threshold    INT         NOT NULL CHECK (fail_threshold BETWEEN 1 AND 120),
    recover_threshold INT         NOT NULL CHECK (recover_threshold BETWEEN 1 AND 20),
    enabled           BOOLEAN     NOT NULL DEFAULT TRUE,
    -- Estado vivo:
    --   ok       sin fallas
    --   failing  falla, pero todavía no alcanzó el umbral (o está en gracia de deploy)
    --   down     hay un incidente abierto
    --   unknown  sin dato (nunca corrió, o la fuente no respondió)
    status            TEXT        NOT NULL DEFAULT 'unknown'
                                  CHECK (status IN ('ok', 'failing', 'down', 'unknown')),
    consecutive_fail  INT         NOT NULL DEFAULT 0,
    consecutive_ok    INT         NOT NULL DEFAULT 0,
    last_result       TEXT        CHECK (last_result IN ('ok', 'fail', 'unknown')),
    last_checked_at   TIMESTAMPTZ,
    last_ok_at        TIMESTAMPTZ,
    last_latency_ms   INT,
    last_error        TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((type = 'tcp') = (target IS NOT NULL))
);

-- Un chequeo de cada tipo por servicio (y un tcp por destino).
CREATE UNIQUE INDEX IF NOT EXISTS uq_alphataco_checks_service_type
    ON alphataco_checks (service_id, type, COALESCE(target, ''));

-- Historial crudo. Retención: 7 días, purga horaria por lotes (BLUEPRINT §4.4).
CREATE TABLE IF NOT EXISTS alphataco_check_results (
    id          BIGSERIAL   PRIMARY KEY,
    check_id    BIGINT      NOT NULL REFERENCES alphataco_checks(id) ON DELETE CASCADE,
    checked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    result      TEXT        NOT NULL CHECK (result IN ('ok', 'fail', 'unknown')),
    latency_ms  INT,
    http_status INT,
    error       TEXT,
    sha         TEXT
);
CREATE INDEX IF NOT EXISTS idx_alphataco_results_check_time
    ON alphataco_check_results (check_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_alphataco_results_time
    ON alphataco_check_results (checked_at);

-- Incidentes. Uno abierto por chequeo como máximo (índice único parcial). Los
-- del propio monitor (Dokploy no responde) no tienen chequeo: uno abierto por kind.
CREATE TABLE IF NOT EXISTS alphataco_incidents (
    id           BIGSERIAL   PRIMARY KEY,
    instance_id  BIGINT      REFERENCES alphataco_instances(id) ON DELETE CASCADE,
    service_id   BIGINT      REFERENCES alphataco_services(id) ON DELETE CASCADE,
    check_id     BIGINT      REFERENCES alphataco_checks(id) ON DELETE CASCADE,
    kind         TEXT        NOT NULL CHECK (kind IN (
                     'app_health', 'db_via_health', 'storage_via_health', 'api_capabilities',
                     'sha_match', 'tcp', 'container', 'dokploy_unreachable'
                 )),
    severity     TEXT        NOT NULL CHECK (severity IN ('critical', 'high', 'medium')),
    summary      TEXT        NOT NULL,            -- en español, armado al abrir
    last_error   TEXT,
    fail_count   INT         NOT NULL DEFAULT 0,  -- fallas acumuladas mientras estuvo abierto
    opened_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at  TIMESTAMPTZ,
    resolution   TEXT        CHECK (resolution IN ('recovered', 'check_disabled')),
    CHECK ((check_id IS NULL) = (kind = 'dokploy_unreachable'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_alphataco_incident_open_check
    ON alphataco_incidents (check_id)
    WHERE resolved_at IS NULL AND check_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_alphataco_incident_open_kind
    ON alphataco_incidents (kind)
    WHERE resolved_at IS NULL AND check_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_alphataco_incidents_instance
    ON alphataco_incidents (instance_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_alphataco_incidents_open
    ON alphataco_incidents (opened_at DESC) WHERE resolved_at IS NULL;
```

### 2.3 `db/seeds/alphataco_demo.sql`: no es una migración, se corre a mano

- Es idempotente (`ON CONFLICT … DO UPDATE` sobre las claves naturales) y tiene **placeholders donde el dato no se verificó**.
- No va en una migración porque cada base de desarrollo local quedaría vigilando la demo real.
- Sin instancias registradas, el monitor no hace nada: no hace falta ninguna variable para apagarlo en local.

```sql
-- Registro de la instancia demo (proyecto `alphataco`, entorno `demo`, Dokploy 31.97.42.82).
-- Completar los <...> con lo que devuelve el paso 0 del blueprint antes de correrlo.
INSERT INTO alphataco_instances (slug, name, environment, app_url, api_url,
                                 host_label, dokploy_project, dokploy_environment)
VALUES ('demo', 'Alphataco demo', 'demo',
        'https://alphataco.31.97.42.82.sslip.io',    -- docs/deploy/runbook.md (health citado)
        'https://alphataco.31.97.42.82.sslip.io',    -- mismo dominio, path /api/mobile (runbook:345)
        '31.97.42.82', 'alphataco', 'demo')
ON CONFLICT (slug) DO UPDATE
SET app_url = EXCLUDED.app_url, api_url = EXCLUDED.api_url, updated_at = NOW();

INSERT INTO alphataco_services (instance_id, key, label, kind, dokploy_kind, dokploy_app_name, position)
SELECT i.id, s.key, s.label, s.kind, s.dkind, s.app_name, s.pos
FROM alphataco_instances i,
     (VALUES ('app',     'alphataco-app',     'app',     'application', '<appName de alphataco-app>',              0),
             ('api',     'alphataco-api',     'api',     'application', 'app-input-wireless-hard-drive-feyykf',    1),
             ('db',      'alphataco-db',      'db',      'postgres',    '<appName de alphataco-db>',               2),
             ('storage', 'alphataco-storage', 'storage', 'compose',     '<appName del compose alphataco-storage>', 3)
     ) AS s(key, label, kind, dkind, app_name, pos)
WHERE i.slug = 'demo'
ON CONFLICT (instance_id, key) DO UPDATE
SET label = EXCLUDED.label, dokploy_kind = EXCLUDED.dokploy_kind,
    dokploy_app_name = EXCLUDED.dokploy_app_name, updated_at = NOW();

-- Chequeos con la política de §4.3. Los tcp entran deshabilitados hasta que el
-- paso 0 confirme que el contenedor de TaskApp llega a esos destinos.
INSERT INTO alphataco_checks (service_id, type, target, severity, fail_threshold, recover_threshold, enabled)
SELECT sv.id, c.type, c.target, c.severity, c.fail_t, c.rec_t, c.enabled
FROM alphataco_services sv
JOIN alphataco_instances i ON i.id = sv.instance_id AND i.slug = 'demo'
JOIN (VALUES
    ('app',     'app_health',         NULL,                      'critical', 3,  2, TRUE),
    ('app',     'container',          NULL,                      'critical', 2,  2, TRUE),
    ('api',     'api_capabilities',   NULL,                      'high',     3,  2, TRUE),
    ('api',     'container',          NULL,                      'critical', 2,  2, TRUE),
    ('api',     'sha_match',          NULL,                      'medium',   15, 1, TRUE),
    ('db',      'db_via_health',      NULL,                      'critical', 2,  2, TRUE),
    ('db',      'container',          NULL,                      'critical', 2,  2, TRUE),
    ('db',      'tcp',                '<appName de alphataco-db>:5432', 'critical', 3, 2, FALSE),
    ('storage', 'storage_via_health', NULL,                      'high',     3,  2, TRUE),
    ('storage', 'container',          NULL,                      'high',     2,  2, TRUE),
    ('storage', 'tcp',                'alphataco-storage:9000',  'high',     3,  2, FALSE)  -- alias en dokploy-network (runbook:346)
) AS c(svc_key, type, target, severity, fail_t, rec_t, enabled) ON c.svc_key = sv.key
ON CONFLICT (service_id, type, COALESCE(target, '')) DO UPDATE
SET severity = EXCLUDED.severity, fail_threshold = EXCLUDED.fail_threshold,
    recover_threshold = EXCLUDED.recover_threshold, updated_at = NOW();
```

---

## 3. Endpoints REST

**Autenticación de todo el grupo:**

```go
r.Route("/api/alphataco", func(r chi.Router) {
    r.Use(middleware.Auth(authService))
    r.Use(middleware.RequireCapability(capabilityRepo, model.CapabilityAlphatacoConsole))
    ...
})
```

- **No lleva `RequireRole` ni `ReadOnlyForRole`:** decide la capability, sea cual sea el rol.
- Sin token, 401 (`middleware/auth.go:18-34`). Con token pero sin capability, 403 `{"error":"forbidden"}`.
- **Todas** las rutas `/api/alphataco/*` pasan por el grupo. No hay ninguna fuera.
- `RequireCapability` hace una consulta `SELECT EXISTS(...)` por petición, contra la clave primaria. Así el permiso se revoca al instante, sin depender del JWT.

| Método y ruta                                                                             | Uso                                                                                     | Respuesta (200 salvo que se indique)                                                  |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `GET /api/auth/me` (**modificado**)                                                       | El frontend sabe si muestra el ítem                                                     | `User` + `"capabilities": ["alphataco_console"]` (o `[]`)                             |
| `GET /api/alphataco/overview`                                                             | Listado de la vista                                                                     | ver abajo                                                                             |
| `GET /api/alphataco/instances/{id}`                                                       | Detalle de una instancia                                                                | ver abajo · 404 si no existe                                                          |
| `GET /api/alphataco/checks/{id}/results?limit=60`                                         | Historial de un chequeo. `limit` va de 1 a 500, por defecto 60                          | `[{checked_at, result, latency_ms, http_status, error, sha}]`, el más nuevo primero   |
| `GET /api/alphataco/incidents?state=open\|resolved\|all&instance_id=&limit=50&before_id=` | Incidentes y su historial. Paginación por cursor (`id < before_id`). `limit` máximo 200 | `{ "items": [Incident], "next_before_id": 123 \| null }`                              |
| `PATCH /api/alphataco/instances/{id}`                                                     | Pausar o reanudar el monitoreo. Es la única escritura de F1                             | body `{"monitoring_enabled": false}` → `InstanceSummary` · 400 si el body es inválido |

**`GET /api/alphataco/overview`:**

```json
{
  "dokploy": { "configured": true, "state": "ok" | "unreachable" | "not_configured", "since": "…|null" },
  "last_tick_at": "2026-10-22T15:04:00Z",
  "instances": [{
    "id": 1, "slug": "demo", "name": "Alphataco demo", "environment": "demo",
    "app_url": "https://…", "monitoring_enabled": true,
    "status": "ok" | "failing" | "down" | "unknown" | "paused",
    "app_sha": "ad81b21f…", "app_sha_changed_at": "…", "api_sha": "ad81b21f…",
    "last_checked_at": "…", "open_incidents": 0,
    "services": [{ "id": 1, "key": "app", "label": "alphataco-app", "kind": "app", "status": "ok" }]
  }]
}
```

- `status` de un servicio = el peor de sus chequeos habilitados, con el orden `down > failing > unknown > ok`. El de la instancia es el peor de sus servicios, o `paused` si `monitoring_enabled = false`.
- `last_tick_at` = `max(last_checked_at)` **de las instancias con `monitoring_enabled`**. Es `null` si no hay ninguna habilitada, y en ese caso la vista no muestra el aviso de «monitor detenido». Sale de la base, no de la memoria del proceso: sirve también con dos réplicas.
- `dokploy.state` sale de si hay un incidente `dokploy_unreachable` abierto, más `configured` (que viene del entorno).

**`GET /api/alphataco/instances/{id}`:**

- Devuelve lo mismo que un elemento de `instances`, más `api_url`, `host_label`, `dokploy_project`, `dokploy_environment`, `check_interval_s`, `deploy_grace_until` y `notes`.
- Además, `services[].checks[]` con: `{id, type, target, severity, enabled, status, consecutive_fail, consecutive_ok, fail_threshold, recover_threshold, last_result, last_checked_at, last_ok_at, last_latency_ms, last_error}`.
- No incluye los incidentes: la vista los pide aparte con `instance_id`.

**`Incident`:** `{id, instance_id, instance_slug, service_id, service_label, check_id, kind, severity, summary, last_error, fail_count, opened_at, last_seen_at, resolved_at, resolution}`.

**Reglas de la API:**

- `last_error` y `error` se truncan a 300 caracteres y **nunca** llevan encabezados ni URLs con credenciales (§4.5).
- Las listas salen como `[]`, nunca `null` (mismo criterio que `repository/project_env.go:43-49`).
- **Fuera de F1:** el ABM completo de instancias, servicios y chequeos por API o UI, el acuse de incidentes y el silencio manual. Cargar una instancia nueva en F1 es el SQL de §2.3; el ABM con formulario llega cuando haya más de una instancia (F2, con `new.sh`).

---

## 4. Job de chequeos (`AlphatacoMonitor`)

### 4.1 Ciclo

- `Start(ctx)` hace una pasada inicial y después **una cada 15 s** (ticker). Cada pasada tiene `recover()` y log de errores, igual que `meeting_reminder.go:57-62`.
- Cada pasada:
  1. **Claim de las instancias que tocan** (seguro con varias réplicas, con el mismo criterio que `ClaimReminder` en `repository/meeting.go:341-343`):
     ```sql
     UPDATE alphataco_instances
     SET next_check_at = NOW() + make_interval(secs => check_interval_s)
     WHERE monitoring_enabled AND next_check_at <= NOW()
     RETURNING id, app_url, api_url, app_sha, deploy_grace_until;
     ```
     Con `check_interval_s = 60`, cada instancia se chequea una vez por minuto, con una variación de ±15 s.
  2. Se procesan las instancias en paralelo, **como máximo 4 a la vez** (semáforo con un canal; sin dependencias nuevas). Toda la pasada tiene un **plazo de 40 s** (`context.WithTimeout`).
  3. Dentro de cada instancia, **las sondas corren en paralelo** (`sync.WaitGroup`) y llenan un `InstanceSnapshot`:
     - **una sola** llamada a `/api/health`, que alimenta tres chequeos: `app_health`, `db_via_health` y `storage_via_health`;
     - una a `/capabilities`, si hay `api_url`;
     - una TCP por cada chequeo `tcp` habilitado;
     - una a Dokploy por cada servicio que tenga `dokploy_app_name` y un chequeo `container` habilitado. En la demo son 4 por minuto.
  4. El evaluador puro convierte el snapshot en un `Outcome` (`ok`, `fail` o `unknown`) por chequeo. Después, **una transacción por chequeo** hace tres cosas:
     - actualiza el estado vivo;
     - inserta el resultado;
     - abre, actualiza o cierra el incidente.
       Los contadores y el incidente nunca quedan desparejos.
  5. Si cambió el `sha` de la app (y había uno anterior), se actualizan `app_sha` y `app_sha_changed_at`, y se fija `deploy_grace_until = NOW() + 5 min`. `api_sha` se guarda siempre.
  6. Se actualiza `last_checked_at` de la instancia (`TouchInstance`).
  7. Se cierran con `resolution = 'check_disabled'` los incidentes abiertos cuyo **chequeo o servicio** está deshabilitado.

**Pausa (`monitoring_enabled = false`):**

- La instancia deja de chequearse.
- **No se cierra nada:** sus incidentes abiertos quedan abiertos, porque no hay dato nuevo que diga que se resolvieron.
- La vista la muestra como «Pausado».
- Se cierran cuando se reanuda el monitoreo y el chequeo se recupera.

### 4.2 Sondas, tiempos de espera y evaluación

| Sonda                                      | Tiempo de espera                                                                                                                                                                                                                                               | Qué es `ok`, qué es `fail` y qué es `unknown`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET {app_url}/api/health`                 | cliente con `Timeout` total de **5 s**; _dial_ 3 s, TLS 3 s; cuerpo leído con `io.LimitReader` de 64 KiB; **no sigue redirecciones** (`CheckRedirect` devuelve `http.ErrUseLastResponse`, y un 3xx es `fail`); TLS verificado; `User-Agent: TaskApp-Monitor/1` | **`app_health`:** `ok` si responde 200 o 503 con JSON válido (el proceso está vivo); `fail` ante timeout, conexión rechazada, DNS, TLS, otro código o JSON inválido. **`db_via_health`:** `fail` si responde 503 con `status = "db_unavailable"`, `ok` si responde 200 con `status = "ok"`, y `unknown` si la app no respondió. **`storage_via_health`:** `ok` si `storage = "ok"`, `fail` si `storage = "error"`, y `unknown` en cualquier otro caso (sin campo, o la app sin responder). El contrato es el de `alphataco/src/app/api/health/route.ts:66-77` [verificado] |
| `GET {api_url}/api/mobile/v1/capabilities` | igual que el anterior                                                                                                                                                                                                                                          | `ok` si responde 200 y el JSON trae `apiVersion`; si no, `fail`. Se guarda `serverSha`. **Ojo:** un 200 no prueba que respondió el contenedor `api`, porque `app` y `api` corren la misma imagen (propuesta §2.5). La liveness real del `api` la da su chequeo `container`                                                                                                                                                                                                                                                                                                 |
| `sha_match` (derivado)                     | sin E/S                                                                                                                                                                                                                                                        | `ok` si `api_sha == app_sha`; `fail` si difieren; `unknown` si falta alguno de los dos. Con umbral 15 y un tick por minuto, se abre solo si quedan desparejos 15 minutos seguidos                                                                                                                                                                                                                                                                                                                                                                                          |
| `tcp`                                      | `net.Dialer{Timeout: 3s}`                                                                                                                                                                                                                                      | `ok` si conecta (y cierra enseguida); si no, `fail`. No autentica ni envía datos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `container` (Dokploy)                      | **5 s**; cuerpo de hasta 256 KiB                                                                                                                                                                                                                               | `ok` si **al menos un** contenedor está en `running`. Swarm guarda el historial de tareas viejas en `exited`, así que no se exige que estén todos. `fail` si la lista está vacía o ninguno está en `running`. **`unknown` si Dokploy falló o no está configurado**                                                                                                                                                                                                                                                                                                         |

**Qué sale `unknown` por culpa del propio monitor:** si se agota el plazo de la pasada o el contexto se cancela, el error es del monitor y no de la instancia. Esas sondas salen `unknown`, **no** `fail`.

**Errores en español y sin datos sensibles.** `alphataco_probes.go` traduce los errores a textos cortos: «tiempo de espera agotado (5 s)», «conexión rechazada», «certificado TLS inválido», «HTTP 502», «redirige a otra URL», «respuesta no es JSON». Así `last_error` es legible y no arrastra datos internos.

### 4.3 Anti-ruido: máquina de estados por chequeo

`Transition` es una función pura:

| Resultado | Contadores                                                     | Incidente                                                                                                                                                                                                  | `status`                                                        |
| --------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `ok`      | `consecutive_ok++`, `consecutive_fail = 0`, `last_ok_at = now` | Si hay uno abierto y `consecutive_ok >= recover_threshold`, se **cierra** (`resolution = 'recovered'`)                                                                                                     | `ok` si no queda ninguno abierto; si no, `down` (recuperándose) |
| `fail`    | `consecutive_fail++`, `consecutive_ok = 0`                     | Si hay uno abierto, se actualizan `last_seen_at`, `fail_count++` y `last_error`. Si no hay y `consecutive_fail >= fail_threshold`, **no** hay gracia de deploy y la instancia no está pausada, se **abre** | `down` si hay uno abierto; si no, `failing`                     |
| `unknown` | **sin cambios**                                                | sin cambios                                                                                                                                                                                                | `down` si hay uno abierto; si no, `unknown`                     |

**Parámetros (los del seed):**

| Chequeo                         | Abre tras | Cierra tras | Severidad                 | Tiempo hasta abrir (tick de 60 s) |
| ------------------------------- | --------- | ----------- | ------------------------- | --------------------------------- |
| `app_health`                    | 3 fallas  | 2 OK        | crítica                   | ~3 min                            |
| `db_via_health`                 | 2         | 2           | crítica                   | ~2 min                            |
| `storage_via_health`            | 3         | 2           | alta                      | ~3 min                            |
| `api_capabilities`              | 3         | 2           | alta                      | ~3 min                            |
| `container`                     | 2         | 2           | crítica (alta en storage) | ~2 min                            |
| `tcp`                           | 3         | 2           | la del servicio           | ~3 min                            |
| `sha_match`                     | 15        | 1           | media                     | 15 min                            |
| `dokploy_unreachable` (monitor) | 3 pasadas | 2 pasadas   | media                     | ~3 min                            |

**Deduplicación:**

- Los índices únicos parciales `WHERE resolved_at IS NULL` garantizan **un solo incidente abierto por chequeo**, y uno por `kind` para los del monitor.
- El alta usa `INSERT … ON CONFLICT (check_id) WHERE resolved_at IS NULL AND check_id IS NOT NULL DO UPDATE SET last_seen_at = NOW(), fail_count = alphataco_incidents.fail_count + 1, last_error = EXCLUDED.last_error`. Así, aunque dos réplicas compitan, nunca se duplica.

**Supresión por dependencia:** si la app no responde, `db_via_health` y `storage_via_health` quedan `unknown`. Una caída de la app abre **un** incidente, no tres.

**Gracia de deploy:** cuando aparece un `sha` nuevo, durante 5 minutos no se abren incidentes. Los contadores siguen sumando: si al terminar la gracia el chequeo sigue fallando por encima del umbral, el incidente se abre en la pasada siguiente. Cerrar sí está permitido durante la gracia.

- **Alcance real de la gracia:** el `sha` nuevo recién se ve cuando el deploy **ya terminó**, así que la gracia no cubre la caída _durante_ el redeploy. Esa caída la absorbe el umbral (3 fallas son unos 3 min). La gracia cubre el aleteo posterior: el `sha_match` desparejo mientras la API se pone al día y los arranques en frío.
- Si en la práctica no aporta, se saca sin migración: alcanza con no fijar `deploy_grace_until`.

**`summary` al abrir.** Se arma en español a partir del tipo de chequeo. Por ejemplo:

- «alphataco-app no responde en /api/health»
- «La base de alphataco-db no responde (la app devuelve db_unavailable)»
- «El storage de la instancia demo devuelve error»
- «La API móvil y la app tienen versiones distintas desde hace 15 min»
- «No hay ningún contenedor running de alphataco-api»

### 4.4 Retención

- **Purga horaria.** La corre el mismo monitor (guarda `lastPurge` en memoria) y también una vez al arrancar. Va dentro de una transacción protegida por `pg_try_advisory_xact_lock(hashtext('alphataco_purge'))`: si hay dos réplicas, purga una sola.
  - `alphataco_check_results` con `checked_at < NOW() - 7 days`, **en lotes de 5000** (`DELETE … WHERE id IN (SELECT id … LIMIT 5000)` en un bucle), hasta que un lote borre menos de 5000.
  - `alphataco_incidents` resueltos hace más de **180 días**. El historial de incidentes vale mucho más que los resultados crudos y crece muy despacio.
- **Volumen esperado en la demo:** 9 chequeos habilitados × 1440 por día ≈ **13 000 filas por día**, unas 91 000 en 7 días (algunos MB). No hace falta agregar resultados.

### 4.5 Si Dokploy no responde (y la configuración del adaptador)

**Configuración** (`main.go`):

- `DOKPLOY_API_URL` (por ejemplo `http://dokploy:3000` desde `dokploy-network`, o `http://31.97.42.82:3000`; se decide en el paso 0) y `DOKPLOY_API_KEY`.
- Si falta cualquiera de las dos, `Configured() = false`: los chequeos `container` quedan en `unknown`, la vista muestra «Dokploy sin configurar» y **no** se abre ningún incidente.
- Al arrancar, el log dice `[alphataco] dokploy: configurado` o `sin configurar`. **Nunca se imprime el valor.**

**Llamada** [supuesto, se confirma en el paso 0]:

- `GET {DOKPLOY_API_URL}/api/docker.getContainersByAppNameMatch?appName=<appName>[&appType=docker-compose]`, con el encabezado `x-api-key`.
- `appType=docker-compose` solo para `dokploy_kind = 'compose'`. Las `application` y `postgres` son servicios de swarm y se buscan por nombre.
- Se toma `state` de cada contenedor.
- El header `x-api-key` y la forma de la API REST (`?param=` sobre los procedimientos tRPC) son los que documenta `~/.claude/docs/dokploy.md:19-24,65` [verificado como referencia].

**Garantía de solo lectura en el código:**

- El paquete expone **solo** `ContainersByAppName`.
- La ruta es una constante.
- El método es `GET`.
- No hay un cliente genérico «llamá a cualquier procedimiento».
- El texto de los errores no incluye ni encabezados ni el cuerpo completo.

**Circuito ante fallas.** Cuenta en memoria las pasadas con al menos un error de Dokploy y ningún éxito (timeout, 5xx, 401 o 403):

- Tras **3 pasadas fallidas seguidas**, se abre el incidente global `dokploy_unreachable`. El resumen es «Dokploy no responde desde TaskApp: los chequeos de contenedor quedan sin dato», o «Dokploy rechazó la API key» si fue 401 o 403.
- Mientras tanto, los chequeos `container` son `unknown`: **no suman fallas ni abren incidentes falsos** de caída de contenedores.
- **Backoff:** con el circuito abierto, solo se hace **una** llamada de prueba cada 5 min (no 4 por minuto).
- Tras **2 pasadas OK**, se cierra el incidente y vuelve el ritmo normal.
- Si el proceso se reinicia, los contadores vuelven a cero. Es aceptable: el incidente abierto sigue en la base, y se cierra solo cuando Dokploy responde 2 veces.

### 4.6 Repositorio: métodos

```go
type AlphatacoRepository interface {
    // Monitor
    ClaimDueInstances(now time.Time) ([]model.AlphatacoInstance, error)
    ListEnabledChecks(instanceID int64) ([]model.AlphatacoCheckWithService, error)
    // Una transacción: estado vivo + resultado + abrir/actualizar/cerrar el incidente.
    ApplyCheckOutcome(in ApplyOutcomeInput) error
    UpdateInstanceShas(instanceID int64, appSha, apiSha *string, graceUntil *time.Time) error
    TouchInstance(instanceID int64, checkedAt time.Time) error // last_checked_at
    CloseIncidentsOfDisabledChecks() (int64, error)
    OpenOrTouchMonitorIncident(kind, severity, summary, lastError string) error
    ResolveMonitorIncident(kind string) error
    PurgeOldData(resultsBefore, incidentsBefore time.Time, batch int) (int64, error)
    // Vista
    Overview() (*model.AlphatacoOverview, error)
    InstanceDetail(id int64) (*model.AlphatacoInstanceDetail, error) // nil si no existe
    CheckResults(checkID int64, limit int) ([]model.AlphatacoCheckResult, error)
    ListIncidents(f model.IncidentFilter) ([]model.AlphatacoIncident, error)
    SetMonitoringEnabled(id int64, enabled bool) (*model.AlphatacoInstanceSummary, error)
}
```

`Overview` arma todo en **3 consultas** (instancias, servicios con el peor estado agregado en SQL, y conteo de incidentes abiertos por instancia), no en N+1.

### 4.7 Limitación conocida: el vigilante corre en la misma VPS

- El monitor vive en el backend de TaskApp, en `31.97.42.82`, **la misma VPS que la demo** (propuesta §1.5, verificado allá con `docker ps`). **Si esa VPS cae, cae también el vigilante y nadie se entera.**
- En F1 esto se acepta y se deja escrito. La vista lo hace visible a su manera: si `last_tick_at` tiene más de 3 minutos, aparece «El monitor no corre desde hace X».
- Pero eso solo sirve si TaskApp está arriba. El vigilante externo es parte de F2 (propuesta §2.5).

---

## 5. Vista

### 5.1 Rutas y estructura

- **`/alphataco`** → `AlphatacoPage`:
  - `PageHeader` con icono `Activity`, título «Alphataco» y la descripción «Estado de las instancias y sus incidentes».
  - `MonitorBanner`.
  - `Tabs` (variante `line`, como `settlements.tsx:39-50`) con «Instancias» e «Incidentes».
  - **«Instancias»:** grilla de `InstanceCard`, de 1 columna en móvil y 2 desde `md`. Cada tarjeta muestra:
    - nombre, entorno y estado general (pill);
    - una fila por servicio con su pill;
    - el sha de la app, corto (`font-mono`, 8 caracteres, el completo en `title`), con «hace X» (`app_sha_changed_at`);
    - una advertencia si `api_sha` ≠ `app_sha`;
    - el último chequeo («hace X»);
    - la cantidad de incidentes abiertos.
    - Toda la tarjeta es **un único `<Link>`** al detalle, con nombre accesible: «Ver instancia Alphataco demo».
  - **«Incidentes»:** filtro «Abiertos / Resueltos / Todos» (`FilterSelect` del sistema) e `IncidentsTable`. Columnas: Estado, Severidad, Instancia y servicio, Qué pasó (`summary` y `last_error`), Abierto, Duración y Resuelto. «Cargar más» usa `next_before_id`.
- **`/alphataco/instancias/:id`** → `AlphatacoInstancePage`:
  - Encabezado con nombre, entorno, el enlace a `app_url` (`target="_blank" rel="noreferrer"`), el sha de la app y el de la API (con botón de copiar, `aria-label="Copiar sha"`; reusa `use-copy-value.ts`) y la gracia de deploy, si está activa.
  - Botón «Pausar monitoreo» / «Reanudar», con un `AlertDialog` de confirmación (no `window.confirm`).
  - Una sección por servicio (`<section>` con `<h2>`), con su pill y la lista de chequeos (`CheckRow`). Cada `CheckRow` muestra:
    - el tipo, traducido («Responde /api/health», «Base vía health», «Contenedor en Dokploy», …);
    - el estado, con su progreso: «Fallando 2/3» o «Recuperándose 1/2»;
    - la latencia, el último OK y el último error;
    - un botón «Ver historial» (`aria-expanded` y `aria-controls`) que despliega los últimos 60 resultados (`useCheckResults`, `enabled` solo con la fila abierta). Ese historial es una tabla con hora, resultado, latencia, HTTP y error, más una tira de celdas de color **con el texto del resultado en `sr-only`**.
  - Abajo, `IncidentsTable` filtrada por `instance_id`, con `state=all`.

### 5.2 Datos

| Hook                                         | Petición                            | Refresco                                                                                                                 |
| -------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `useAlphatacoOverview`                       | `GET /overview`                     | `refetchInterval: 30_000`, `staleTime: 15_000`. Sin refresco con la pestaña oculta (el valor por defecto de React Query) |
| `useAlphatacoInstance(id)`                   | `GET /instances/{id}`               | 30 s                                                                                                                     |
| `useCheckResults(checkId, open)`             | `GET /checks/{id}/results?limit=60` | solo con la fila abierta; 30 s                                                                                           |
| `useAlphatacoIncidents({state, instanceId})` | `GET /incidents`                    | 30 s. `useInfiniteQuery` con `next_before_id`                                                                            |
| `useSetInstanceMonitoring`                   | `PATCH /instances/{id}`             | `onSuccess`: invalida `["alphataco"]` y muestra un toast con el resultado real                                           |

- Las `queryKey` cuelgan todas de `["alphataco", …]`, para invalidarlas juntas.
- Los errores se leen con el mismo patrón que `settlementError` (`use-settlements.ts:5-10`).
- **No hay SSE en F1.** Sondear cada 30 s alcanza para dos usuarios y no toca `realtime/hub.go`.

### 5.3 Estados

**Carga:** `Skeleton` con la forma final: 2 tarjetas en el listado y 4 secciones en el detalle. El contenedor lleva `aria-busy="true"`.

**Error:** `QueryError` con «Reintentar» (`src/components/system/query-error.tsx`).

- 403 tiene su propio texto: «No tenés permiso para la sala de control». Puede pasar si se revoca el permiso con la vista abierta.
- 401 lo maneja el interceptor (`api/client.ts:19-28`).

**Vacío:**

- **Sin instancias:** `EmptyState` «Todavía no hay instancias registradas», con la pista «Se registran con `db/seeds/alphataco_demo.sql` (ver el blueprint F1)».
- **Sin incidentes abiertos:** el texto depende de si el monitor está vivo, para que «no hay incidentes» nunca afirme una buena noticia sin datos:
  - con el monitor al día (`last_tick_at` de menos de 3 minutos): «Sin incidentes abiertos · N chequeos activos · último chequeo hace X»;
  - con `last_tick_at` viejo, o nulo cuando hay instancias habilitadas: «El monitor no registra chequeos desde hace X: que no haya incidentes no significa que esté todo bien»;
  - con todas las instancias pausadas: «El monitoreo está pausado en todas las instancias».
- **Historial vacío:** «Este chequeo todavía no corrió».

**`MonitorBanner`:** usa `role="status"`, siempre montado, y solo cambia el texto. Sus casos:

- monitor detenido;
- Dokploy sin configurar (neutral);
- Dokploy sin responder (advertencia, «los chequeos de contenedor están sin dato»).

**Estado → pill** (`src/lib/alphataco-status.ts`; el texto va **siempre**, nunca solo el color):

| Estado    | Texto                         | Variante             | Icono (`aria-hidden`) |
| --------- | ----------------------------- | -------------------- | --------------------- |
| `ok`      | «OK»                          | `success`            | `CheckCircle2`        |
| `failing` | «Fallando 2/3»                | `warning`            | `AlertTriangle`       |
| `down`    | «Caído» o «Recuperándose 1/2» | **`danger`** (nueva) | `XCircle`             |
| `unknown` | «Sin dato»                    | `neutral`            | `HelpCircle`          |
| `paused`  | «Pausado»                     | `neutral`            | `PauseCircle`         |

### 5.4 Acceso en el frontend

- **Sidebar:** `const canConsole = hasCapability(useMe().data ?? user, "alphataco_console")`. Grupo «Operación» con un `menuItem` (`app-sidebar.tsx:517`) a `/alphataco`.
  - **No lleva un contador de incidentes.** El usuario pidió que las alertas se vean solo en la vista nueva.
- **`CapabilityRoute`:**
  - Lee `useMe()`.
  - Mientras `isPending`, muestra un esqueleto, **no** redirige. El usuario que persiste `auth-store` (`stores/auth-store.ts:15-29`) puede venir de un login sin `capabilities`, y redirigir antes de tiempo sacaría a Yordan cuando entra por un enlace directo.
  - Si `/me` responde sin la capability, `<Navigate to="/" replace />`. Si `/me` falla con algo que no es 401, también redirige a `/`.
  - **La protección real es el backend.** Esto solo evita mostrar una pantalla vacía.

### 5.5 Accesibilidad y responsive

Se aplicó la skill `ibelick/fixing-accessibility`:

- Nombres accesibles en los botones que son solo un icono (copiar sha, desplegar historial).
- Iconos decorativos con `aria-hidden`.
- Tarjeta clicable = un único `<Link>`, sin controles anidados.
- Tablas con `<th scope="col">`.
- Fechas en `<time dateTime={iso} title={absoluteDateTime(iso)}>` (`src/lib/relative-time.ts`).
- Foco visible: el de los componentes de UI, sin `outline-none` sin reemplazo.
- `aria-expanded` y `aria-controls` en los desplegables.
- El estado nunca se comunica solo con color.
- La región `role="status"` existe siempre en el DOM.
- `tabular-nums` en latencias y contadores.
- Las tablas van dentro de `scroll-x-pane` (`src/index.css:437`), con el mismo patrón que `settlements.tsx:244`.
- Se verifica a 390 px que `document.documentElement.scrollWidth <= clientWidth`.

---

## 6. Orden de implementación (pasos chicos y verificables)

Ninguno de estos pasos incluye un commit. Las reglas de commit y PR del usuario se aplican recién cuando él lo pida.

| #     | Paso                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Cómo se verifica                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0** | **Relevamiento de solo lectura** (resuelve los [supuesto]). Por SSH a `31.97.42.82`, sin imprimir secretos (la key se lee de `~/.dokploy_key` dentro del comando, como en `dokploy.md:24`): **(a)** `appName` de `alphataco-app`, `alphataco-db` y del compose `alphataco-storage`, con `project.all` u `environment` vía API GET. **(b)** `GET /api/docker.getContainersByAppNameMatch` para los tres tipos: confirmar la forma de la respuesta y el campo `state`, y si hace falta `appType`. **(c)** Desde el contenedor `taskapp-backend` (`docker exec … wget -qO- …`): `https://alphataco.31.97.42.82.sslip.io/api/health` y `/api/mobile/v1/capabilities` (¿funciona el _hairpin_?), `http://dokploy:3000/api/…` contra `http://31.97.42.82:3000` (cuál responde), y `nc -z` a `<db>:5432` y `alphataco-storage:9000`. **(d)** `SELECT id, email, name, role FROM users` para identificar a Yordan y Fabricio. **(e)** Volver a confirmar que 066 está libre | Una tabla con los resultados, agregada a este documento. Se completan los placeholders del seed y se decide `DOKPLOY_API_URL` y qué tcp se habilitan                                                                                                                                                                                                                                                                                                                       |
| 1     | Migración 066, `model/capability.go`, `repository/capability.go`, `middleware/capability.go`, `Me` con `capabilities` y su cableado en `main.go`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `go build ./... && go vet ./cmd/... ./internal/... ./db/...`. Local: `docker compose up -d postgres` y `go run ./cmd/server`; registrar un usuario, `curl /api/auth/me` → `"capabilities":[]`; otorgar por SQL → `["alphataco_console"]`                                                                                                                                                                                                                                   |
| 2     | Migración 067, `model/alphataco.go`, las lecturas del repositorio, `service/alphataco.go`, `handler/alphataco.go` y las rutas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Build y vet. Local: cargar una instancia de prueba que apunte al Alphataco local (`http://localhost:3000`) o a una URL inexistente. Con el usuario sin capability, `curl` a las 5 rutas → **403** en todas. Con capability → 200 y el JSON de §3. Sin token → 401                                                                                                                                                                                                          |
| 3     | `alphataco_probes.go`, `alphataco_evaluator.go` y `alphataco_monitor.go`, **sin Dokploy** (inspector no configurado)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Local con la instancia «caída» (URL inexistente): a los ~3 min hay **un** incidente `app_health` abierto y `db`/`storage` en `unknown` (sin incidentes). `SELECT count(*) … WHERE resolved_at IS NULL` = 1 aunque pasen 10 minutos. Corregir la URL por SQL → se cierra tras 2 OK. Con un Alphataco local que tenga la base apagada → incidente `db_via_health` y `app_health` OK                                                                                          |
| 4     | `dokploy_client.go` y el circuito                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Local con un túnel SSH (`ssh -L 3000:localhost:3000 yordan@31.97.42.82`) y las variables puestas en la shell **sin hacer `echo`**: los chequeos `container` de la demo en `ok`. Con una URL o key incorrecta → `container` en `unknown` y, tras 3 pasadas, **un** `dokploy_unreachable`. Arreglado → se cierra tras 2                                                                                                                                                      |
| 5     | Purga                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Insertar a mano resultados con `checked_at = NOW() - interval '8 days'`, reiniciar (la purga corre al arrancar) y comprobar que se borraron y que los recientes siguen                                                                                                                                                                                                                                                                                                     |
| 6     | Frontend: tipos, `capabilities.ts`, `use-me.ts`, `main-layout`, `CapabilityRoute`, rutas, sidebar y la variante `danger`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `pnpm lint && pnpm build`. Navegador con lectura de texto (snapshot), no capturas: el usuario con capability ve «Alphataco»; uno sin ella no la ve y `/alphataco` lo manda a `/`; recargar `/alphataco` estando habilitado **no** rebota                                                                                                                                                                                                                                   |
| 7     | API, hooks y páginas (listado, detalle e incidentes) con todos los estados                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Lint y build. En el navegador: carga, error (backend apagado → `QueryError`), vacío (sin instancias), una instancia caída en rojo con el texto «Caído», el historial desplegable y la pausa con confirmación. Recorrido completo con el teclado y control de desborde a 390 px                                                                                                                                                                                             |
| 8     | **Puesta en producción** (cuando el usuario lo pida): cargar `DOKPLOY_API_URL` y `DOKPLOY_API_KEY` en el entorno de la app `taskapp-backend` en Dokploy (**nunca en el `Dockerfile`**), deploy (las migraciones corren solas al arrancar), SQL de §2.1 (otorgar el permiso) y seed de §2.3 con los placeholders completos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Log `[alphataco] dokploy: configurado`. Demo en verde. Una instancia temporal `prueba-caida` con URL inexistente abre **un** incidente que se ve **solo** en la vista. Corregir la URL por SQL lo cierra con `recovered`, o deshabilitar el chequeo lo cierra con `check_disabled`. Después, la instancia de prueba se **pausa** (no se borra: el `DELETE` hace cascada y se lleva el historial). Un admin sin capability recibe 403 en `/api/alphataco/*` y no ve el ítem |

**Cómo seedear la demo:** con el paso 0 hecho, se completan los `<…>` de `db/seeds/alphataco_demo.sql` y se corre una vez contra la base de TaskApp:

```bash
docker exec -i <contenedor postgres de taskapp> psql -U <usuario> -d <base> < db/seeds/alphataco_demo.sql
```

Volver a correrlo no duplica nada: actualiza.

---

## 7. Decisiones y riesgos

### 7.1 Decisiones

1. **Permiso explícito por usuario (`capabilities` y `user_capabilities`) en vez de un rol o una variable de entorno.** Es la decisión del usuario, y además tiene un fundamento técnico:
   - `POST /api/auth/register` es público (`main.go:281`).
   - `Register` no fija el rol (`service/auth.go:53-57`), y `Create` le pone `admin` por defecto (`repository/user.go:30-31`).
   - Es decir: **cualquiera que se registre es admin**. Proteger con el rol sería abrir la sala a cualquiera.
   - El catálogo con FK evita otorgar claves mal escritas, y el middleware consulta la base en cada petición, así que la revocación es inmediata.
2. **El permiso se otorga con SQL manual verificado y no desde la migración.** No hay emails en el repo, y el único patrón existente (`LIKE '%spiritosi%'`, `065:89`) no sirve para autorizar.
3. **El seed de la demo es un script manual, no una migración.** Si fuera migración, todas las bases locales vigilarían la demo real. Sin instancias, el monitor no hace nada: no hace falta un interruptor por entorno.
4. **Una sola llamada a `/api/health` por instancia, con chequeos derivados y el valor `unknown`.**
   - Reduce el tráfico.
   - Hace que la caída de la app abra un incidente y no tres.
   - Evita que la falta de dato de una fuente (Dokploy o el propio monitor) cuente como caída.
5. **El claim se hace con `next_check_at`, en un `UPDATE … RETURNING`, en vez de un lock de sesión.** Es el patrón de `ClaimReminder`, funciona bien con el pool de `database/sql` y deja la frecuencia en cada instancia. La purga sí usa `pg_try_advisory_xact_lock`, que va dentro de una transacción y por eso no tiene problema con el pool.
6. **Contadores e incidente en una sola transacción por chequeo, más índices únicos parciales.** La deduplicación la garantiza la base, no la memoria del proceso.
7. **El estado vive dentro de `alphataco_checks`** (no en la tabla aparte `alphataco_check_state` de la propuesta). Es 1:1 con el chequeo: una tabla menos y un JOIN menos en cada lectura.
8. **No se usa `applicationStatus` de Dokploy como señal de salud.** Es el resultado del último deploy, no si el servicio está vivo (devuelve `done` aunque el contenedor esté caído; propuesta §2.5). La liveness sale de los contenedores en `running` (`docker.getContainersByAppNameMatch`) y de los chequeos HTTP.
9. **Los `tcp` entran deshabilitados** hasta que el paso 0 demuestre que el contenedor de TaskApp llega a la red de la base y del storage. El chequeo `container` de Dokploy ya cubre «está corriendo».
10. **Sin notificaciones y sin contador en el sidebar.** Es lo que pidió el usuario: las alertas se ven solo en `/alphataco`.
11. **Sondeo cada 30 s, sin SSE.** Lo usan dos personas: no justifica tocar `realtime/hub.go`.
12. **ABM de instancias fuera de F1.** Hay una sola instancia, y el alta de nuevas llega con `new.sh` (F2). La única escritura de F1 es pausar o reanudar, que hace falta en mantenimiento.

### 7.2 Secretos (decisión con recomendación)

| Opción                                                                      | A favor                                                                                                       | En contra                                                                                                                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Variable de entorno del contenedor (`DOKPLOY_API_KEY`)**               | Cero código de cifrado. No entra en los respaldos de la base. Se rota en Dokploy y se redeploya               | Cualquiera con acceso al panel de Dokploy la ve. Es un único secreto global                                                                           |
| B. Tabla cifrada (AES-256-GCM, `key_version` y clave maestra en el entorno) | Escala a muchos secretos por instancia, se puede rotar desde la UI y la API los escribe sin devolverlos nunca | Para **un** secreto global no protege más que A (el proceso necesita la clave maestra en el mismo entorno). Suma código y una clave más que custodiar |

**Recomendación: A en F1. B queda diseñada para F2**, cuando aparezcan los secretos por instancia (claves SSH, `ADMIN_STATUS_TOKEN`). El diseño de F2:

- Tabla `alphataco_secrets(id, scope, name, ciphertext bytea, nonce bytea, key_version smallint, created_at, rotated_at)`.
- AES-256-GCM con la biblioteca estándar (`crypto/aes`, `crypto/cipher`), con _nonce_ aleatorio de 12 bytes y AAD = `scope|name`. Así un texto cifrado copiado a otra fila no descifra.
- Claves maestras `ALPHATACO_SECRETS_KEY_V{n}` (32 bytes en base64) solo en el entorno.
- La API es de solo escritura: devuelve `has_secret: true`.
- Rotación: se descifra con la versión vieja y se cifra con la nueva.
- Alphataco ya tiene el mismo patrón (`src/shared/lib/arca/secrets.ts:9-18`, citado en la propuesta §2.4).

**Cuidados obligatorios con A:**

- **La key de Dokploy es de administrador total.** Puede desplegar, borrar y leer el `env` de todas las apps (propuesta §2.4). **Dokploy no tiene una key de solo lectura.** La lectura sola se garantiza en el adaptador (§4.5): un GET a un único procedimiento, sin ningún método de escritura.
- Mitigación adicional [supuesto, se verifica en el paso 0]: crear en Dokploy un usuario _member_ limitado al proyecto `alphataco` y generar la key con ese usuario. Achica el alcance, aunque no la hace de solo lectura.
- **No seguir el patrón del `Dockerfile`.** Hoy tiene credenciales escritas en claro (`Dockerfile:16-36`, sin reproducir acá), con el comentario de que «el panel no inyecta las env vars». Pero `DATABASE_URL` y `JWT_SECRET` sí llegan por el entorno (`main.go:32,122-128`), así que la inyección funciona. La key de Dokploy va **solo** en el entorno de Dokploy.
- No loguear la key, ni los encabezados, ni la URL completa de los errores.

### 7.3 Riesgos

| Riesgo                                                                                                                 | Impacto                                                         | Mitigación                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **El vigilante está en la misma VPS** (§4.7)                                                                           | Si `31.97.42.82` cae, no hay alerta                             | Aceptado en F1 y documentado. El aviso «el monitor no corre» solo sirve si TaskApp está arriba. Vigilante externo en F2          |
| Forma de `docker.getContainersByAppNameMatch`, `appType` y la URL de Dokploy desde el contenedor [supuesto]            | Los chequeos `container` quedan siempre en `unknown`            | Paso 0 antes de escribir el adaptador. Como último recurso, se apagan esos chequeos sin afectar el resto                         |
| _Hairpin_: el contenedor de TaskApp le pega al dominio público de su propia VPS [supuesto]                             | Falsas caídas de `app_health`                                   | Paso 0 (c). Si falla, `app_url` del monitor = la URL interna `http://<appName>:3000`, con la contra de que eso salta Traefik     |
| Un 200 de `capabilities` no prueba que esté vivo el contenedor `api`                                                   | Falso verde de la API                                           | El chequeo `container` del `api` es la liveness real (§4.2)                                                                      |
| Gracia de deploy de 5 min                                                                                              | Una caída real justo después de un deploy se ve 5 min más tarde | Los contadores siguen sumando y el incidente se abre en cuanto termina la gracia                                                 |
| Reset diario de la demo (00:05 AR)                                                                                     | Posibles fallas transitorias                                    | Los umbrales de 2 y 3 lo absorben. No se agrega silencio programado en F1 (la hora real del reset es dato abierto, propuesta §8) |
| El circuito de Dokploy está en memoria                                                                                 | Con dos réplicas o tras un reinicio, el conteo se reinicia      | El incidente vive en la base y la deduplicación la hace el índice. El único efecto es un poco de demora                          |
| Las migraciones no corren en transacción (`postgres.go:164`)                                                           | Una falla a mitad de camino deja objetos sueltos                | Todo con `IF NOT EXISTS` y `ON CONFLICT`: se reaplica sin error                                                                  |
| Choque de numeración: otro cambio toma 066 o 067 antes de implementar                                                  | La migración no se aplica o se pisa                             | Volver a confirmar en el paso 0 (e) y renumerar si hace falta                                                                    |
| **Fuera de alcance (solo se reporta):** registro público con rol `admin` por defecto (`main.go:281` y `user.go:31`)    | Cualquiera que se registre entra a `/api/admin/*`               | **No se toca en F1.** Se recomienda abrir un ticket aparte. La sala no depende del rol, así que no la afecta                     |
| **Fuera de alcance (solo se reporta):** `integration_test.go:70` no compila contra la firma actual de `NewAuthHandler` | `go vet ./...` y `go test ./...` fallan en la raíz              | En F1 se verifica por paquetes (§0). Corregirlo es tocar un test: va en otro ticket, con el OK del usuario                       |
| **Fuera de alcance (solo se reporta):** credenciales de S3 y de IA en claro en el `Dockerfile`                         | Quedan expuestas en el repo y en la imagen                      | Rotarlas y pasarlas al entorno, en otro ticket                                                                                   |

**Skills aplicadas en el diseño:**

- `ibelick/fixing-accessibility` (catálogo ui-skills), en §5.5.
- De las reglas de Vercel, en la implementación: `client-swr-dedup` (un único `useMe` compartido) y `bundle-dynamic-imports` (rutas `lazy`).
