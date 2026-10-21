# `prisma/sql/` — lógica SQL vigente (funciones, triggers y vistas)

Extracción de la última definición vigente de cada función, trigger y vista a partir de las migraciones históricas (hoy archivadas en `docs/legacy-migrations/{supabase,prisma}`), agrupada por dominio, **revisada a mano en la Task 4 del plan P1** para Postgres plano (sin `auth`/`storage`/`net`/`cron`). Es la fuente de verdad de la lógica SQL: `npm run db:baseline` la concatena en `prisma/migrations/0_init/migration.sql`.

## Convención: actor de la transacción (`app.user_id`)

En Supabase el usuario salía de `auth.uid()` / `auth.jwt()` / `request.jwt.claims`. Acá lo reemplaza `public.app_current_user_id()` (`misc.sql`):

```sql
nullif(current_setting('app.user_id', true), '')::uuid
```

**Las transacciones que disparan estos triggers deben ejecutar `SET LOCAL app.user_id = '<uuid>'`** (helper `withActor` en P2) antes de la escritura; si no, el actor queda `NULL` (mismo comportamiento que antes sin JWT: jobs, seeds, psql). Quién lo usa:

| Usa `app_current_user_id()` | Columna que llena |
| --- | --- |
| `log_maintenance_order_activity`, `log_work_order_activity` | `maintenance_activity_log.performed_by` (FK a `profile.id`) |
| `log_dailyreport_changes`, `log_customer_equipment_relations_changes`, `log_employee_relations_changes`, `log_equipment_relations_changes` | `dailyreportrows_history.changed_by` (FK a `profile.credential_id`) |
| `controlar_alertas_documentos_single_employee` / `_vehicle` | `documents_employees.user_id` / `documents_equipment.user_id` de las alertas creadas |
| DEFAULT de columna (en `schema.prisma`) | `diagrams_logs.modified_by`, `vehicles.user_id` |

El valor a setear es el que devolvía `auth.uid()`: el **uid de auth = `profile.credential_id`**. En los datos reales `profile.id = profile.credential_id` (el trigger de alta de Supabase los creaba iguales), por eso las dos FKs de arriba funcionan con el mismo valor. Si alguna vez difieren, `maintenance_activity_log.performed_by` (FK a `profile.id`) rompería: `withActor` debe garantizar esa igualdad o resolver el `profile.id`.

## Multi-empresa

Las funciones que asumían mono-empresa ("solo GH tiene recursos") filtran por la empresa de la fila/parámetro; los `document_types` globales (`company_id IS NULL`) aplican a todas las empresas. `get_max_order_number(p_company_id)` y `get_documents_expiry_summary(..., p_company_id)` reciben la empresa (opcional, NULL = comportamiento viejo) — los llamadores en `src/` se ajustan en P2. Detalle por función en `INVENTARIO.md`, columna "Cambios al portar".

## Archivos

| Archivo | Contenido |
| --- | --- |
| `permissions.sql`, `documents.sql`, `diagrams.sql`, `daily-report.sql`, `kpis.sql`, `maintenance.sql`, `misc.sql` | Objetos portables, aplicables tal cual con `psql -f` sobre una BD que ya tenga las tablas. Dentro de cada archivo: funciones, después vistas, después triggers. |
| `tenant.sql` | Contexto de empresa para RLS: `app_current_company_id()`, `app_current_actor_kind()`, `app_rls_mode()` y `app_accessible_company_ids()` (misma regla que `canUseCompanyAsTenant()`). Aún no hay políticas que las usen. |
| `INVENTARIO.md` | Tabla por objeto (nombre, tipo, dominio, tabla, llamadores, referencias Supabase), resumen con conteos, lista "Sin llamador — no se portan", "Descartados por tabla eliminada", "Con referencias Supabase" y sobrecargas detectadas. |
| `objects.json` | Inventario completo en JSON: TODOS los objetos vigentes, incluidos los huérfanos (`orphan: true`) y los descartados (`discarded: '...'`), con sus llamadores y referencias. |

## Cómo se generaron (histórico — NO volver a correr)

```sh
node scripts/sql/extract-sql-objects.ts   # pisa las ediciones manuales de la Task 4
```

(Node ≥ 22.18 ejecuta TypeScript directamente por type stripping.) El script:

1. Lee en orden cronológico `docs/legacy-migrations/supabase/*.sql` (por nombre) y luego `docs/legacy-migrations/prisma/<timestamp>_*/migration.sql` con timestamp ≥ `20260313` (`0_baseline` no se lee: es una re-serialización del esquema).
2. Divide cada archivo en sentencias con `scripts/sql/split-statements.ts` (respeta strings, comentarios y dollar-quoting).
3. Aplica `CREATE [OR REPLACE] FUNCTION|TRIGGER|VIEW` como upsert y `DROP FUNCTION|TRIGGER|VIEW|TABLE` como baja (los triggers caen con su tabla). Los nombres se comparan sin comillas ni `public.`, en minúsculas; las funciones sólo por nombre (sin firma). Todo lo demás (tablas, policies, grants, `cron.schedule`, `ALTER`) se ignora.
4. Descarta los objetos que mencionen tablas eliminadas en Fases 1–2 (`checklist_answer_repairs`, `repair_solicitudes`, `repairlogs`, `hired_modules`) y los triggers cuya función se descartó.
5. Detecta llamadores: `src/` (`rpc('nombre'`, `nombre(` en SQL crudo, o el nombre como literal, p. ej. `source` de `daily_indicators`), edge functions de `supabase/functions/`, triggers que ejecutan la función, otras funciones/vistas que la usan y jobs `cron.schedule` de las migraciones. Las menciones en comentarios no cuentan.
6. Marca como huérfano (no se porta) todo objeto sin llamadores vigentes, hasta punto fijo: un llamador que a su vez es huérfano o descartado no cuenta.

## Dominios (primera coincidencia gana, sobre el nombre)

| Dominio | Patrones |
| --- | --- |
| `permissions` | `permission`, `role`, `module`, `tab` |
| `documents` | `documento`, `document`, `alerta`, `status` |
| `diagrams` | `diagram`, `novelty`, `absence`, `hr_` |
| `daily-report` | `daily`, `preparte`, `deviation` |
| `kpis` | `kpi`, `indicator`, `services_summary` |
| `maintenance` | `maintenance`, `work_order`, `repair`, `tire`, `checklist` |
| `misc` | el resto |

Los triggers se clasifican por el nombre de la función que ejecutan; si ese nombre no decide, por el nombre de la tabla. Las funciones sin dominio quedan en `misc.sql`, que es el primero en el orden de concatenación del baseline (`misc` → `permissions` → `documents` → `diagrams` → `daily-report` → `kpis` → `maintenance`), así los triggers de otros dominios encuentran sus funciones ya creadas.

## Edición manual (flujo vigente)

Los `.sql` son la fuente de verdad y se editan a mano. Un cambio en una función/trigger/vista se hace **dos veces**: en `prisma/sql/<dominio>.sql` (para que un baseline futuro lo incluya) **y** como `CREATE OR REPLACE` en la migración del cambio (`prisma/migrations/<timestamp>_<nombre>/migration.sql`), porque `0_init` no se regenera después del primer `prisma migrate deploy` real. Ver `.claude/rules/migrations.md`.

Al agregar código nuevo: nada de `auth.`, `storage.`, `extensions.`, `net.`, `cron.`, `pgsodium`, `uuid_generate_v4()` (usar `gen_random_uuid()`). `npm run db:baseline` falla si detecta alguna de esas referencias.

**Las funciones nuevas no usan `SECURITY DEFINER`.** En Supabase servía para saltar RLS; acá no hay RLS y la app se conecta con el owner del esquema, así que no aporta nada y amplía la superficie de ataque. Si alguna vez hiciera falta (por ejemplo un rol de solo lectura que necesite ejecutar una función que escribe), va acompañado obligatoriamente de `SET search_path = pg_catalog, public` para evitar el secuestro del search_path.
