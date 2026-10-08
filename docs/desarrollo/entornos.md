# Variables de entorno y configuración por ambiente

## Variables de entorno

| Variable                       | Pública / Servidor | Para qué                                                                 |
| ------------------------------- | ------------------- | ------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`            | Servidor             | Firma las cookies de sesión de Better Auth (`openssl rand -base64 32`). Cambiarla invalida todas las sesiones abiertas. |
| `GOOGLE_CLIENT_ID`              | Servidor             | OAuth de Google (opcional). Vacía = el botón de Google no se muestra.     |
| `GOOGLE_CLIENT_SECRET`          | Servidor             | OAuth de Google (opcional).                                               |
| `DATABASE_URL`                  | Servidor             | Connection string de Prisma (pooler).                                     |
| `DIRECT_URL`                    | Servidor             | Connection string directa de Prisma (migraciones).                        |
| `NEXT_PUBLIC_PROJECT_URL`       | Pública              | URL pública del proyecto/app.                                             |
| `NEXT_PUBLIC_BASE_URL`          | Pública              | Base URL usada en links/redirects del front.                              |
| `NEXT_PUBLIC_PREPARTE_BUCKET`   | Pública              | Nombre del bucket de Storage para preparte.                               |
| `NEXT_PUBLIC_SHOW_LOGS`         | Pública              | `'true'`/`'false'` — activa el logger custom (`src/lib/logger.ts`).       |
| `NEXT_PUBLIC_POSTHOG_KEY`       | Pública              | Project API key de PostHog (pública por diseño).                          |
| `NEXT_PUBLIC_POSTHOG_HOST`      | Pública              | Host de PostHog.                                                          |
| `JOBS_TOKEN`                    | Servidor             | Token `Bearer` con el que el contenedor `cron` autentica contra `/api/jobs/*`. Generar con `openssl rand -hex 32`. **Vacío = los tres endpoints rechazan todo con 401** y los jobs no corren. |
| `SMTP_HOST`                     | Servidor             | Servidor SMTP. Único emisor: `src/shared/lib/mail/transport.ts`. Vacío = los mails no se envían y el contenido se loguea (el cron sigue corriendo y anota «no enviado» en `jobs_runs`). |
| `SMTP_PORT`                     | Servidor             | Puerto SMTP.                                                              |
| `SMTP_USER`                     | Servidor             | Usuario SMTP.                                                             |
| `SMTP_PASS`                     | Servidor             | Password SMTP.                                                            |
| `SMTP_SECURE`                   | Servidor             | `'true'`/`'false'` — TLS en la conexión SMTP.                             |
| `SMTP_FROM`                     | Servidor             | Dirección del remitente. Sin ella se usa `SMTP_USER`.                     |
| `EMAIL_FROM_NAME`               | Servidor             | Nombre del remitente (`fromAddress()` en `src/shared/lib/mail/transport.ts`). |
| `MAILPIT_SMTP_PORT`             | Servidor             | Puerto SMTP del servicio `mailpit` del compose (perfil `mail`, solo desarrollo). |
| `MAILPIT_WEB_PORT`              | Servidor             | Puerto de la web/API de `mailpit`.                                        |
| `TASKAPP_BASE_URL`              | Servidor             | Base URL del backend de tickets (Centro de Ayuda).                        |
| `TASKAPP_PROJECT_API_KEY`       | Servidor             | API key del proyecto en TaskApp.                                          |
| `FISCAL_SECRETS_KEY`            | Servidor             | Clave maestra AES-256-GCM (32 bytes base64, `openssl rand -base64 32`) que cifra la clave privada del certificado de ARCA y los tickets de WSAA. Solo en el entorno, nunca en la base. Rotación: la vigente lleva `FISCAL_SECRETS_KEY_VERSION` y las anteriores se dejan como `FISCAL_SECRETS_KEY_V<n>`. Si se pierde, hay que generar un certificado nuevo (las facturas no se pierden). |
| `ARCA_MODE`                     | Servidor             | `mock` = ARCA simulado: demos y desarrollo sin certificado. CAE ficticio, comprobantes marcados "simulado" y PDF con marca de agua. Vacío = ARCA real. **La instancia demo debe tenerlo en `mock`.** |
| `ARCA_MOCK_SCENARIO`            | Servidor             | Solo con `ARCA_MODE=mock`: `reject` fuerza un rechazo y `timeout` un corte de comunicación (para mostrar/probar los estados rechazada y pendiente). |
| `ARCA_ALLOW_PRODUCTION`         | Servidor             | `true` SOLO en el despliegue de producción. Sin esto ninguna instancia (dev, demo) puede emitir comprobantes con validez fiscal, aunque la empresa tenga el ambiente en producción. |

Ninguna variable `NEXT_PUBLIC_*` contiene un secreto: la key de PostHog es pública por diseño (es una clave de proyecto, no una credencial privilegiada). Los secretos de auth (`BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`) son de servidor y nunca se prefijan con `NEXT_PUBLIC_`.

## Jobs periódicos (`/api/jobs/*`)

Los cuatro jobs corren dentro de la app, disparados por el servicio `cron` del compose (busybox
`crond` + `curl`, `TZ=America/Argentina/Buenos_Aires`). No hay `pg_cron`, `net.http_post` ni
edge functions: P5 los reemplazó a todos.

| Cuándo (hora AR) | Endpoint | Qué hace |
| ----------------- | --------- | --------- |
| lunes 08:00        | `GET /api/jobs/documents-expiry`        | Resumen semanal de vencimientos de documentos. Un correo **por empresa**. |
| lunes 08:05        | `GET /api/jobs/warehouse-batch-expiry`  | Lotes de Almacenes vencidos y por vencer (30 días), con saldo. Un correo **por empresa**, solo si hay algo que avisar (destinatarios: `stock_batch_expiry`). |
| todos los días 07:00 | `GET /api/jobs/daily-report-deviations` | Desvíos del parte diario del día. Un correo **por empresa**, solo si hay desvíos. |
| todos los días 00:30 | `GET /api/jobs/daily-indicators`        | Cierra partes diarios, marca prepartes vencidos y persiste los 11 indicadores del día por empresa en `daily_indicators`. No manda correos. |

El crontab (`docker/cron/crontab`) llama con
`curl --fail-with-body -sS -H "Authorization: Bearer $JOBS_TOKEN"`. Son `GET` porque `curl`
sin `-X` manda `GET`; los mismos handlers están expuestos como `POST` para dispararlos a mano.

`--fail-with-body` y no `-f`: los dos fallan con exit != 0 ante HTTP ≥ 400, pero `-f` es
*fail silently* y **descarta la respuesta**, así que en el log de `crond` sólo quedaría
`curl: (22)`. Con `--fail-with-body` aparece además el JSON con el detalle por empresa:

```bash
docker compose --env-file .env.docker logs cron
# curl: (22) The requested URL returned error: 500
# {"ok":false,...,"failed":1,"units":[{"companyName":"...","status":"error","error":"..."}]}
```

El endpoint devuelve **500 si falló al menos una empresa**, aunque las demás hayan salido
bien: un job que procesó 4 de 5 no es un éxito. **No hay reintentos automáticos**: el
siguiente disparo del cron es el reintento.

### Autenticación

`JOBS_TOKEN` (tabla de variables de arriba). La comparación es en tiempo constante
(`crypto.timingSafeEqual` sobre los SHA-256, en `src/features/Jobs/lib/auth.ts`). Sin token
configurado **no entra nadie**: la respuesta es siempre `401 {"error":"Unauthorized"}`, sin
decir si el servidor tiene token o si el presentado es incorrecto.

```bash
# Disparar un job a mano contra el compose
set -a; source .env.docker; set +a
curl -fsS -H "Authorization: Bearer $JOBS_TOKEN" http://127.0.0.1:${APP_PORT:-3000}/api/jobs/documents-expiry
```

### Destinatarios de los correos

Salen de la tabla **`notification_settings`** (`company_id`, `kind`, `recipients text[]`,
`is_active`), **no de variables de entorno**: estos jobs recorren todas las empresas, y una
lista global haría que los datos de una empresa llegaran a gente de otra. El seed y la
migración inicial cargan el `contact_email` de cada empresa como default.

```sql
-- Ver / cambiar los destinatarios de una empresa
SELECT c.company_name, ns.kind, ns.recipients, ns.is_active
FROM notification_settings ns JOIN company c ON c.id = ns.company_id ORDER BY 1, 2;

UPDATE notification_settings SET recipients = ARRAY['uno@empresa.com','dos@empresa.com']
WHERE company_id = '<uuid>' AND kind = 'documents_expiry';
```

Una empresa sin fila, inactiva o con la lista vacía se **saltea** y queda registrada; nunca se
manda "por las dudas".

### Bitácora e idempotencia: `jobs_runs`

Cada corrida deja filas en `jobs_runs` (`job`, `run_key`, `company_id`, `status`, `attempts`,
`started_at`, `finished_at`, `error`, `metadata`):

| `run_key` | Qué es |
| ---------- | ------- |
| `corrida:<fecha AR>` | Bitácora de la corrida completa. Se abre ANTES de consultar nada, así que un fallo previo al bucle (base caída, pool agotado) también queda registrado. **No es candado**: no bloquea un segundo disparo. |
| `<company_id>:<fecha AR>` | Una por empresa. **Es el candado de idempotencia.** |
| `mantenimiento:<fecha AR>` | El paso global del job diario (cierre de partes y prepartes). |

La clave por empresa se reclama con `INSERT ... ON CONFLICT` **antes** de trabajar: por eso
correr un job dos veces el mismo día no manda el correo dos veces. Qué se puede volver a
reclamar:

| `status` | ¿Reclamable? | Por qué |
| --------- | ------------- | -------- |
| `ok`      | **No**        | El trabajo se hizo. Es lo que impide reenviar un correo ya enviado. |
| `error`   | Sí            | Falló; el siguiente disparo reintenta **sólo** esa empresa. |
| `skipped` | Sí            | No hubo trabajo (sin parte diario, sin destinatarios). Si cargás los destinatarios a media mañana y redisparás, la empresa se reintenta en vez de esperar a mañana. |
| `running` | Sólo pasada 1 h | Evita que dos disparos simultáneos dupliquen, y que un proceso muerto deje la clave trabada para siempre. |

Es el único rastro confiable: el `Logger` del repo sólo emite con `NEXT_PUBLIC_SHOW_LOGS=true`.

```sql
SELECT job, run_key, status, attempts, finished_at - started_at AS duracion, error, metadata
FROM jobs_runs ORDER BY started_at DESC LIMIT 20;
```

### Probar los envíos de verdad (SMTP de prueba)

El compose trae un **Mailpit** detrás del perfil `mail` (no arranca con `up`): captura todo lo
que se le manda y no reenvía nada.

```bash
# .env.docker: SMTP_HOST=mailpit, SMTP_PORT=1025, SMTP_SECURE=false, SMTP_FROM=no-reply@alphataco.local
docker compose --env-file .env.docker --profile mail up -d --wait mailpit
docker compose --env-file .env.docker up -d --wait app cron

set -a; source .env.docker; set +a
docker compose --env-file .env.docker exec -T cron sh -c \
  'curl -fsS -H "Authorization: Bearer $JOBS_TOKEN" $APP_URL/api/jobs/documents-expiry'

curl -sS "http://127.0.0.1:${MAILPIT_WEB_PORT:-8025}/api/v1/messages?limit=10"   # o la web en ese puerto
```

Si `MAILPIT_SMTP_PORT`/`MAILPIT_WEB_PORT` chocan con otro proyecto, cambiarlos en
`.env.docker` (mismo criterio que el resto de los puertos).

### Tests

`npm run test:jobs` levanta postgres, aplica migraciones y corre la integración de los tres
jobs (`src/features/Jobs/jobs/jobs.integration.test.ts`) con dos empresas de prueba: verifica
el token por HTTP, que ningún correo mezcle empresas, la idempotencia corriendo cada job dos
veces y que `daily_indicators` quede escrita.

## Levantar con Docker

El compose de la raíz (`docker-compose.yml`) levanta la infraestructura local: `postgres` (16 + pgTAP), `minio` (S3 compatible) + `minio-init` (crea los buckets), `migrate` (aplica las migraciones de Prisma y termina), `app` (Next.js standalone), `cron` (jobs periódicos) y `caddy` (reverse proxy), más `mailpit` (SMTP de prueba, detrás del perfil `mail`: no arranca con `up`). Servicios, puertos, volúmenes y red están documentados en el propio `docker-compose.yml`.

Orden de arranque (por `depends_on`): `postgres` y `minio` healthy → `migrate` corre `npx prisma migrate deploy` y sale con `Exited (0)` → `app` arranca y pasa a `healthy` cuando `GET /login` responde `< 500` → `cron` y `caddy`. Si `migrate` falla, `app` no se levanta (`service_completed_successfully`). `postgres`, `minio`, `app`, `cron` y `caddy` tienen `restart: unless-stopped`.

`migrate` se construye con la stage `build` del `Dockerfile` (node_modules completo + `prisma.config.ts`): el CLI de Prisma 7 no puede correr desde el output standalone de Next, que sólo trae el runtime (`@prisma/client`, `@prisma/adapter-pg`, `pg`). La imagen de `app` no lleva el CLI de Prisma ni corre migraciones al arrancar.

### Setup inicial

```bash
cp .env.docker.example .env.docker
# completar POSTGRES_PASSWORD, S3_SECRET_KEY, JOBS_TOKEN y demás variables marcadas "cambiar"
bash scripts/dev-up.sh   # levanta postgres, minio y minio-init (crea los buckets)
```

`.env.docker` es local y está en `.gitignore` — nunca se versiona.

### Auth (Better Auth): variables

La autenticación corre dentro de la app (P4): no hay servicio externo. Las tablas (`auth_user`,
`auth_session`, `auth_account`, `auth_verification`) viven en el mismo Postgres del compose.

| Variable               | Para qué sirve                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`   | Firma las cookies de sesión. Obligatoria. Generar con `openssl rand -base64 32`; cambiarla cierra todas las sesiones abiertas. |
| `NEXT_PUBLIC_BASE_URL` | URL base de la app. De ahí salen el callback de OAuth y los enlaces de invitación/recuperación.     |
| `GOOGLE_CLIENT_ID`     | Opcional. Sin ella el botón "Iniciar sesión con Google" no se muestra.                              |
| `GOOGLE_CLIENT_SECRET` | Opcional, par de la anterior. Redirect URI a registrar en Google Cloud: `<NEXT_PUBLIC_BASE_URL>/api/auth/callback/google`. |
| `SMTP_*`               | Invitación de usuario y recuperación de contraseña (`src/shared/lib/mail/`). Vacías = el mail no se envía y el enlace queda en el log. |

No hay registro abierto: los usuarios se dan de alta por invitación desde Empresa → Usuarios.

**Tope de intentos**: el login y la recuperación de contraseña tienen un freno de fuerza bruta
por email y por IP (`src/shared/lib/login-rate-limit.ts`). Vive en un hook del pipeline de
endpoints y no en el router, porque los cinco logins entran por `auth.api.*` desde Server
Actions y ahí el limitador propio de Better Auth no llega. El almacén es **en memoria del
proceso**: frena el ataque real en un despliegue de un solo contenedor, pero se reinicia con
cada deploy y no se comparte entre instancias. Si la app pasa a correr replicada, hay que
moverlo a la base.

**`jose` es dependencia directa a propósito**: es `peerDependency` de `@better-auth/core` y npm
no la sube al nivel raíz por su cuenta. No se usa en `src/`, pero sacarla rompe el build con
`Cannot find package 'jose'`.

Para probar los cinco flujos de auth contra el compose: `npm run test:auth` (integración) y el spec
`cypress/e2e/auth/p4-auth-flows.cy.ts` con los datos de `node scripts/seed-auth-fixtures.ts`.

### Storage (MinIO): variables

| Variable               | Para qué sirve                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `S3_ACCESS_KEY`        | Usuario de MinIO. Es también el `MINIO_ROOT_USER` del servicio `minio` y lo usa `minio-init` para crear los buckets.        |
| `S3_SECRET_KEY`        | Contraseña de MinIO (`MINIO_ROOT_PASSWORD`). Mínimo 8 caracteres.                                                            |
| `S3_REGION`            | Región que firma el SDK. MinIO la ignora, pero el SDK la exige. Default `us-east-1`.                                         |
| `S3_FORCE_PATH_STYLE`  | `true` (default): el bucket va en el path. MinIO no resuelve buckets por subdominio.                                         |
| `S3_ENDPOINT`          | Dónde está MinIO. **Sólo lo usa el servidor.** El servicio `app` lo fija a `http://minio:9000`; para `npm run dev` fuera de Docker, apuntarlo al puerto publicado (`MINIO_PORT`). |

**MinIO no se publica en internet ni se proxea por caddy**: el navegador nunca le habla. Todos
los archivos —imágenes embebidas y descargas— salen por `GET /api/files/<bucket>/<key>` de la
app, que resuelve a qué empresa (o perfil) pertenece el archivo, valida la sesión contra ese
dueño y hace stream desde MinIO. No hay URLs firmadas, así que no hay endpoint público que
publicar ni variables de host que mantener sincronizadas.

### Levantar la app completa

```bash
docker compose --env-file .env.docker build migrate app   # ~4 min la primera vez
docker compose --env-file .env.docker up -d app            # levanta postgres, minio, migrate y app
docker compose --env-file .env.docker ps                   # migrate Exited (0), app healthy
docker compose --env-file .env.docker logs migrate         # "No pending migrations" o las aplicadas
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:${APP_PORT:-3000}/login   # 200
```

`up -d cron caddy` los suma cuando `app` ya está healthy. Para volver a aplicar migraciones sin reiniciar la app: `docker compose --env-file .env.docker run --rm migrate` (mismo comando que corre al arrancar).

### Migrar, resetear y sembrar datos (desde el host)

```bash
set -a; source .env.docker; set +a   # POSTGRES_PASSWORD y POSTGRES_PORT (default 5432)
export DATABASE_URL=postgresql://alphataco:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT:-5432}/alphataco
npm run db:deploy   # prisma migrate deploy — aplica 0_init + migraciones pendientes
npm run db:seed     # seed idempotente de empresa/módulos/tabs/acciones/roles
npm run db:reset    # borra y recrea SOLO el contenedor y el volumen de postgres (no toca minio)
```

Flujo completo para crear o modificar una migración (diff → carpeta → SQL → deploy → verificación): `.claude/rules/migrations.md`.

### Variables obligatorias para el build de `app`

Ninguna. `docker compose build app` pasa las `NEXT_PUBLIC_*` como build args (Next.js las embebe en el bundle del cliente durante `next build`), pero todas pueden quedar vacías: con P4 se fueron los placeholders de `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`, que existían sólo porque `supabaseBrowser()` reventaba al prerenderizar `/maintenance` sin ellas.

### Tests de base de datos (pgTAP)

`npm run test:db` levanta `postgres` (imagen propia con pgTAP), resetea la base `alphataco_test`, aplica migraciones + seed, y corre los tests `prisma/tests/*.sql` con `pg_prove` — nunca toca la base de trabajo `alphataco`.

### Puertos: resolver conflictos sin tocar el compose

El compose mapea los puertos de host vía variables de entorno con default (`POSTGRES_PORT`, `MINIO_PORT`, `MINIO_CONSOLE_PORT`, `APP_PORT`, `CADDY_HTTP_PORT`, `CADDY_HTTPS_PORT`). Si alguno está ocupado en tu máquina por otro proyecto, cambiar el valor en `.env.docker` — nunca hardcodear un puerto distinto en `docker-compose.yml`.

`.env.docker.example` trae los puertos default (`POSTGRES_PORT=5432`, `MINIO_PORT=9000`, `MINIO_CONSOLE_PORT=9001`, `APP_PORT=3000`, `CADDY_HTTP_PORT=80`, `CADDY_HTTPS_PORT=443`). Ejemplo de remapeo en un host donde 5432, 9000/9001 y 80 ya están tomados por otros proyectos:

| Servicio        | Puerto por default | Ejemplo de remapeo en `.env.docker` |
| ---------------- | ------------------- | ------------------------------------ |
| postgres          | 5432                 | `POSTGRES_PORT=55432`                |
| minio (API)       | 9000                 | `MINIO_PORT=29000`                   |
| minio (consola)   | 9001                 | `MINIO_CONSOLE_PORT=29001`           |
| caddy (HTTP)      | 80                   | `CADDY_HTTP_PORT=8080`               |

Todo lo que se conecta desde el host (`npm run db:deploy`, `npm run test:db`, `psql`, la consola de MinIO) lee el puerto de `.env.docker`; nunca asumir 5432/9000 hardcodeado.

### Servicios que corren solo con `postgres` + `minio`

Para desarrollar con `npm run dev` alcanza con `bash scripts/dev-up.sh` (postgres + minio + minio-init); `migrate`, `app`, `cron` y `caddy` sólo hacen falta para probar la imagen de producción. Para verificar que las imágenes de `cron` y `caddy` compilan sin levantar nada: `docker compose --env-file .env.docker build cron caddy`.

### Verificar los buckets de MinIO

`minio-init` recibe `S3_ACCESS_KEY`/`S3_SECRET_KEY` de `.env.docker` como variables de entorno, así que se pueden reutilizar dentro del contenedor:

```bash
docker compose --env-file .env.docker run --rm --entrypoint sh minio-init -c \
  'mc alias set local http://minio:9000 "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null && mc ls local/'
```

Debe listar los 10 buckets de `STORAGE_BUCKETS` (`src/shared/lib/storage-buckets.ts`): `document-files`,
`document-files-expired`, `contract-documents`, `daily-reports`, `logo`, `avatar`, `clothing-signatures`,
`repair-images`, `tire-discards`, `preparte-img`. Todos privados (`mc anonymous set none`): se leen por la
ruta `/api/files/...` de la app o por URL firmada.

### Ver los archivos de MinIO (consola web)

`http://localhost:${MINIO_CONSOLE_PORT:-9001}` — login con `S3_ACCESS_KEY`/`S3_SECRET_KEY` de `.env.docker`. Desde ahí se navegan los buckets y objetos igual que en el dashboard de Storage de Supabase.
