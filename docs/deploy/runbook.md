# Runbook de deploy (Dokploy)

## Arquitectura

```
push a main ──► changes (filtro de paths: docs, *.md, .claude… no disparan)
                 ├─► verify: npm ci + check-types + vitest        (en paralelo)
                 └─► build:  imagen :sha-<commit> con GIT_SHA adentro → registry
                        │
                        ▼ (solo si verify y build pasaron)
                 deploy: retag :sha-<commit> → :main  →  webhook de Dokploy
                         → espera a que /api/health responda {"status":"ok","sha":"<commit>"}
```

- **La VPS no buildea.** Un `next build` ahí murió por falta de memoria (swap llena). La imagen se
  construye en GitHub Actions (`.github/workflows/_build-image.yml`) y se publica en
  `registry-31-97-42-82.sslip.io/alphataco`. Dokploy solo hace pull del tag `:main`.
- **Una imagen por commit.** El tag `:sha-<commit>` es inmutable; `:main` es un puntero que el job
  `deploy` mueve con `docker buildx imagetools create` (sin volver a subir capas). Si la imagen del
  commit ya existe (rerun, deploy manual), no se reconstruye.
- **El readiness compara el commit**, no solo `"ok"`: el contenedor viejo también responde sano, y
  Dokploy rota el contenedor de forma asíncrona después del webhook. Sin comparar el `sha`, el
  deploy daría verde contra la versión anterior.
- **Cache de capas** en el propio registry (`alphataco:buildcache`), no en el cache de GitHub.
  Los `RUN --mount=type=cache` (npm y `.next/cache`) se persisten con `actions/cache`.
- **Postgres y MinIO son servicios aparte en Dokploy**: no van en la imagen. El contenedor corre
  `prisma migrate deploy` en cada arranque (`docker/entrypoint.sh`) y después `node server.js`.
- `ci.yml` (check-types, vitest, tests de base con pgTAP, auth, jobs) sigue corriendo igual en
  push y PR. El deploy **no** espera a `db-tests`: repite solo `check-types` + `vitest` en su job
  `verify`, porque un workflow no puede depender de otro sin `workflow_run`, y `db-tests` levanta
  Postgres con compose (lento). Si `db-tests` falla después de un deploy, se ve en el run de CI.

### Archivos

| Archivo                              | Qué hace                                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `.github/workflows/deploy.yml`       | Orquesta: filtro de paths, `verify`, `build`, `deploy`. También `workflow_dispatch` (solo sobre `main`). |
| `.github/workflows/_build-image.yml` | Build + push de `:sha-<commit>`, cache en registry, soporte Blacksmith.                                  |
| `.github/workflows/_deploy.yml`      | Retag a `:main`, webhook, readiness por commit.                                                          |
| `Dockerfile`                         | `deps` → `tools` (CLI de Prisma + deps del seed) → `build` → `runner` (standalone).                      |
| `docker/entrypoint.sh`               | `migrate deploy`, seed opcional (`RUN_SEED=true`), `exec node server.js`.                                |
| `src/app/api/health/route.ts`        | `{"status":"ok","sha":GIT_SHA}` + `SELECT 1`. Sin auth (el proxy solo cubre `/dashboard/*`).             |

## GitHub: variables y secrets

**Settings → Secrets and variables → Actions.**

Secrets:

| Secret                   | Valor                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `REGISTRY_PASSWORD`      | Password del usuario CI del registry.                                               |
| `DOKPLOY_DEPLOY_WEBHOOK` | URL del webhook de deploy de la app en Dokploy (pestaña Deployments → Webhook URL). |

Variables:

| Variable                   | Valor                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REGISTRY_USERNAME`        | Usuario CI del registry. Es **variable, no secret**: como secret GitHub enmascara sus substrings en todos los logs.                                                                                 |
| `DOKPLOY_HEALTH_URL`       | `https://alphataco.31.97.42.82.sslip.io/api/health` (URL completa, terminada en `/api/health`; el deploy valida el formato).                                                                        |
| `NEXT_PUBLIC_BASE_URL`     | `https://alphataco.31.97.42.82.sslip.io` — **obligatoria**: si falta, el build se corta (no se hornea `localhost`).                                                                                 |
| `NEXT_PUBLIC_PROJECT_URL`  | `https://alphataco.31.97.42.82.sslip.io` — obligatoria.                                                                                                                                             |
| `NEXT_PUBLIC_POSTHOG_KEY`  | Project key de PostHog (pública por diseño). Vacía = sin analítica.                                                                                                                                 |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://us.i.posthog.com`                                                                                                                                                                          |
| `NEXT_PUBLIC_SHOW_LOGS`    | `false` en producción (default si no se carga).                                                                                                                                                     |
| `CI_RUNNER`                | Opcional. Vacía = `ubuntu-latest`. Con un label `blacksmith-*` el build usa el builder persistente de Blacksmith (requiere la app instalada en la organización). El deploy siempre corre en GitHub. |

Las `NEXT_PUBLIC_*` **se hornean en el bundle durante el build**: cargarlas en Dokploy no sirve, y
cambiarlas exige una imagen nueva (ver "Operación").

## Dokploy

Proyecto **Demos**, app `alphataco`:

- **Provider: Docker.** Imagen `registry-31-97-42-82.sslip.io/alphataco:main`, con las credenciales
  del registry. Con provider Docker, un Redeploy manual **no trae código nuevo**: solo vuelve a
  pullear `:main`. Lo que mueve `:main` es el job `deploy`.
- **Autodeploy: ON**, para que exista el webhook. El workflow lo llama después de mover el tag.
- **Puerto** 3000. Dominio `alphataco.31.97.42.82.sslip.io` con HTTPS.
- El `HEALTHCHECK` de la imagen pega a `/api/health` (start period 90 s: cubre las migraciones).

### Env runtime de la app

| Variable                                                                                          | Valor / nota                                                                                                                               |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                                                                                    | `postgresql://<user>:<pass>@<servicio-postgres>:5432/<db>` — nombre del servicio en `dokploy-network`, no la IP pública.                   |
| `DIRECT_URL`                                                                                      | Igual que `DATABASE_URL` (no hay pooler). `prisma.config.ts` usa `DATABASE_URL` primero.                                                   |
| `BETTER_AUTH_SECRET`                                                                              | `openssl rand -base64 32`. Cambiarla cierra todas las sesiones.                                                                            |
| `S3_ENDPOINT`                                                                                     | `http://alphataco-minio:9000`                                                                                                              |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY`                                                                 | Credenciales de MinIO.                                                                                                                     |
| `S3_REGION`                                                                                       | `us-east-1`                                                                                                                                |
| `S3_FORCE_PATH_STYLE`                                                                             | `true`                                                                                                                                     |
| `JOBS_TOKEN`                                                                                      | `openssl rand -hex 32`. Vacío = `/api/jobs/*` responde 401 (ver "Pendientes").                                                             |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `SMTP_FROM`, `EMAIL_FROM_NAME` | Invitaciones y recuperación de contraseña. Vacías = los mails no salen y el enlace queda en el log (solo si `NEXT_PUBLIC_SHOW_LOGS=true`). |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`                                                       | Opcionales. Vacías = sin botón de Google.                                                                                                  |
| `TASKAPP_BASE_URL` / `TASKAPP_PROJECT_API_KEY`                                                    | Centro de Ayuda (opcional).                                                                                                                |
| `RUN_SEED`                                                                                        | `true` solo en el primer deploy (ver abajo).                                                                                               |
| `SEED_COMPANY_NAME`                                                                               | Nombre de la empresa del seed. Default `AlphaTaco`.                                                                                        |

`GIT_SHA`, `NODE_ENV`, `PORT` y `HOSTNAME` los fija la imagen: no cargarlos.

## Primer deploy

1. Cargar variables y secrets de GitHub, y el env runtime en Dokploy con `RUN_SEED=true` y
   `SEED_COMPANY_NAME=<nombre real de la empresa>`.
2. Push a `main` (o **Actions → deploy → Run workflow** sobre `main`).
3. El contenedor corre `migrate deploy` sobre la base vacía y después
   `node scripts/seed-company.ts --name "$SEED_COMPANY_NAME"`, que crea:
   - la empresa (con placeholders en los NOT NULL: CUIT `SEED-xxxxxxxx`, mail `contacto@<slug>.local`, ciudad "Sin especificar");
   - el catálogo global de permisos (`modules`, `tabs`, `actions`), los 3 roles de sistema con todos
     sus permisos, y el rol `User`;
   - los destinatarios de los mails automáticos, con el mail placeholder de la empresa.
4. Verificar: `curl https://alphataco.31.97.42.82.sslip.io/api/health` devuelve el commit desplegado.
5. **Apagar `RUN_SEED`** (borrar la variable o ponerla en `false`). El seed es idempotente (todo
   `upsert`, id de empresa derivado del nombre), así que otra corrida con el mismo nombre no
   duplica nada; pero con otro `SEED_COMPANY_NAME` crearía otra empresa. Apagarlo no requiere
   redeploy inmediato: rige desde el próximo arranque.

## Primer usuario admin

No hay registro abierto (`disableSignUp: true`): los usuarios entran por invitación desde
Configuración → Usuarios, y eso requiere un admin que ya exista. El primero se da de alta por SQL
reproduciendo lo que hace el alta por invitación (`registerUserWithRole` + `createPasswordSetupLink`):
usuario de Better Auth **sin contraseña**, perfil, pertenencia a la empresa, rol `admin` y un token
de "definir contraseña". El usuario canjea el token y elige su contraseña; Better Auth crea la
cuenta de credenciales en ese momento, igual que con un invitado.

No usar `scripts/seed-auth-fixtures.ts`: son datos de prueba (contraseña fija conocida, empresa fija
`...0000f4`, legajos y vehículo de mentira).

1. Abrir `psql` en el servicio Postgres (Dokploy → servicio → Terminal, o
   `docker exec -it <contenedor-postgres> psql -U <user> -d <db>`).
2. Correr, cambiando nombre, mail y empresa:

   ```sql
   BEGIN;

   WITH u AS (
     INSERT INTO auth_user (id, name, email, email_verified)
     VALUES (gen_random_uuid(), 'Nombre Apellido', lower(trim('admin@dominio.com')), true)
     RETURNING id, name, email
   ), p AS (
     INSERT INTO profile (id, credential_id, email, fullname, role)
     SELECT id, id, email, name, 'User' FROM u
     RETURNING id
   ), c AS (
     UPDATE company SET owner_id = (SELECT id FROM p)
     WHERE company_name = 'AlphaTaco'           -- el SEED_COMPANY_NAME del primer deploy
     RETURNING id
   ), s AS (
     INSERT INTO share_company_users (company_id, profile_id)
     SELECT c.id, p.id FROM c, p
   ), r AS (
     INSERT INTO user_roles (user_id, role_id, company_id, assigned_by)
     SELECT p.id, (SELECT id FROM roles WHERE slug = 'admin' AND is_system), c.id, p.id FROM c, p
   ), v AS (
     INSERT INTO auth_verification (id, identifier, value, expires_at)
     SELECT gen_random_uuid(), 'reset-password:' || t.token, u.id::text, now() + interval '24 hours'
     FROM u, (SELECT md5(random()::text || clock_timestamp()::text) || md5(random()::text) AS token) t
     RETURNING identifier
   )
   SELECT replace(identifier, 'reset-password:', '') AS token, (SELECT count(*) FROM c) AS empresas
   FROM v;
   ```

   Tiene que devolver un `token` y `empresas = 1`. Con `empresas = 0` el nombre no coincide:
   `ROLLBACK;` y corregirlo. Si está bien, `COMMIT;`.

3. Abrir `https://alphataco.31.97.42.82.sslip.io/api/auth/reset-password/<token>?callbackURL=%2Freset_password%2Fupdate-user`,
   definir la contraseña y entrar. El token vence en 24 h.
4. Ya como admin: **Configuración → General** para reemplazar los placeholders del seed (CUIT,
   mail, dirección) y revisar los destinatarios de los mails automáticos. El resto de los usuarios
   se invita desde Configuración → Usuarios.

## Operación

- **Deploy normal**: push a `main`. Un push de solo docs no dispara nada.
- **Redeploy del mismo commit**: Actions → deploy → Run workflow sobre `main`. No reconstruye
  (la imagen ya existe): promueve, llama al webhook y espera el health.
- **Cambiar una `NEXT_PUBLIC_*`**: cambiar la variable de repo y pushear un commit. Un Run workflow
  sobre el mismo commit **no** la hornea (reusa la imagen existente).
- **Rollback**: `docker buildx imagetools create -t registry-31-97-42-82.sslip.io/alphataco:main registry-31-97-42-82.sslip.io/alphataco:sha-<commit-bueno>`
  (logueado al registry) y Redeploy en Dokploy. Verificar con `/api/health` que responde ese
  commit. Las migraciones no se revierten solas: si el commit malo migró, evaluar antes.
- **Verificar un deploy**: `gh run list --workflow deploy.yml`, `gh run view <id>`, y
  `curl <health>` comparando `sha` con el head de `main`.

## Instancia demo: reset diario

La instancia demo (`alphataco.31.97.42.82.sslip.io`, proyecto **Demos** de Dokploy) se regenera
todas las noches con `scripts/demo/reset.ts`, así siempre tiene datos "de hoy": parte diario del
día, novedades de diagrama, documentos por vencer, indicadores de los últimos meses.

- **Qué hace**: borra los datos de negocio (todas las tablas salvo permisos, empresa, usuarios y
  sus membresías: lista `KEEP` en `scripts/demo/lib/wipe.ts`) y genera ~120 empleados, ~120
  vehículos, clientes y contratos, 12 meses de partes diarios, pedidos, documentación con un PDF
  por documento, mantenimiento, certificaciones, selección, indumentaria, neumáticos, KPIs e
  indicadores. Las fechas son relativas al día de la corrida (hora argentina); nombres, legajos y
  patentes son siempre los mismos (Faker con semilla fija). Los ids son deterministas: los links
  a un empleado o una OT sobreviven al reset.
- **Seguridad**: sin `DEMO_RESET_ENABLED=true` no hace nada, y aborta si la base tiene otra
  empresa además de la demo. Todo va en una transacción: si falla, queda la demo del día anterior.
- **Cuándo corre**: Schedule de la app en Dokploy, `5 0 * * *` (America/Argentina/Buenos_Aires),
  comando `node scripts/demo/reset.ts`. Va antes del job de indicadores de las 00:30. Tarda ~2 min.
- **Correrlo a mano**: Dokploy → Alphataco → Schedules → Run now. Para probar sin tocar nada:
  `node scripts/demo/reset.ts --dry` (genera todo y hace ROLLBACK).
- **Usuarios demo** (contraseña `AlphaDemo2026!`): `demo@alphataco.com` (admin),
  `administrador@`, `rrhh@`, `taller@` y `operaciones@patagonia-demo.com.ar`, cada uno con su rol.
- **Si una migración agrega una tabla de negocio**, el reset la vacía sola. Si agrega una columna
  NOT NULL sin default en una tabla que el reset llena, el reset falla hasta que se complete en el
  dominio correspondiente de `scripts/demo/domains/`.

## Pendientes

- **Jobs periódicos**: en compose los dispara el contenedor `cron` (`docker/cron`). En la
  instancia demo los cubren tres Schedules de la app en Dokploy (mismos horarios, hora argentina)
  que llaman a `/api/jobs/*` con `fetch` de Node y `JOBS_TOKEN`. Una instancia nueva necesita los
  suyos.
- **Limpieza del registry**: cada deploy deja un `sha-*`. Si ya existe un Scheduled Task global de
  limpieza del registry (el de Ecokit), sumarle el repo `alphataco` en vez de crear otro: borrar
  `sha-*` viejos protegiendo los digests de `main` y `buildcache`, con el `Accept` que incluye los
  manifests OCI, y después `garbage-collect --delete-untagged`.
