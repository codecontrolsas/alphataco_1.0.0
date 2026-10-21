# Estado del loop

> Se lee primero y se actualiza al final de cada iteración. Última actualización: 2026-10-21, cierre del backlog T1 a T4 (loop detenido).

## Resumen para la mañana

**Estado (2026-10-21, noche):** las cuatro tareas del backlog (T1 a T4) están hechas, **sin commitear**, en el worktree `/home/yordan/workspace/codecontrol/alphataco-arq` (rama local `feat/arquitectura-instancias`, sin upstream). Opus revisó T1, T2 y T3; sus observaciones están incorporadas (T3: ver el registro de iteraciones).

**Qué se hizo, en una línea cada una:**
- **T1** El alta de una instancia nueva deja de romperse: el seed corre en la imagen de producción, los buckets del almacenamiento S3 se crean solos al arrancar (la app no se cae si fallan; `/api/health` informa `storage` y el deploy queda en rojo), y `bootstrap-admin.ts` reemplaza el SQL del primer admin.
- **T2** Las mutaciones del detalle del parte diario ahora verifican permisos y reglas de estado en el servidor (las mismas de la interfaz), con la fila bloqueada contra carreras; `createRowRelations` ya no es un endpoint; el `preparte` se valida contra la empresa. Auditoría de las demás Server Actions en `AUDITORIA-SERVER-ACTIONS.md`.
- **T3** CI como Ecokit: **Blacksmith** vía `CI_RUNNER` en todos los workflows, e2e con Playwright que levanta la imagen real, `npm run test:all`.
- **T4** `deploy.yml` sin el registro y la imagen escritos a mano (`REGISTRY_HOST`, `IMAGE_NAME`); ficha `instance.example.yml`.
- **T5** MinIO reemplazado por **RustFS** (el de `control-documental-ai`, `credere` y `taskapp`): compose, desarrollo, e2e y docs; migración de datos documentada y probada.

**Verificado en esta VPS:** la suite unitaria completa pasa (ver el registro de iteraciones; los tests de integración con base de datos se saltean sin `DATABASE_URL`); tipos de los archivos tocados sin errores; seed y `bootstrap-admin` contra Postgres 16 descartable; `ensure-buckets`, las 10 pruebas reales de `storage.ts` y las 12 de `/api/files` contra **RustFS 1.0.3**; `scripts/dev-up.sh` de punta a punta; la migración de datos con `rclone`; la consulta `FOR UPDATE` contra el esquema real; YAML de workflows y compose; y los 4 tests de Playwright se listan.

**MinIO reemplazado por RustFS (a pedido del usuario).** La imagen oficial de MinIO (`minio/minio`, `minio/mc`) ya no se puede bajar de Docker Hub, así que el almacenamiento S3 pasó a **RustFS** 1.0.3. Cambió el compose (`minio` + `minio-init` → `storage`; variables `STORAGE_PORT`, `STORAGE_CONSOLE_PORT`, `STORAGE_IMAGE`), `dev-up.sh`, el e2e y las docs; **el código de la app no cambió** (mismo SDK de AWS). **Las instancias que ya corren siguen con MinIO hasta que se migren:** el procedimiento, probado, está en `docs/deploy/runbook.md` ("Almacenamiento S3"). Detalle en T5.

**Lo que NO se pudo verificar (hacelo vos o en el primer PR):**
1. **Ejecución real de `_e2e.yml` en GitHub Actions** (build de la imagen, RustFS, Chromium). Es lo primero a mirar en el PR.
2. **`npm run check-types` completo:** no entra en esta VPS; lo corre el CI.
3. **Canje real del enlace de `bootstrap-admin`** con la app levantada.
4. Pruebas de las pantallas del parte diario en el navegador con distintos roles (crear, editar, asignar recursos, eliminar, edición masiva).

**Qué tenés que hacer vos:**
1. Revisar el diff: `cd /home/yordan/workspace/codecontrol/alphataco-arq && git status && git diff`.
2. Para activar Blacksmith: instalar su GitHub App en la organización (`app.blacksmith.sh` → Install → repo) y recién después cargar la variable `CI_RUNNER` (por ejemplo `blacksmith-2vcpu-ubuntu-2404`). Sin la app, un label `blacksmith-*` deja los jobs en cola para siempre. Mientras la variable esté vacía todo corre en GitHub.
3. Contar en producción `SELECT count(*) FROM preparte WHERE company_id IS NULL` (ver decisiones).
4. Decir **"subí"** si el resultado te sirve. El repo no tiene rama `dev` (solo `origin/main`), así que la rama de trabajo saldría de `origin/main`: confirmá si querés otra base.
5. Contestar las decisiones pendientes (abajo y en `REGLAS-DE-NEGOCIO.md` sección 6).

**Qué NO se hizo a propósito:** commits, push, PR, deploy a producción o a Dokploy, repos nuevos en GitHub, instalación de apps, cambios de credenciales. Ver `MODELO-DE-TRABAJO.md`.

**Fuera de alcance de la noche (siguen pendientes del plan):** API móvil, worker de push, app Expo, motor de sync, `new.sh`, `module.sh`, backups, monitoreo, perfil `mobile` del compose, `rollback.yml`.

## Programa 2 (2026-10-21, segunda noche): terminar la propuesta, multitenant con RLS y calidad del repo

Pedido del usuario: llevar **todo lo que falta** hasta que el repo quede como la propuesta; en especial **multitenant** (hoy hay lugares, sobre todo estadísticas y dashboards, que no filtran por `company_id`, y no siempre se conoce la empresa en la que trabaja el usuario), con **RLS en la base, incluso por rol**, para que la propia base decida qué se ve; subir y desplegar de forma controlada (Blacksmith ya está instalado en la organización); y al final revisar todo el repo (mejores prácticas, orden, sin código muerto, componentizado, reutilizable, unificado). Cómo se publica: `MODELO-DE-TRABAJO.md` ("Cómo se publica cuando el usuario lo pide"). Es un trabajo largo: si se corta, el loop continúa desde este archivo.

**Orden de fases.** Cada ítem: diseño con Opus si hay decisión → implementar → verificar → tests → revisión de Opus → PR → CI → merge → deploy y prueba → actualizar este archivo.

- [ ] **P2-A. Publicar lo ya hecho.** Dos PR desde `origin/main`: (1) infraestructura y docs (T1, T3, T4, T5 y `docs/arquitectura` **sin** `AUDITORIA-SERVER-ACTIONS.md` ni `referencia-propuesta-original-colega.md`), (2) T2 (guardas del parte diario). CI en verde (probar el e2e y ajustar lo que falle), merge, deploy y comprobar `sha` y `storage` en el health. Probar si `CI_RUNNER` con Blacksmith arranca y, si sí, cargarlo.
- [x] **P2-B. Red de seguridad.** (hecho 2026-10-21; falta probar el rollback en un deploy real) `rollback.yml` (`workflow_dispatch` con el `sha`), prueba de humo posterior al deploy y el procedimiento de respaldo de la base de producción antes de migraciones de riesgo.
- [ ] **P2-C. Multitenant + RLS** (la prioridad del usuario).
  - [x] C1. **Auditoría** (2026-10-21, Opus; informe en `docs/arquitectura/RLS-DISENO.md`, sin publicar hasta cerrar los hallazgos abiertos): clasificar las ~215 tablas (global, con `company_id`, hija de otra, por usuario, de autenticación); consultas, SQL crudo, vistas y funciones sin filtro de empresa (dashboards, estadísticas, exportaciones); de dónde sale hoy la empresa activa (cookie, claim de sesión, parámetros del cliente) y dónde no se conoce.
  - [x] C2. **Diseño con Opus** (ídem): roles de base de datos (dueño que migra y rol de aplicación sin `BYPASSRLS`), contexto por transacción (`app.company_id`, `app.user_id`) fijado por una extensión de Prisma en cada operación, funciones `app_current_company_id()` y `app_has_permission(...)`, plantillas de políticas por tipo de tabla, qué hacer con las tablas sin `company_id`, `SECURITY DEFINER`, jobs y cron (contexto de sistema por empresa), seed, rendimiento (índices), pruebas pgTAP con dos empresas, y despliegue por fases (modo sombra, luego estricto) con rollback.
  - [ ] C3. **Contexto de empresa único (`TenantContext`):** se resuelve una vez por request (sesión + empresa activa validada contra la pertenencia), se pasa a todas las capas y deja de venir del cliente.
  - [ ] C4. **Infraestructura RLS** sin forzar nada todavía (roles, funciones, extensión de Prisma, interruptor).
  - [ ] C5. **Políticas por lotes de tablas o módulos**, cada una con pgTAP que pruebe el aislamiento entre empresas; después, modo estricto.
  - [ ] C6. **RLS por rol y permiso** en las tablas sensibles (precios, tesorería, etc.): la base decide qué ve cada rol.
  - [ ] C7. **Estadísticas y dashboards sin fugas:** corregir cada consulta y dejar a RLS como red de seguridad.
  - **Resultado de C1/C2 (resumen público):** con la conexión actual (usuario dueño/superusuario) el RLS no tendría efecto; se proponen tres roles (`alphataco_owner`, `alphataco_app` sin `BYPASSRLS`, `alphataco_system`), contexto por transacción con `set_config(..., true)` desde un `getTenantContext()` único, funciones `SECURITY DEFINER` para pertenencia y permisos, lotes en modo sombra y luego estricto. Orden de PR: 0 limpieza (PR #39), 1 roles y URLs, 2 funciones de contexto, 3 contexto único en la app, 4+ migrar features a `getDb()`, 5 índices de `company_id`, 6–9 lotes de políticas, 10 roles y permisos en la base.
  - **Decisiones de negocio abiertas (el loop no las toma):** D1 roles por instancia o por empresa; D2 empleados o equipos sin empresa; D3 quién edita los catálogos globales; D4 la base aplica solo la separación por empresa o también permisos; D5 empresa activa por sesión o por pestaña; D6 vista de varias empresas juntas; D7 alcance de la API externa; D8 una misma persona (CUIL) en dos empresas.
  - [x] PR 0 de limpieza abierto: #39 (DataTable viejo y función SQL dinámica sin uso).
- [ ] **P2-D. Resto de la propuesta.** Casos de uso con contexto explícito (alineados con `TenantContext`) y piloto de partes diarios (`commandId`, `baseVersion`, `processed_commands`, altas y bajas explícitas); API móvil `/api/mobile/v1` como proceso aparte de la misma imagen (token, OpenAPI, capacidades); worker con outbox y push; prueba de concepto de sincronización; fábrica de instancias (`new.sh`, perfil `mobile` del compose, backups, monitoreo); módulos portables (esquema Prisma multiarchivo, manifiesto, `module.sh`, IDs deterministas); zonas `core/` y `custom/`; bot de upstream; el resto de la auditoría de Server Actions (17 archivos). La app Expo y su repo quedan para el final y requieren decidir el dueño del repo.
- [ ] **P2-E. Calidad de todo el repo.** Inventario con herramientas de solo lectura (código sin uso, duplicados, dependencias sin uso), eliminar código muerto verificando los importadores con CodeGraph y LSP, componentizar y unificar (sistemas deprecados de DataTable, Supabase legado, facets en bloque), mejores prácticas de React y Next, por módulo, con PR y deploy por lote.
- [ ] **P2-F. Cierre.** Revisión final de todo el repo con Opus, deploy final, prueba multiempresa en producción, documentación al día y detener el loop.

## Backlog (en orden)

Cada tarea: diseño con Opus → implementar (Sonnet) → verificar a mano → tests → revisión con Opus → actualizar este archivo.

- [x] **T1a. Seed en la imagen de producción** (2026-10-21). Se agregaron al runner del `Dockerfile` `permission-catalog.ts` y `prisma-pg-config.ts` (las dos únicas piezas que faltaban de las 7 que importa el seed). Verificado con el set exacto de archivos del runner contra un Postgres 16 descartable: **sin el fix falla con `ERR_MODULE_NOT_FOUND`; con el fix** `migrate deploy` y el seed corren (14 módulos, 165 tabs, 15 acciones, 4 roles, 1260 permisos) **y una segunda corrida es idempotente**. Pendiente: una construcción real de la imagen (`docker build`) para confirmar el `COPY`; se hace una sola vez al cerrar las tareas de Dockerfile si `free -m` lo permite.
- [x] **T1b. Buckets idempotentes** (2026-10-21). Diseño consultado con Opus (política de fallo: **fail-open**). Hecho:
  - `scripts/ensure-buckets.ts`: crea los buckets que falten desde `STORAGE_BUCKETS`; espera hasta 20 s al almacenamiento solo ante errores transitorios (conexión o 5xx); credenciales inválidas o 403 fallan enseguida; ignora `BucketAlreadyOwnedByYou`; loguea `created: [...] existing: N`.
  - `docker/entrypoint.sh`: lo corre en cada arranque, después de `migrate` y antes del seed, **sin cortar el arranque** si falla.
  - `Dockerfile`: `COPY` del script y de `storage-buckets.ts`, y `@aws-sdk/client-s3` en el stage `tools` (el trazado de standalone no garantiza que el script lo resuelva).
  - `/api/health` suma `storage: "ok" | "error"` (`HeadBucket` con timeout de 2 s, cacheado 60 s). El HTTP sigue en 200 para que el `HEALTHCHECK` no reinicie el contenedor.
  - `_deploy.yml`: si la app ya corre el sha esperado pero `storage` informa distinto de `ok`, el deploy queda en rojo; si el campo falta (imagen vieja en un rollback) no se exige.
  - El compose ya no tiene `minio-init` (ver T5): `scripts/dev-up.sh` corre este mismo script, así que la lista de buckets es una sola y `storage-buckets.test.ts` verifica que el compose no la duplique.
  - Tests: `scripts/runner-files.test.ts` (todo import local de los scripts del entrypoint debe estar copiado en el runner: habría detectado el bug de T1a) y `src/app/api/health/route.test.ts`. Pasan junto con `storage-buckets.test.ts`.
  - **Almacenamiento real:** probado contra un S3 de mentira y contra RustFS 1.0.3 (ver T5): 13 buckets creados, segunda corrida sin cambios, credenciales malas fallan en 1 s. El `docker build` de la imagen lo cubre el e2e.
- [x] **T1c. `scripts/bootstrap-admin.ts`** (2026-10-21). Reemplaza el bloque SQL de `docs/deploy/runbook.md`. `node scripts/bootstrap-admin.ts --email <mail> --name "<Nombre>" [--company "<empresa>"]` crea, en una transacción, el usuario de Better Auth sin contraseña, el perfil, la pertenencia, el rol `admin` y el token de "definir contraseña" (24 h, mismo formato que la invitación de la app); la empresa es la del seed (`SEED_COMPANY_NAME` por defecto) y queda con dueño solo si no tenía. `--reissue-link` emite otro enlace para un usuario que ya existe. Verificado contra Postgres 16 descartable con migraciones y seed: crea las 6 filas esperadas; repetir falla con mensaje claro; reissue, mail inexistente, empresa inexistente y falta de `--name` dan error sin crear nada. **Sin verificar:** canjear el token con la app real (Better Auth `reset-password`) y la imagen construida; para eso hace falta el `docker build` pendiente.
- [ ] **T1d. Rework de la revisión de Opus (hecho, falta su visto bueno):** `@aws-sdk/client-s3` ahora va en un stage aparte (`s3-tools`) copiado a `scripts/node_modules` (como `demo-tools`) para no pisar las transitivas que trazó el standalone; `_deploy.yml` ya no corta al primer `storage != ok`, espera hasta agotar los intentos; el error de storage se recuerda 10 s en el health (el ok, 60 s); la espera del script baja a 20 s; el test `scripts/runner-files.test.ts` ahora también exige imports relativos con `.ts`, rechaza el alias `@/`, valida el destino del `COPY` y que cada paquete npm figure en el Dockerfile (se probó con 4 controles negativos). **Pendiente para T3:** job de CI que construya la imagen y corra `docker run --entrypoint node <img> scripts/ensure-buckets.ts` y `scripts/seed-company.ts` (deben fallar por "falta la variable", nunca por `ERR_MODULE_NOT_FOUND`).
- [x] **T2. Seguridad del detalle del parte diario** (2026-10-21; diseño consultado con Opus).
  - `detail/lib/row-guards.ts` (nuevo): guardas de servidor que llaman a las **mismas funciones puras** que la interfaz (`row-permissions.ts`). Crear: permiso `update` + parte abierto o de hoy. Editar: `update` + línea editable → edición completa; si solo tiene `assign_resources` → **solo se aplican los recursos y se conservan los campos guardados** (el formulario "Asignar recursos" los tiene bloqueados, así que no cambia la experiencia). Eliminar: `delete` + regla de fecha/estado. Edición masiva: `update` + un pedido que el modal pueda generar (estados `ejecutado`/`cancelado`/`reprogramado` o completar turno; motivo si se cancela; fecha válida si se reprograma).
  - **Carreras:** editar y eliminar vuelven a evaluar la regla dentro de la transacción con la fila bloqueada (`SELECT … FOR UPDATE`), porque otro flujo puede pasar la línea a `en_certificacion` entre el chequeo y la escritura.
  - `createRowRelations` (y `EmployeeInput`) salieron del archivo `'use server'` a `detail/lib/row-relations.ts`: dejó de ser un endpoint invocable desde el navegador.
  - **Perímetro de `preparte_id`:** ahora se valida que el preparte sea de la empresa activa (antes se podía vincular uno de otra empresa), y al eliminar una línea solo se revierte el preparte si es de la empresa.
  - Los errores de regla son `RowRuleError` (se relanzan; el resto sigue siendo el mensaje genérico). En producción Next oculta el mensaje de los errores lanzados por Server Actions, así que el usuario puede ver un mensaje genérico: la UI ya oculta esas acciones y esto es defensa en profundidad.
  - Tests: `row-guards.test.ts` (29 casos: permisos, estados, fechas, lote, reevaluación bajo bloqueo). Verificado además que la consulta de bloqueo es válida contra el esquema real (Postgres 16 con migraciones) y que los estados del enum coinciden con los de la interfaz.
  - **Auditoría** de las demás Server Actions: `AUDITORIA-SERVER-ACTIONS.md` (17 candidatos, sin tocar).
- [x] **T3. CI estilo Ecokit** (2026-10-21). **El servicio externo que usa Ecokit es Blacksmith** (runners más rápidos para GitHub Actions, con builder persistente y caché; se activa con la variable de repo `CI_RUNNER`, por ejemplo `blacksmith-2vcpu-ubuntu-2404`). Alphataco ya lo tenía cableado solo para el build de la imagen (`_build-image.yml` + `deploy.yml`). Ahora además:
  - `ci.yml` (jobs de tipos/tests y de base de datos) y el job `verify` de `deploy.yml` corren en `${{ vars.CI_RUNNER || 'ubuntu-latest' }}`. Sin la variable no cambia nada. **No se setea ningún label `blacksmith-*`** (requiere instalar la GitHub App a mano).
  - `_e2e.yml` (reutilizable, llamado desde `ci.yml`): levanta el compose de producción con `RUN_SEED=true` (imagen real y su entrypoint: migraciones, buckets contra un RustFS real, seed), verifica en los logs `Buckets OK` y `Seed OK`, comprueba que `/api/health` informe `"storage":"ok"`, carga los datos de prueba de login (`seed-auth-fixtures.ts`) y corre Playwright. Esto cubre los huecos pendientes de T1: `docker build` real, MinIO real y `ERR_MODULE_NOT_FOUND` en el runner.
  - **Revisión de Opus de T3 incorporada:** liberar disco del runner antes del build; `--wait-timeout 900`; `concurrency` en `ci.yml` (un push nuevo cancela el e2e en vuelo); el e2e no bloquea al resto (depende solo de `types-and-lint`; no marcarlo como check requerido hasta tener 2 o 3 corridas verdes); y el problema de MinIO de abajo.
  - **Almacenamiento en el e2e:** usa el RustFS del propio compose (`--wait` espera su healthcheck, que usa `curl`); variable de repo opcional `STORAGE_IMAGE` para un espejo propio.
  - Playwright: `@playwright/test` 1.64.1 agregado a `package.json` y al lock (calculado aparte con `--package-lock-only`; el único otro cambio del lock es la baja de un `prettier` marcado `extraneous` bajo `@posthog/cli`), `playwright.config.ts` y `e2e/` con 4 tests (`smoke.spec.ts`: health y pantalla de ingreso; `login.spec.ts`: ingreso válido e inválido). `npm run e2e`.
  - `npm run test:all` encadena `npm test` y las suites con base de datos.
  - **Verificado:** los 5 YAML parsean; `playwright test --list` lista los 4 tests con Playwright instalado aparte. **NO verificado:** la ejecución real de `_e2e.yml` (necesita el build completo de la imagen y Chromium: no entra en esta VPS). Es lo primero a mirar en el primer PR; los puntos probables de ajuste son el host de `E2E_BASE_URL` (Better Auth valida el origen) y los tiempos de `--wait`.
  - Falta (de Ecokit, a sumar cuando la suite crezca): shards, carril rápido de "solo lo que falló" e informe unificado.
- [x] **T4. Ficha de instancia y deploy parametrizado** (2026-10-21).
  - `deploy.yml`: el registro y el nombre de la imagen ya no están escritos a mano; salen de las variables de repo `REGISTRY_HOST` e `IMAGE_NAME`, y si están vacías valen lo de antes (`registry-31-97-42-82.sslip.io/alphataco`), así que **esta instancia no cambia**. Un clon define las suyas y no pisa el tag `:main` de las demás instancias. Documentadas en `docs/deploy/runbook.md`.
  - `instance.example.yml` (raíz): formato de la ficha por cliente (cliente, base, dominio, empresa, registro, runner de CI, módulos, móvil, VPS, backups). **Todavía no la lee ningún script**: hoy es referencia para dar de alta una instancia; sus consumidores (`scripts/instance/new.sh`, perfiles del compose) siguen pendientes.
  - **Los "alphataco" del compose y de los scripts de test se dejan a propósito:** nombre de proyecto de compose, usuario y base de Postgres y red son internos de cada VPS, no chocan entre clientes. Lo que sí chocaba era el nombre de la imagen en el registro compartido (resuelto arriba).
  - Sigue pendiente de la fábrica: `new.sh`, perfil `mobile` del compose, `rollback.yml`, backups y monitoreo.

- [x] **T5. MinIO → RustFS** (2026-10-21, a pedido del usuario: reemplazar MinIO por un almacenamiento como el RustFS que usan otros proyectos y revisarlo).
  - **Revisión:** RustFS lo usan `control-documental-ai` (dev y prod en Dokploy, con el mismo SDK de AWS, path-style y región `us-east-1`), `credere` y `taskapp`. Imagen estable `rustfs/rustfs:1.0.3` (2026-10-17) disponible en Docker Hub, GHCR y Quay; trae `curl` (el healthcheck normal sirve), corre como usuario no root (uid 10001), ocupa unos 76 MiB en reposo, persiste al reiniciar y responde `/health` y también `/minio/health/live`. Credenciales por `RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY` (con las de fábrica, `rustfsadmin`, la imagen avisa).
  - **Compatibilidad verificada contra RustFS real:** `ensure-buckets` (13 buckets, idempotente, credenciales malas fallan en 1 s), las **10 pruebas de integración de `storage.ts`** (firma SigV4 con path-style, checksums de `PutObject`, `CopySource` con tildes, buckets privados, listado, upsert, borrado) y las **12 de la ruta `/api/files`** (streaming y perímetro).
  - **Cambios:** `docker-compose.yml` (`storage` reemplaza a `minio` y `minio-init`; imagen fijada y `STORAGE_IMAGE`; los `MINIO_PORT*` de un `.env.docker` viejo se siguen aceptando), `scripts/dev-up.sh` (corre `ensure-buckets.ts`), `.env.docker.example`, `.env.example`, `_e2e.yml` (se eliminó `docker-compose.e2e.yml`, ya innecesario), `storage-buckets.test.ts`, comentarios del código y docs. `dev-up.sh` probado de punta a punta en un proyecto de compose aparte.
  - **Migración de datos de instancias existentes:** documentada en `docs/deploy/runbook.md` y **probada** con `rclone` entre un MinIO y un RustFS (claves con espacios y tildes, tipos de contenido, 300 KB): `rclone check` con 0 diferencias y una segunda pasada que no copia nada. No se ejecutó nada en producción.
  - **Permisos del volumen:** con un volumen administrado por Docker funciona sin tocar nada; con una carpeta del host de otro usuario RustFS no arranca (`Permission denied`) hasta hacer `chown 10001:10001` o usar `RUSTFS_UID`/`RUSTFS_GID` (probado y documentado en el runbook).
  - **Revisión de Opus de T5 incorporada:** rollback con `rclone copy` hacia atrás y aviso de "cerebro partido"; `appName` de Dokploy en los hosts de `rclone`; `rclone` fijado (1.75.2) y credenciales sin valor en el comando; monitor que busque `"storage":"ok"`; no reutilizar el volumen de MinIO; `--remove-orphans` en desarrollo; imagen de RustFS **fijada por digest** en el compose (lo ideal es copiarla al registro propio).
  - **No migra:** el volumen local de MinIO de desarrollo (RustFS no lee su formato; se vuelven a subir los archivos).
  - **Pendiente:** decidir cuándo migrar la instancia de Dokploy (hoy `alphataco-minio`); confirmar que el servicio de RustFS no se publique; opcionalmente probar una versión más nueva antes de dejar fija la 1.0.3.

**Fuera de alcance de la noche:** API móvil, worker de push, app Expo, motor de sync, fábrica `new.sh` completa, `module.sh`. Dependen de decisiones abiertas.

## Decisiones pendientes

Ver `REGLAS-DE-NEGOCIO.md` sección 6. Las que aparezcan durante el trabajo se agregan acá:

- **Edición masiva y estados protegidos (negocio).** Hoy, desde el modal de edición masiva, se puede marcar `ejecutado` una línea `en_certificacion` o una ya ejecutada de un parte anterior: el modal no aplica por fila las reglas que sí aplican "Editar" y "Asignar recursos". T2 replicó la interfaz tal cual (no cambió el comportamiento). ¿La edición masiva debe respetar esas dos reglas? Si sí, es agregar la verificación por fila en `authorizeBulkRowUpdate` (rechazar el lote entero si alguna no es elegible).
- **`preparte.company_id` nulo (datos).** `preparte_id` ahora se valida contra la empresa; un preparte viejo con `company_id` nulo ya no se podría vincular a una línea. Conviene contar cuántos hay en producción antes de subir (`SELECT count(*) FROM preparte WHERE company_id IS NULL`).
- **Migración de la instancia que corre en producción (técnica).** Producción sigue con MinIO (`alphataco-minio` en Dokploy) hasta que se migre con el procedimiento del runbook. ¿Cuándo? Mientras tanto no hay que borrar esa imagen de la caché de la VPS (por ejemplo con un `docker image prune`), porque ya no se puede volver a bajar.
- **Crear línea exige `update`, no `create`** (ya figuraba en `REGLAS-DE-NEGOCIO.md` 4 y 6.11).
- **bootstrap-admin (Opus lo marcó, resuelto en parte):** el alta real (`createUserForCompany`) guarda `profile.role = role.name`, igual que el script (el `'User'` del SQL viejo era solo el valor por defecto; el permiso sale de `user_roles`). **Falta** verificar el canje real del enlace con la app levantada en el primer alta.

## Recursos en uso

| Qué | Cómo se bajó |
|---|---|
| (ningún contenedor ni proceso levantado todavía) | — |

Registrar acá todo contenedor, volumen o proceso que se levante, con su nombre y puerto, y bajarlo (sin `-v`) al terminar la tarea.

## Registro de iteraciones

| # | Fecha | Tarea | Resultado | Verificado | Pendiente |
|---|---|---|---|---|---|
| 0 | 2026-10-21 | Preparación: worktree, documentación, estado | Hecho | Docs escritos | Empezar T1a |
| 1 | 2026-10-21 | T1a: seed en la imagen de producción | Hecho: 2 `COPY` en `Dockerfile` | Simulación del runner con Postgres descartable (control falla, fix funciona, idempotente). Contenedor bajado | `docker build` real pendiente |
| 2 | 2026-10-21 | T1b: buckets idempotentes + `storage` en health + chequeo en el deploy | Hecho (ver backlog) | Tipos del grafo de archivos tocados (`tsc` acotado); 3 archivos de test pasan; script probado contra S3 de mentira | MinIO real, `docker build`, revisión final de Opus |
| 7 | 2026-10-21 | T5: MinIO → RustFS (a pedido del usuario) | Hecho | `ensure-buckets`, 10 pruebas de `storage.ts` y 12 de `/api/files` contra RustFS 1.0.3; `dev-up.sh` de punta a punta; migración con `rclone` (0 diferencias); contenedores y volúmenes de prueba eliminados | Migrar la instancia de producción (decisión); ejecución real del e2e en GitHub |
| 6 | 2026-10-21 | T3 (CI Blacksmith, e2e, `test:all`) + T4 (deploy parametrizado, ficha) + hallazgo de MinIO + cierre | Hecho. Loop detenido: backlog completo | 1.489 tests unitarios pasan; YAML de workflows y compose válidos; fusión del override de e2e con `docker compose config`; `ensure-buckets` contra MinIO real (fork de Coolify); Playwright lista 4 tests. 0 contenedores levantados | Ejecución real de `_e2e.yml` en GitHub; `check-types` completo (CI); decisiones de negocio y de MinIO |
| 5 | 2026-10-21 | Revisiones de Opus de T2 y T3 e incorporación | Hecho (T2: rechazar `en_certificacion`, `preparte` solo si cambia; T3: disco, `--wait-timeout`, `concurrency`, MinIO) | Tests y tipos tras cada cambio | — |
| 4 | 2026-10-21 | T2: seguridad del detalle del parte diario + auditoría de Server Actions | Hecho (ver backlog) | `tsc` acotado sin errores; 45 tests pasan (29 de guardas); consulta `FOR UPDATE` validada contra el esquema real; contenedor bajado | Decisiones de negocio (edición masiva, `preparte.company_id` nulo); prueba con la app y sesión reales |
| 3 | 2026-10-21 | Revisión de Opus de T1a/T1b y rework (T1d); T1c `bootstrap-admin.ts` | Hecho | `tsc` acotado sin errores; 19 tests pasan (4 controles negativos del test estático); `bootstrap-admin` probado contra Postgres descartable. Contenedores bajados | Visto bueno de Opus al rework; MinIO real; `docker build` |

## Hallazgos que van apareciendo

- **`npm run check-types` completo no entra en esta VPS:** se queda sin heap incluso con 3 GB (el CI usa 8 GB) y ya hay dos `tsserver` de 2 GB cada uno en memoria. Para verificar tipos se usa una config acotada al grafo de archivos tocados: `tsconfig.verify.json` en el directorio temporal de la sesión, con `extends` del `tsconfig.json` del repo, `incremental: false` y `include` con las rutas absolutas de los archivos tocados. Corre en unos 8 segundos y detecta errores (se probó con un error intencional). **El `check-types` completo queda para el CI.**
- **El worktree usa un enlace simbólico `node_modules` hacia el checkout principal y una copia de `src/generated`** (ambos ignorados por git). No se commitean.
- **La imagen oficial de MinIO ya no se puede bajar de Docker Hub** (`minio/minio` y `minio/mc` responden `denied`; `quay.io/minio/minio` da `401`; Docker Hub funciona para otras imágenes). **Resuelto con T5 (RustFS).** Las instancias existentes siguen con su imagen en caché hasta migrar.
- **`prisma.config.ts` y `scripts/*.ts` muestran el aviso `MODULE_TYPELESS_PACKAGE_JSON`** al correrse con Node 24: es inofensivo (el seed ya lo hacía).

## Cómo retomar (persona o sesión nueva)

1. `cd /home/yordan/workspace/codecontrol/alphataco-arq` (rama `feat/arquitectura-instancias`, sin upstream).
2. Leer este archivo y `MODELO-DE-TRABAJO.md`.
3. Tomar la primera tarea sin tildar del backlog, consultar a Opus ante cualquier duda de diseño y seguir el flujo de `/dev`.
4. Al terminar cada paso, actualizar este archivo.
