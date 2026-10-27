# Migraciones con Prisma (Postgres plano)

## Principio Fundamental

**TODAS las migraciones se gestionan con Prisma contra el Postgres del compose** (`docker compose --env-file .env.docker up -d postgres`, `postgresql://alphataco:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/alphataco` — el puerto es `POSTGRES_PORT` de tu `.env.docker`, default 5432). Ya no hay Supabase: no existen `auth.`, `storage.`, `extensions.`, `net.`, `cron.`. RLS se esta incorporando por lotes (ver `docs/arquitectura/LOOP-ESTADO.md`, P2-C). Los MCPs de Supabase son historia; para verificar se usa `psql` dentro del contenedor.

## Punto de partida: el baseline `0_init`

`prisma/migrations/0_init/migration.sql` es la **unica** migracion inicial. Lo genera `npm run db:baseline` (`scripts/sql/build-baseline.ts`) concatenando:

1. Extensiones (`pgcrypto`; `uuid-ossp`/`moddatetime` solo si algun `.sql` las usa — hoy ninguno).
2. `app_current_user_id()` (es DEFAULT de columna, tiene que existir antes del DDL).
3. El DDL de `prisma/schema.prisma` via `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script` (Prisma 7: el flag es `--to-schema`, no `--to-schema-datamodel`), reescribiendo las 4 columnas `GENERATED ALWAYS AS ... STORED` que Prisma no modela (`checklist_answers.customer_id/horometro/kilometraje`, `employees.full_name`).
4. `prisma/sql/*.sql` en orden `misc → permissions → documents → diagrams → daily-report → kpis → maintenance` (funciones, vistas y triggers revisados en la Task 4 de P1).

**El baseline NO se regenera despues del primer `prisma migrate deploy` real.** Regenerarlo cambia el checksum de `0_init` y rompe `_prisma_migrations` en toda BD ya desplegada. Si todavia no hay ninguna BD real (solo el compose local), se puede regenerar y resetear: `npm run db:baseline && npm run db:reset && npx prisma migrate deploy`.

Las migraciones viejas (Supabase + Prisma sobre Supabase) estan archivadas en `docs/legacy-migrations/` y no se ejecutan.

## Flujo Unico de Migracion (SIEMPRE)

Todo cambio posterior al baseline es una carpeta manual `prisma/migrations/YYYYMMDDHHMMSS_nombre/migration.sql` + `prisma migrate deploy`:

```bash
# 0. Postgres del compose arriba y al dia
docker compose --env-file .env.docker up -d --wait postgres
# El puerto es POSTGRES_PORT de tu .env.docker (default 5432); la password es POSTGRES_PASSWORD
set -a; source .env.docker; set +a
export DATABASE_URL=postgresql://alphataco:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT:-5432}/alphataco
# DATABASE_URL manda (prisma.config.ts: `DATABASE_URL ?? DIRECT_URL`). DIRECT_URL ya
# NO tiene precedencia: solo se usa como fallback si DATABASE_URL no esta seteada
# (ej. un .env viejo con un DIRECT_URL de Supabase ya no puede pisar el compose).
npx prisma migrate deploy                 # aplica lo pendiente (0_init en una BD vacia)

# 1. Modificar prisma/schema.prisma si el cambio es de estructura (tablas, columnas, indices, relaciones)
#    Si es SQL custom (funciones, triggers, vistas, datos), saltar este paso

# 2. Generar el DDL del diff entre la BD del compose (que ya tiene todas las migraciones) y el schema
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
#    Alternativa sin BD al dia: --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script
#    (necesita una shadow DB: `datasource.shadowDatabaseUrl` en prisma.config.ts, p. ej.
#    SHADOW_DATABASE_URL=postgresql://alphataco:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/alphataco_shadow, creada a mano)

# 3. Revisar el SQL generado — SOLO tomar los cambios que necesitamos
#    Prisma puede detectar drift (p. ej. las columnas GENERATED) y agregar cambios colaterales no deseados

# 4. Crear la carpeta de migracion manualmente
mkdir -p prisma/migrations/YYYYMMDDHHMMSS_nombre_descriptivo

# 5. Escribir migration.sql con SOLO los cambios necesarios
#    Estructura: el ALTER TABLE / CREATE TABLE / CREATE INDEX relevante del diff
#    SQL custom: escribir el SQL directamente (CREATE OR REPLACE FUNCTION, CREATE TRIGGER, INSERT ...)

# 6. Aplicar contra el compose (registra la migracion en _prisma_migrations)
npx prisma migrate deploy

# 7. Regenerar el Prisma Client
npx prisma generate

# 8. Verificar con psql (dentro del contenedor) que los cambios se aplicaron
docker compose --env-file .env.docker exec -T postgres psql -U alphataco -d alphataco -c "\d nombre_tabla"
```

## Funciones, triggers y vistas: cambio DOBLE

La logica SQL vive en `prisma/sql/<dominio>.sql` (fuente de verdad, ver `prisma/sql/README.md` e `INVENTARIO.md`). Al modificar o crear una funcion/trigger/vista:

1. Editar `prisma/sql/<dominio>.sql` (para que un baseline futuro la incluya).
2. Escribir **la misma** `CREATE OR REPLACE FUNCTION ...` / `DROP TRIGGER IF EXISTS ... CREATE TRIGGER ...` en la migracion del cambio (paso 5), porque el baseline no se regenera.

Reglas de contenido:

- Actor de la transaccion: `public.app_current_user_id()` (lee `app.user_id`; la app lo setea con `SET LOCAL app.user_id = '<uuid>'` via `withActor`). NUNCA `auth.uid()`, `auth.jwt()` ni `request.jwt.claims`.
- Empresa: toda funcion recibe/filtra `company_id`; nada de supuestos "solo GH". Los `document_types` globales tienen `company_id IS NULL`.
- Toda tabla de negocio nueva lleva `company_id uuid NOT NULL DEFAULT public.app_current_company_id()` (la empresa sale del contexto de la transaccion, la peticion no la envia) y, si tiene RLS, `SELECT public.app_enable_tenant_isolation('public.<tabla>')`; en `schema.prisma`: `company_id String @default(dbgenerated("app_current_company_id()")) @db.Uuid`.
- UUIDs: `gen_random_uuid()` (pgcrypto). NUNCA `uuid_generate_v4()`.
- Prohibido: `auth.`, `storage.`, `extensions.`, `net.`, `cron.`, `pgsodium`. Las policies RLS solo van dentro del plan por lotes de P2-C (shadow antes de estricto), nunca sueltas en una migracion cualquiera. **Excepcion admitida (decision D8, portal de empleados, ticket 804): la capa por empleado.** Una tabla con filas de un empleado (acceso al portal, aceptaciones, intentos, lecturas de HSE) puede llevar, en su migracion de alta y SIEMPRE despues de `app_enable_tenant_isolation`, `SELECT public.app_enable_employee_self('public.<tabla>', '<modulo:tab:view>', '<modulo:tab:accion>'[, 'employee_id', <self_write>])` (helper de `prisma/sql/tenant.sql`). Agrega politicas RESTRICTIVAS que fallan cerradas: se ve la fila del legajo de la transaccion (`app_current_employee_id()`, que fija `getTenantContext()`) o con el permiso del dashboard; escribir exige el permiso (o la fila propia si `p_self_write`). Para tablas de CONTENIDO que el empleado lee solo en parte (documentos HSE publicados que le aplican), `SELECT public.app_enable_read_gate('public.<tabla>', '<modulo:tab:view>'[, '<funcion_compuerta(uuid)>'::regprocedure, '<columna>'])`: lectura RESTRICTIVA con el permiso o la compuerta (`SECURITY DEFINER`, en `prisma/sql/<dominio>.sql`); sin compuerta, leer exige el permiso. Nada de politicas escritas a mano: solo estos helpers. Los jobs (antes `cron.schedule` + `net.http_post`) se disparan desde el servicio `cron` del compose (P5) llamando a la app.

## Ejemplos

### Cambio de estructura (agregar columnas)

```bash
# 1. Modificar schema.prisma (agregar columnas al modelo)
# 2. Generar diff
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
# 3. Del output, extraer SOLO el ALTER TABLE relevante
# 4-8. Seguir el flujo
```

### SQL custom (funcion, trigger, insert de datos)

```bash
# 1. NO modificar schema.prisma
# 4. Crear carpeta de migracion
# 5. Escribir el SQL a mano en migration.sql Y en prisma/sql/<dominio>.sql
# 6-8. Seguir el flujo
```

### Resetear el compose (solo local, borra los datos)

```bash
npm run db:reset            # recrea el contenedor y el volumen pgdata, espera healthy
npx prisma migrate deploy   # vuelve a aplicar 0_init + todas las migraciones
```

## Verificacion Post-Migracion (OBLIGATORIO)

Despues de TODA migracion, verificar con `psql` en el contenedor:

1. **Para estructura**: `\d nombre_tabla` (columnas, tipos, NOT NULL, indices, FKs)
2. **Para funciones/triggers**: `\df public.nombre_funcion`, `SELECT pg_get_functiondef('public.nombre_funcion'::regproc)`, `\d tabla` (seccion Triggers)
3. **Para datos**: `SELECT` de los registros insertados

```sql
-- Ejemplo de verificacion de columnas
SELECT column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'nombre_tabla'
AND column_name IN ('col1', 'col2')
ORDER BY ordinal_position;
```

## Deploy

En cada deploy se ejecuta `npx prisma migrate deploy` (`npm run build` lo hace antes de `next build`), que aplica automaticamente todas las migraciones pendientes en `prisma/migrations/` contra el `DATABASE_URL` del entorno. Se necesita `prisma/migrations/migration_lock.toml` (`provider = "postgresql"`).

## Reglas Criticas

1. **NUNCA** usar `npx prisma migrate dev` — el flujo es manual: diff → carpeta → SQL → `migrate deploy` → `generate`
2. **NUNCA** regenerar `0_init` despues del primer deploy real; los cambios van en migraciones nuevas
3. **SIEMPRE** revisar el output de `migrate diff` y tomar SOLO los cambios necesarios (ignorar drift colateral, en especial las columnas GENERATED)
4. **SIEMPRE** duplicar los cambios de funciones/triggers/vistas en `prisma/sql/<dominio>.sql`
5. **SIEMPRE** usar nombres descriptivos en las migraciones (en ingles, snake_case) con timestamp `YYYYMMDDHHMMSS`
6. **SIEMPRE** verificar post-migracion con `psql` en el contenedor
7. **NUNCA** `auth.`/`storage.`/`extensions.`/`net.`/`cron.`/`uuid_generate_v4()` en SQL nuevo
8. Si algo falla a mitad de una migracion, corregir el SQL y usar `npx prisma migrate resolve --rolled-back <nombre>` (o `--applied`) para dejar `_prisma_migrations` consistente antes de volver a `migrate deploy`
