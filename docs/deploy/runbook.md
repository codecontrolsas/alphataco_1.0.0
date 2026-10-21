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
- **Postgres y el almacenamiento S3 (RustFS) son servicios aparte en Dokploy**: no van en la imagen. El contenedor corre
  `prisma migrate deploy` en cada arranque (`docker/entrypoint.sh`) y después `node server.js`.
- `ci.yml` (check-types, vitest, tests de base con pgTAP, auth, jobs, e2e) corre en push y PR. El deploy
  **no** espera a `db-tests` ni al e2e: repite solo `check-types` + `vitest` en su job `verify`, porque un
  workflow no puede depender de otro sin `workflow_run`. Si `db-tests` o el e2e fallan después de un deploy,
  se ve en el run de CI.
- **Qué corre en CI** (job `changes`, filtro de rutas):
  - Solo docs / `*.md` / config de editor: nada pesado; `docs-check` (marcadores de conflicto) y el resumen `CI gate`.
  - Push a `main`: `types-and-lint` **no** corre (lo hace `verify` del deploy sobre el mismo commit); `db-tests`,
    `e2e` y `e2e-rls` sí. La concurrencia de CI no cancela en `main` (cada commit mergeado termina su e2e).
  - `e2e-rls` (informativo): en `main` (push o PR a `main`) o si el cambio toca `prisma/`, `src/shared/lib/tenant*`,
    `prisma*`, `actor*`, `docker*`, `Dockerfile`, `.github/` o `e2e/`.
  - `types-and-lint`, `db-tests` e `image` corren en paralelo; ya no hay `needs` entre ellos.
- **La imagen de los e2e se construye una vez** (`_e2e-image.yml`) y `e2e` / `e2e-rls` la bajan como artifact
  (`docker save | zstd`, 1 día) y la cargan con `docker-compose.ci.yml` (`pull_policy: never`, `migrate` usa la
  misma imagen runner). **No es la imagen de producción**: las `NEXT_PUBLIC_*` se hornean y el e2e necesita las de
  `.env.docker.example` (`localhost:3000`). Por eso NO se publica en el registry como `sha-<commit>`: `_build-image.yml`
  (`skip_if_exists`) la encontraría y desplegaría una imagen con `localhost` adentro. Mismo Dockerfile, otros build-args.
- Chromium de Playwright se cachea (`~/.cache/ms-playwright`, key = versión del lockfile) y se instala en segundo plano
  mientras la instancia arranca; las dependencias de sistema (`apt`) solo si `ldd` dice que faltan
  (`.github/scripts/playwright-chromium.sh`).
- Runner: con la variable `CI_RUNNER` = `blacksmith-*` los jobs pesados (incluida `image`) usan el builder de Blacksmith
  (`useblacksmith/setup-docker-builder` + `useblacksmith/build-push-action`); vacía = runners de GitHub con cache de capas
  en el cache de Actions (`type=gha`, scope `e2e-image`, solo se escribe desde push).

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
| `CI_RUNNER`                | **Obligatoria.** Label del runner de Blacksmith (hoy `blacksmith-4vcpu-ubuntu-2404`; el de 2 vCPU no está disponible en esta organización). TODOS los jobs (CI, build, deploy y rollback) usan esta variable y no hay respaldo en GitHub: si está vacía, los jobs no arrancan y no se gastan minutos de GitHub Actions. Solo se cambia a mano, por decisión del dueño del repo. |
| `REGISTRY_HOST`            | Opcional. Host del registro de imágenes. Vacía = el registro de esta instancia (`registry-31-97-42-82.sslip.io`). Un clon para otro cliente define el suyo. |
| `IMAGE_NAME`               | Opcional. Nombre de la imagen dentro del registro. Vacía = `alphataco`. Que cada cliente tenga el suyo evita que dos instancias se pisen el tag `:main`. |
| `STORAGE_IMAGE`            | Opcional (solo CI y compose). Imagen del almacenamiento S3. Vacía = `rustfs/rustfs:1.0.3`, la que fija `docker-compose.yml`. Definirla para usar un espejo propio u otra versión. |

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
| `S3_ENDPOINT`                                                                                     | `http://alphataco-storage:9000`                                                                                                             |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY`                                                                 | Credenciales de RustFS (no dejar las de fábrica de la imagen).                                                                                                                     |
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

**Forma recomendada:** `scripts/bootstrap-admin.ts` (viene en la imagen). Dentro del contenedor de la app:

```sh
node scripts/bootstrap-admin.ts --email admin@dominio.com --name "Nombre Apellido" --company "<SEED_COMPANY_NAME>"
```

Hace en una transacción lo mismo que el SQL de más abajo (usuario sin contraseña, perfil, pertenencia a la
empresa, rol `admin` y token de "definir contraseña" de 24 h) e imprime el enlace; deja a la persona como
dueña de la empresa solo si todavía no tenía dueño. Si el mail ya existe falla con un mensaje claro;
`--reissue-link` emite otro enlace para un usuario que ya existe. El SQL queda como alternativa manual.

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

## Almacenamiento S3: RustFS en Dokploy y migración desde MinIO

El almacenamiento de objetos es **RustFS** (S3 compatible, escrito en Rust), el mismo que ya usan
`control-documental-ai`, `credere` y `taskapp`. Reemplaza a MinIO porque la imagen oficial
(`minio/minio`, `minio/mc`) ya no se puede bajar de Docker Hub. La app habla con él solo por el SDK de AWS
(`forcePathStyle`, región `us-east-1`), así que no cambió nada del código: sí cambió el servicio y, en el compose,
su nombre (`minio` → `storage`) y las variables de puertos (`STORAGE_PORT`, `STORAGE_CONSOLE_PORT`).

### Servicio en Dokploy (instancia nueva)

- **Imagen** fijada por versión **y digest**: `rustfs/rustfs:1.0.3@sha256:9ca9559533b537d10482fe923288b676ad08f92a7069d9a17327fbae3cab688b` (no `latest`: un tag se puede volver a publicar con otro contenido). Lo ideal es **copiarla al registro propio** (`docker pull` + `docker tag` + `docker push`) y usar esa: es justo lo que le pasó a MinIO cuando su imagen dejó de estar en Docker Hub.
- **Env**: `RUSTFS_ACCESS_KEY` y `RUSTFS_SECRET_KEY` propias (la imagen advierte si queda el valor de fábrica
  `rustfsadmin`). Son las mismas `S3_ACCESS_KEY` / `S3_SECRET_KEY` que recibe la app.
- **Volumen** en `/data`. El proceso corre como usuario no root (uid 10001). Un **volumen administrado por Docker**
  (el `storage-data` del compose, o un volumen de Dokploy) funciona sin hacer nada. Con una **carpeta del host**
  (bind mount) y permisos de otro usuario, RustFS **no arranca** (`Permission denied (os error 13)`, sale con
  código 1): darle la carpeta al usuario con `chown 10001:10001 <carpeta>`, o arrancar el contenedor como root con
  `RUSTFS_UID=10001` y `RUSTFS_GID=10001` (el entrypoint hace el `chown` solo). Probado las dos formas.
- **Puertos** 9000 (S3) y 9001 (consola) solo en la red interna de Dokploy: **no se publican** (la app es la única
  que lee los archivos, por `/api/files`).
- **Healthcheck**: `curl -f http://localhost:9000/health` (la imagen trae `curl`).
- **Buckets**: no se crean a mano. El entrypoint de la app corre `scripts/ensure-buckets.ts` en cada arranque
  y crea los que falten.
- `S3_ENDPOINT` de la app: `http://<appName del servicio>:9000`. Dokploy genera el `appName` (se ve en la pestaña General del servicio) y no se puede cambiar después; los nombres `alphataco-storage` / `alphataco-minio` de abajo son los de esta instancia.

### Migrar una instancia que hoy usa MinIO

Probado entre un MinIO y un RustFS 1.0.3 con claves con espacios y tildes, distintos tipos de contenido y un
archivo de 300 KB: los objetos llegan idénticos (`rclone check`: 0 diferencias) y una segunda pasada no copia nada.
Las instancias que ya corren **no se tocan hasta hacer estos pasos**; **no borrar de la caché de la VPS la imagen de MinIO** (por ejemplo con `docker image prune`), porque ya no se puede volver a bajar; mientras conserven su imagen de MinIO siguen
funcionando.

1. **Crear el servicio RustFS** al lado del MinIO (sección anterior), sin tocar MinIO ni la app.
2. **Copiar los datos** con `rclone` desde un contenedor temporal en la misma red de Dokploy, bucket por bucket
   (los 13 de `STORAGE_BUCKETS`, ver `src/shared/lib/storage-buckets.ts`). `sync` crea el bucket si falta:

   ```bash
   for B in document-files document-files-expired contract-documents daily-reports logo avatar \
            clothing-signatures repair-images tire-discards preparte-img invoice-pdfs \
            supplier-documents customer-documents; do
     docker run --rm --network dokploy-network \
       -e RCLONE_CONFIG_OLD_TYPE=s3 -e RCLONE_CONFIG_OLD_PROVIDER=Minio \
       -e RCLONE_CONFIG_OLD_ENDPOINT=http://alphataco-minio:9000 \
       -e RCLONE_CONFIG_OLD_ACCESS_KEY_ID -e RCLONE_CONFIG_OLD_SECRET_ACCESS_KEY \
       -e RCLONE_CONFIG_NEW_TYPE=s3 -e RCLONE_CONFIG_NEW_PROVIDER=Other \
       -e RCLONE_CONFIG_NEW_ENDPOINT=http://alphataco-storage:9000 \
       -e RCLONE_CONFIG_NEW_ACCESS_KEY_ID -e RCLONE_CONFIG_NEW_SECRET_ACCESS_KEY \
       rclone/rclone:1.75.2 sync OLD:$B NEW:$B --checksum
   done
   ```

   Antes de correrlo, exportar en el shell `RCLONE_CONFIG_OLD_ACCESS_KEY_ID`, `RCLONE_CONFIG_OLD_SECRET_ACCESS_KEY`,
   `RCLONE_CONFIG_NEW_ACCESS_KEY_ID` y `RCLONE_CONFIG_NEW_SECRET_ACCESS_KEY`: `-e NOMBRE` sin valor las toma del entorno, así
   las claves no quedan escritas en el comando ni en `ps`. Los nombres de host (`alphataco-minio`, `alphataco-storage`)
   son los `appName` de Dokploy; confirmar la red con `docker network inspect dokploy-network`. Se puede repetir las
   veces que haga falta: solo copia lo que cambió. `--checksum` compara MD5/ETag, válido porque la app no hace subidas
   multipart.
3. **Verificar**: la misma corrida con `check OLD:$B NEW:$B --one-way` en lugar de `sync` debe decir
   `0 differences found` en cada bucket.
4. **Pasada final y cambio** (ventana corta): con la app sin uso, repetir el `sync` del paso 2 para llevar lo último,
   cambiar en el env de la app `S3_ENDPOINT`, `S3_ACCESS_KEY` y `S3_SECRET_KEY` por los de RustFS y redeployar.
5. **Comprobar** `GET /api/health` → `"storage":"ok"` y abrir un documento y un logo desde la app.
6. **Dejar MinIO sin tocar** una o dos semanas como respaldo. **Rollback:** lo que se subió a RustFS después del
   cambio no está en MinIO, así que antes de volver el env hay que copiarlo de vuelta con `rclone copy NEW:$B OLD:$B`
   (`copy`, no `sync`), bucket por bucket; recién después volver `S3_ENDPOINT` y credenciales y redeployar. Mientras
   los dos servicios están vivos hay riesgo de **escribir en el servidor equivocado sin ningún error** (por ejemplo,
   si alguien redeploya con el env viejo): dejar MinIO apagado o en solo lectura apenas se comprueba el paso 5.
   Después, dar de baja el servicio MinIO y su volumen.

**Monitoreo:** un redeploy con el `S3_ENDPOINT` viejo (o con claves que no corresponden) no tumba la app: arranca sin archivos y `/api/health` informa `"storage":"error"` con HTTP 200. El workflow de deploy lo deja en rojo; un "Redeploy" manual en Dokploy no. El monitor de uptime tiene que buscar `"storage":"ok"` en el cuerpo del health, no solo el código 200.

Notas: la app no usa versionado de objetos, URLs firmadas ni políticas de bucket, por eso no hay nada más que
copiar. Los datos de desarrollo local en un volumen de MinIO no se migran (RustFS no lee su formato): se vuelven a
subir.

## Operación

- **Deploy normal**: push a `main`. Un push de solo docs no dispara nada.
- **Redeploy del mismo commit**: Actions → deploy → Run workflow sobre `main`. No reconstruye
  (la imagen ya existe): promueve, llama al webhook y espera el health.
- **Cambiar una `NEXT_PUBLIC_*`**: cambiar la variable de repo y pushear un commit. Un Run workflow
  sobre el mismo commit **no** la hornea (reusa la imagen existente).
- **Rollback por workflow** (preferido): Actions → `rollback` → Run workflow sobre `main` con el commit completo (40 caracteres) cuya imagen `sha-<commit>` ya existe. Hace el retag, dispara Dokploy y espera `/api/health` con ese commit; no reconstruye nada. Tras cada deploy y rollback corre una prueba de humo (`/login` responde 200). **Si el deploy malo dejó una migración fallida** (`migrate deploy` da P3009 y el contenedor no arranca con ninguna imagen), el rollback de imagen no alcanza: primero resolver la migración (`prisma migrate resolve --rolled-back <nombre>` tras revertir a mano lo que haya aplicado) y recién después correr el workflow.
- **Rollback manual**: `docker buildx imagetools create -t registry-31-97-42-82.sslip.io/alphataco:main registry-31-97-42-82.sslip.io/alphataco:sha-<commit-bueno>`
  (logueado al registry) y Redeploy en Dokploy. Verificar con `/api/health` que responde ese
  commit. Las migraciones no se revierten solas: si el commit malo migró, evaluar antes.
- **Verificar un deploy**: `gh run list --workflow deploy.yml`, `gh run view <id>`, y
  `curl <health>` comparando `sha` con el head de `main`.

## Respaldo de la base antes de una migración de riesgo

Una migración es de riesgo si borra o reescribe datos (`DROP`, `UPDATE`/`DELETE` masivos, cambio de tipo,
`NOT NULL` sobre columnas con datos) o cambia políticas de acceso (RLS). Antes de mergearla:

1. En la VPS del cliente, volcar la base con el formato personalizado y comprobar que el archivo no está vacío:
   `docker exec <contenedor-postgres> pg_dump -U <usuario> -Fc <base> > /ruta/respaldo-$(date +%Y%m%d-%H%M).dump`
   (el usuario, la base y el contenedor salen de las variables del servicio en Dokploy; no se copian a este repo).
2. Probar que se puede restaurar: `pg_restore --list respaldo.dump | head` y, para cambios grandes, restaurarlo en
   una base descartable (`createdb prueba && pg_restore -d prueba respaldo.dump`).
3. Mergear. Si la migración sale mal, el rollback de la imagen NO revierte la base: restaurar el volcado en una
   base nueva, apuntar `DATABASE_URL` a ella y redeployar la imagen anterior (workflow `rollback`).
4. Guardar el volcado fuera de la VPS y borrarlo cuando la migración lleve una semana sin problemas.

Los respaldos programados por instancia son parte de la fábrica de instancias (P2-D); hasta entonces este
procedimiento es manual.

## Roles de base de datos para RLS (preparados, apagados)

La migración `app_and_system_roles` crea dos roles **sin acceso** (`NOLOGIN`, sin contraseña) y no cambia ningún dueño ni conexión:

| Rol | Atributos | Lo usará |
| --- | --- | --- |
| `alphataco_app` | sin `BYPASSRLS` | la app (Server Actions, páginas, `/api/*`) |
| `alphataco_system` | con `BYPASSRLS` | jobs, seed, bootstrap de admin, demo y Better Auth |

Si quien migra no puede crear roles, la migración avisa con un `WARNING` y sigue (no queda fallida). En ese caso un administrador de Postgres corre una vez el contenido de `prisma/migrations/20261025130000_app_and_system_roles/migration.sql` como superusuario.

**Activarlos es una acción manual del administrador, y hoy no hace falta** (todavía no hay políticas). Cuando haya lotes de RLS en modo estricto:

1. Como superusuario: `ALTER ROLE alphataco_app LOGIN PASSWORD '<generada>'` y lo mismo con `alphataco_system`. Las contraseñas se guardan solo en los secretos de Dokploy, nunca en el repo.
2. En Dokploy: `MIGRATE_DATABASE_URL` = la URL actual (usuario que migra), `SYSTEM_DATABASE_URL` = la URL de `alphataco_system`, y recién entonces `DATABASE_URL` = la URL de `alphataco_app`. Se redeploya.
3. Prender `TENANT_CONTEXT=on` (misma variable de Dokploy, mismo redeploy): hace que cada consulta de las features lleve la empresa activa a la base. Sin ella, con `alphataco_app` las políticas devuelven filas vacías. Mientras la app conecte como el usuario dueño no hace falta y queda apagada (cuesta ~2 ms por consulta).
4. Verificar `/api/health` y una pantalla con datos. **Rollback:** volver `DATABASE_URL` al usuario original y redeployar.

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
