# RLS y contexto de tenant único — auditoría y diseño

> Estado: **propuesta para revisar** (2026-10-21). Nada de esto está implementado. Documento de solo lectura sobre el
> código del worktree `alphataco-arq`; no se tocó ninguna base. Los números de tablas, llamadas y archivos salen de
> scripts sobre `prisma/schema.prisma` y `src/` (método en §5); los que dependen de datos (filas NULL, tamaños) traen
> la consulta para medirlos, no un valor inventado.

## 0. Resumen ejecutivo

- **Hoy el RLS sería un no-op aunque existieran políticas.** La app, `prisma migrate deploy` (en `docker/entrypoint.sh`),
  los jobs, el seed y pgTAP conectan todos con `POSTGRES_USER=alphataco` del `docker-compose.yml`, que en la imagen
  oficial `postgres:16` es **superusuario y dueño de todas las tablas** (bypassa RLS siempre). Lo primero es separar roles.
- **El aislamiento actual está bien hecho, pero es por convención.** `getActiveCompanyId()` aparece en 1.238 líneas (incluye imports) de 310
  archivos, `withCompany()` 256 veces y hay módulos de perímetro por feature. Un barrido de las 2.952 llamadas Prisma
  sobre modelos clasificados deja 385 "sospechosas"; de 12 archivos trazados a mano, **0 tenían un filtro de empresa
  olvidado** (el `where` se arma aguas arriba) y 1 mostró un problema de diseño (roles globales, F2). Los problemas reales están en SQL dinámico, en funciones con `p_company_id DEFAULT NULL`, en
  tablas globales que se editan desde una empresa (`roles`) y en el contexto de sesión, no en los `findMany` sueltos.
- **217 modelos**: 95 directos + 3 directos-de-usuario, 13 con `company_id` nullable (5 catálogos mixtos, 8 con NULL
  sospechoso, incluidos `employees` y `vehicles`), 65 por herencia con ruta clara, 14 ambiguos, 12 catálogos globales,
  3 globales por instancia (roles), 4 de Better Auth, 4 de usuario, 3 de sistema y la raíz `company`. Tabla completa en
  el Anexo A.
- **Diseño propuesto**: rol `alphataco_owner` (migra, dueño), rol `alphataco_app` (sin `BYPASSRLS`, lo usa Next),
  rol `alphataco_system` (`BYPASSRLS`, jobs/seed/auth). Contexto por transacción con `set_config('app.company_id', …, true)`
  + `app.user_id` (ya existe), fijado por **una sola** extensión de Prisma (`getDb()` / `withTenantTx()`) que
  reemplaza a `withActor`/`withSessionActor`. Fallo **cerrado**: sin contexto, la base devuelve cero filas.
- **Despliegue en 9 PRs chicos**, cada uno desplegable solo, con interruptor `app.rls_mode` (`off`/`shadow`/`enforce`)
  y rollback de un paso (volver `DATABASE_URL` al rol dueño). Empieza por catálogos chicos y termina por `employees`,
  `vehicles`, `company` y la autenticación.
- **Hay 8 decisiones de negocio** que bloquean partes del diseño (§10). La más importante: ¿los roles son por instancia
  o por empresa?

---

## 1. Estado actual verificado

| Hecho | Dónde | Consecuencia para RLS |
| --- | --- | --- |
| Un solo usuario de BD, `alphataco`, superuser y owner | `docker-compose.yml` (`POSTGRES_USER`), `.env.example` (`DATABASE_URL`/`DIRECT_URL` vacíos) | Superuser **siempre** bypassa RLS (ni `FORCE ROW LEVEL SECURITY` lo frena). Hay que crear roles nuevos. |
| `prisma.config.ts` usa `DATABASE_URL ?? DIRECT_URL` para migrar | `prisma.config.ts` | Si se apunta `DATABASE_URL` al rol de app, `migrate deploy` corre sin permisos de DDL. Hace falta una variable propia para migrar (`MIGRATE_DATABASE_URL`). |
| `entrypoint.sh` corre `prisma migrate deploy` con el mismo env que la app | `docker/entrypoint.sh` | El contenedor necesita las dos URLs (owner para migrar, app para servir). |
| Postgres 16, conexión directa sin PgBouncer | `docker/postgres/Dockerfile` (`FROM postgres:16`), compose | `security_invoker` en vistas disponible. Sin pooler externo, `set_config(…, true)` es seguro. |
| Pool de `pg` vía `@prisma/adapter-pg`, sesión en UTC | `src/shared/lib/prisma.ts`, `prisma-pg-config.ts` | Cada query fuera de transacción puede caer en otra conexión: el contexto **tiene** que ir dentro de una transacción. |
| `app.user_id` ya existe (`app_current_user_id()`) y se fija con `set_config(…, true)` | `src/shared/lib/actor.ts`, `prisma/sql/misc.sql` | Patrón ya probado: se generaliza a `app.company_id`. |
| 101 `$transaction(async …)` interactivas + 5 batch + ~243 usos de `withActor`/`withSessionActor`/`withMaintenanceActor` | `src/` | Puntos a converger en un único `withTenantTx`. |
| La regla de migraciones **prohíbe** políticas RLS | `.claude/rules/migrations.md` ("Prohibido: … policies RLS") | El PR 1 tiene que cambiar esa regla, si no cada migración de este plan la viola. |
| El comentario de cierre de P2 en `prisma-tenant.ts` está desactualizado | `src/shared/lib/prisma-tenant.ts` | Dice "61 modelos con company_id" y que `maintenance_order_items` no lo tiene: hoy son 111 y `maintenance_order_items.company_id` existe (con índice). Sus argumentos contra una extensión Prisma siguen siendo válidos y son justamente la razón para llevar el perímetro a la base. |
| `CLAUDE.md` dice "Multi-empresa con RLS en Supabase" | `CLAUDE.md` (Project Overview) | Es historia: no hay RLS. Conviene corregir la línea cuando entre el PR 1. |
| `employees.cuil` y `employees.document_number` son UNIQUE globales | `0_init/migration.sql` (`companies_employees_cuil_key`, `…_document_number_key`) | Una misma persona no puede ser empleada de dos empresas de la instancia. Con RLS, además, el error de unicidad revela que el CUIL existe en otra empresa (oráculo). Ver decisión D8. |
| 34 modelos con `company_id` sin índice que empiece por `company_id` | §8.1 | Incluye `employees`, `vehicles`, `document_types`, `dailyreport`, `tires`, `preparte`. Con RLS, cada consulta filtra por esa columna. |

---

## 2. C1(a) — Clasificación de las 217 tablas

### 2.1 Criterio

| Tipo | Regla | Cantidad |
| --- | --- | --- |
| **Directa** | Tiene `company_id NOT NULL` (o `documents_company.applies`, que es FK a `company`) | 95 |
| **Directa + usuario** | `company_id` y además es del usuario (`user_roles`, `user_permissions`, `notification_deliveries`) | 3 |
| **Directa nullable – catálogo mixto** | `company_id NULL` = global, con valor = propio (`document_types`, `type`, `sub_type`, `guild`, `brand_vehicles`) | 5 |
| **Directa nullable – NULL sospechoso** | `company_id` nullable donde un NULL no tiene sentido de negocio (`employees`, `vehicles`, `preparte`, `share_company_users`, `customer_services`, `contacts`, `equipment_owners`, `companies_employees`) | 8 |
| **Herencia** | Sin `company_id`; llega a un padre con empresa por FK **obligatoria** al encabezado semántico | 65 |
| **Ambigua** | La ruta pasa por una FK nullable, o es legacy sin FK, o depende de una decisión | 14 |
| **Global (catálogo)** | Sin dueño: `modules`, `tabs`, `actions`, `countries`, `provinces`, `cities`, `industry_type`, `measure_units`, `type_operative`, `types_of_vehicles`, `checklist_sections`, `checklist_items` | 12 |
| **Global por instancia** | `roles`, `role_permissions`, `role_notifications`: sin `company_id`, pero los administra cada empresa | 3 |
| **Auth (Better Auth)** | `auth_user`, `auth_session`, `auth_account`, `auth_verification` | 4 |
| **Usuario** | `profile`, `user_table_preferences`, `support_ticket_views`, `user_equipment_type_visibility` | 4 |
| **Sistema** | `handle_errors`, `arca_locks`, `jobs_runs` | 3 |
| **Raíz** | `company` | 1 |

Rutas corregidas a mano sobre el BFS automático (que tomaba la primera FK, incluso nullable o pasando por `profile`):

- `company` es la raíz; `profile` es de usuario y abarca varias empresas por `share_company_users` (el BFS los colgaba de `employees`).
- `dailyreportrows_history` va por `daily_report_row_id → dailyreportrows`, no por `changed_by → profile`.
- `documents_company.applies` **es** el `company_id` (FK a `company`): se trata como directa.
- `tire_service_items` va por `service_order_id → tire_service_orders` (obligatoria), no por `mount_movement_id?`.
- `checklist_template_sub_types` va por `template_id → checklist_templates`, no por `sub_type_id?`.
- `role_hidden_equipment_types` (rol global + tipo) y `user_equipment_type_visibility` (usuario) no son herencia de tenant.
- `documents_employees.applies` y `documents_equipment.applies` son **nullable**: ambiguas hasta saber qué son las filas con `applies IS NULL`.
- `dailyreportrows` tiene `daily_report_id?`, `preparte_id?` y `customer_id?`, todas nullable: es el hub de Operaciones y es ambigua por definición. Se resuelve denormalizando `company_id`.

### 2.2 Consultas para medir lo que falta (correr en dev con el rol dueño)

```sql
-- Filas con company_id NULL en las 13 tablas nullable
SELECT 'employees' t, count(*) FILTER (WHERE company_id IS NULL) nulls, count(*) total FROM employees
UNION ALL SELECT 'vehicles', count(*) FILTER (WHERE company_id IS NULL), count(*) FROM vehicles
UNION ALL SELECT 'preparte', count(*) FILTER (WHERE company_id IS NULL), count(*) FROM preparte
UNION ALL SELECT 'share_company_users', count(*) FILTER (WHERE company_id IS NULL), count(*) FROM share_company_users
UNION ALL SELECT 'customer_services', count(*) FILTER (WHERE company_id IS NULL), count(*) FROM customer_services
UNION ALL SELECT 'contacts', count(*) FILTER (WHERE company_id IS NULL), count(*) FROM contacts
UNION ALL SELECT 'equipment_owners', count(*) FILTER (WHERE company_id IS NULL), count(*) FROM equipment_owners
UNION ALL SELECT 'companies_employees', count(*) FILTER (WHERE company_id IS NULL), count(*) FROM companies_employees
UNION ALL SELECT 'document_types', count(*) FILTER (WHERE company_id IS NULL), count(*) FROM document_types
UNION ALL SELECT 'type', count(*) FILTER (WHERE company_id IS NULL), count(*) FROM type
UNION ALL SELECT 'sub_type', count(*) FILTER (WHERE company_id IS NULL), count(*) FROM sub_type
UNION ALL SELECT 'guild', count(*) FILTER (WHERE company_id IS NULL), count(*) FROM guild
UNION ALL SELECT 'brand_vehicles', count(*) FILTER (WHERE company_id IS NULL), count(*) FROM brand_vehicles;

-- Hijas con ruta nullable
SELECT count(*) FROM documents_employees WHERE applies IS NULL;
SELECT count(*) FROM documents_equipment WHERE applies IS NULL;
SELECT count(*) FROM dailyreportrows WHERE daily_report_id IS NULL AND preparte_id IS NULL AND customer_id IS NULL;

-- Tamaño por tabla, para decidir EXISTS vs denormalizar (§7.4)
SELECT relname, n_live_tup, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 40;
```

La tabla completa (tabla → tipo → ruta → estrategia → lote) está en el **Anexo A**.

---

## 3. C1(b) — De dónde sale la empresa activa y dónde se pierde

### 3.1 Fuentes

| Fuente | Archivo | Quién escribe | Confianza |
| --- | --- | --- | --- |
| Claim `company` en `auth_session` | `src/shared/lib/session.ts` (`getSessionCompanyClaim`), escritura única en `src/shared/lib/session-claims.ts` (`writeCompanyClaim`) | Alta de sesión (`auth.ts` → `databaseHooks` → `resolveDefaultCompanyId`), `switchActiveCompany` (`src/shared/actions/company-user.actions.ts`), login QR (`features/Mantenimiento/actions/maintenance-actions.ts`), panel de ropa (`features/Clothing/actions/session.server.ts`), `features/Empresa/General/actions/company.server.ts` | De confianza (campo `input: false`) |
| Cookie `actualComp` (httpOnly, 1 h por defecto, 1 año en ropa) | `src/shared/lib/tenant.ts` (`setActiveCompanyCookie`) | Mismos flujos | Propuesta: se revalida con `canUseAsActiveCompany()` en cada lectura |
| Cookie `actualCompName` (no httpOnly) | `CompanySwitcher.tsx`, `loggedUser.ts`, `app/dashboard/*/page.tsx` | Cliente | Solo para títulos; **no** es perímetro |
| Zustand `actualCompany` | `src/shared/store/loggedUser.ts` | Cliente | Solo UI |
| `employees.company_id` del legajo | `features/OperatorPanel/actions/session.server.ts`, `perimeter.ts` | Login de operario | El panel de taller no usa claim ni cookie: el perímetro sale del empleado |
| `external_api_clients.company_id` | `src/features/ExternalApi/lib/auth.ts` | API key | Sin usuario: el actor es el cliente de API |
| Parámetro explícito `companyId` | Jobs (`features/Jobs/lib/per-company.ts` → `runForEachCompany`), scripts | Código de sistema | De confianza (no viene de un usuario) |

### 3.2 Dónde se calcula o se asume

- `getActiveCompanyId()` (cacheado por request): 1.238 menciones (incluye imports) en 310 archivos. `getActiveCompanyIdOrNull()`: 5 usos (permisos, que devuelven vacío sin empresa).
- `assertCompanyAccess()` (38 usos) cuando el id llega por ruta/props.
- Perímetros por feature: `MaintenanceOrders/actions/order-perimeter`, `Gomeria/shared/perimeter`, `Clothing/actions/perimeter`, `OperatorPanel/.../perimeter.ts`, `src/shared/lib/storage-perimeter.ts`.
- Funciones SQL que reciben `p_company_id` explícito (permisos, KPIs, HR, notificaciones, numeradores).

### 3.3 Dónde el contexto se pierde o es débil

| Lugar | Qué pasa | Riesgo |
| --- | --- | --- |
| **Empresa activa por SESIÓN, no por pestaña** | El claim vive en `auth_session`. Si el usuario cambia de empresa en la pestaña B, la pestaña A sigue mostrando la empresa vieja pero sus siguientes acciones escriben en la nueva. | Alto (es el "no siempre se sabe en qué empresa trabaja"). Ver D5. |
| Jobs `src/app/api/jobs/*` | Los 5 jobs (`daily-indicators`, `daily-report-deviations`, `documents-expiry`, `documents-status`, `warehouse-batch-expiry`) recorren `prisma.company.findMany()` y pasan `company.id` a mano. No hay sesión. | Bien resuelto hoy; con RLS necesitan contexto de sistema o `withTenantTx(company.id)` por unidad. |
| `runGlobalStep` / `jobs_runs` con `company_id NULL` | Pasos globales de un job | Contexto de sistema. |
| Scripts `scripts/seed-company.ts`, `bootstrap-admin.ts`, `seed-auth-fixtures.ts`, `scripts/demo/*`, `sync-prod-to-dev.sh` | `new PrismaClient` propio, sin sesión | Rol de sistema. |
| API de archivos `src/app/api/files/[bucket]/[...path]/route.ts` | Resuelve dueño del objeto (`resolveStorageObjectOwner`) y compara con la empresa activa o la pertenencia | Lee `share_company_users` y `company` de otras empresas **antes** de tener contexto → pre-tenant (§7.6). |
| Better Auth (`src/shared/lib/auth.ts`, `prismaAdapter(prisma)`) | El hook de alta de sesión llama `resolveDefaultCompanyId(userId)`, que lee `profile`, `company`, `share_company_users`, `employees` sin empresa activa | Se rompe seguro con RLS si usa el rol de app (§7.6). |
| `getActiveCompanyId()` / `canUseAsActiveCompany()` / `assertCompanyAccess()` | Validan pertenencia leyendo `company`, `share_company_users`, `employees` de una empresa que **todavía no** es la activa | Pre-tenant (§7.6). |
| `src/proxy.ts` (middleware) | Resuelve y escribe el claim | Pre-tenant. |
| Login QR / invitado (`useMaintenanceAnonymousLogin`, `setActiveCompanyForEquipment`) | Deriva la empresa del equipo escaneado | Pre-tenant + usuario anónimo. |
| API externa `src/app/api/external/v1/*` | Empresa de la API key, sin `app.user_id` | Contexto con `app.user_id` NULL: las políticas por permiso deben tratarlo aparte. |
| `src/app/api/health` | `$queryRaw` de ping | Sin tablas: no afecta. |
| `src/app/api/taskapp` | Integración con TaskApp | Revisar al implementar (no lee tablas tenant según el barrido). |

---

## 4. C1(c) — SQL crudo, funciones y vistas

88 archivos de `src/` (sin tests ni `generated`) usan `$queryRaw`/`$executeRaw`/`Prisma.sql`/`callFunction`/`callScalar`/`callVoid`. La gran mayoría (Tesorería, Compras, Almacenes, Dashboard, Jobs) recibe `companyId` de `getActiveCompanyId()` y lo bindea. Lo que queda con riesgo:

| Objeto | Archivo | Qué hace | Riesgo |
| --- | --- | --- | --- |
| `select_distinct_values(p_table_name, p_column_path, p_join_mappings, p_multi_join_paths, p_filters)` | `prisma/sql/misc.sql`; action `querySelectDistinct` en `src/shared/actions/select-distinct.server.ts` | SQL dinámico. La tabla base está en lista blanca (`vehicles`) y el `company_id` base se fuerza, **pero `relation` y `multiJoinPaths` llegan del cliente** y se convierten en `LEFT JOIN %I … ON %I.%I::TEXT = t.%I::TEXT` contra **cualquier tabla y columna**, y `final_column` elige qué columna devolver. Ej.: `vehicles.type_of_vehicle → vehicles t0 (type_of_vehicle)` devuelve dominios de otras empresas; `vehicles.user_id → auth_account(userId)` con `final_column = password` devuelve hashes. Además emite ~10 `RAISE LOG` por llamada. | **Crítico latente.** Hoy el único consumidor es el DataTable legacy (`src/shared/components/data-table/filters/data-table-faceted-filter-server.tsx`), que ningún archivo fuera de `shared/components/data-table/` importa; el action probablemente no está en el manifiesto. Verificar con `.next/server/server-reference-manifest.json`. Recomendación: borrar el DataTable legacy, `querySelectDistinct`, `distinct-values.ts` y la función (PR 0). RLS no lo cierra solo: `auth_account` no tiene RLS. |
| `get_company_counts_indicator(p_company_id DEFAULT NULL, …)`, `get_employee_usage_indicator(…, p_company_id DEFAULT NULL)`, `get_vehicle_usage_indicator(…, p_company_id DEFAULT NULL, …)`, `get_employee_diagram_count_by_day(…, p_company_id …)`, `get_max_order_number(p_company_id DEFAULT NULL)`, `get_documents_expiry_summary(…, p_company_id)` | `prisma/sql/kpis.sql`, `daily-report.sql`, `documents.sql` | `NULL` = **todas las empresas** ("comportamiento viejo" según `prisma/sql/README.md`). Hoy los llamadores pasan empresa (`run_daily_indicators_for_company`, `Preparte/actions/queries.server.ts`, `mutations.server.ts`). | Medio latente: un llamador nuevo que olvide el parámetro agrega estadísticas de todas las empresas. Con RLS (funciones `SECURITY INVOKER`) quedaría acotado; además conviene quitar el `DEFAULT NULL` o hacer `COALESCE(p_company_id, app_current_company_id())`. |
| `controlar_alertas_single_document_all_employees/_vehicles(document_type_id)` | `prisma/sql/documents.sql`, disparadas por `trg_document_types_update` | Para tipos **globales** recorre recursos de **todas** las empresas (decisión documentada en `CLAUDE.md`, ticket 411). | Con RLS y rol de app, el trigger solo vería la empresa activa y dejaría sin reconciliar al resto → **se rompe**. Debe ser `SECURITY DEFINER` (owner) o correr en contexto de sistema. |
| `update_company_by_defect()` (trigger en `company`) | `prisma/sql/misc.sql` | `UPDATE company SET by_defect=false WHERE owner_id = NEW.owner_id AND id <> NEW.id` | Escribe en empresas distintas de la activa: con RLS no vería las otras → **se rompe** (dos "por defecto"). `SECURITY DEFINER`. |
| Vista `equipments_with_pending_deviations` | `prisma/sql/daily-report.sql` | Expone `company_id`; corre con permisos de su dueño | Con RLS, una vista del owner **bypassa** las políticas. Solo la mencionan comentarios (`EquiposConDesvios/actions.server.ts`, `maintenance-actions.ts`): DROP, o `WITH (security_invoker = true)`. |
| `get_dailyreportrow_history(p_row_id)`, `reconcile_daily_report_rows_status(uuid[])` | `daily-report.sql`; `Operaciones/PartesDiarios/lib/row-resource-status.ts` | Por id, sin empresa | Bajo: los ids vienen de acciones que ya validaron. RLS lo cierra solo. |
| `$queryRaw` por ids sin empresa | `Gomeria/shared/last-tire-pressure.server.ts` (`tire_service_items`), `Mantenimiento/shared/order-lock.ts` (`FOR UPDATE`), `Empresa/Clientes/lib/allocated-to.ts` (`UPDATE employees/vehicles … WHERE id = ANY(...)`) | Por ids | Bajo: trazados, los ids se validan antes (`assignments.server.ts` filtra `employees` por `company_id` y aborta si falta alguno). RLS lo vuelve garantía. |
| `get_user_permissions`, `user_has_permission`, `check_multiple_permissions`, `get_user_accessible_modules`, `resolve_notification_recipients` | `prisma/sql/permissions.sql` | Reciben `p_user_id` + `p_company_id` explícitos | Correctos. Se reutilizan para `app_has_permission()` (§7.5). |
| `hr_get_*`, `get_services_summary_by_type`, `get_kpi_range`, `run_daily_indicators_for_company` | `kpis.sql`, `diagrams.sql` | Reciben `p_company_id` obligatorio | Correctos. |
| Ninguna función es `SECURITY DEFINER` hoy | `grep -c "security definer" prisma/sql/*.sql` = 0 | — | Bien: con RLS todas corren como el llamador. Solo hay que *agregar* `DEFINER` a las pocas de sistema de esta tabla. |

---

## 5. C1(d) — Barrido de accesos Prisma sin `withCompany`

### 5.1 Números

Script: cruza la clasificación del schema con cada `prisma|tx|client|db.<modelo>.<op>(` de `src/` (sin tests ni `generated`), extrae el argumento con paréntesis balanceados y busca `company_id|withCompany|companyId|company:`.

| Paso | Resultado |
| --- | --- |
| Llamadas sobre modelos clasificados | 2.952 |
| Sin mención de empresa **en el argumento** | 1.738 (directas 908, nullable 280, herencia 457, sin-ruta 93) |
| … y sin `company_id`/`withCompany`/`getActiveCompanyId`/`assertCompanyAccess`/`perimeter` en las 40 líneas previas, y que **no** son por id (`findUnique`/`update`/`delete`/`upsert`) | **385** sospechosas |
| Trazadas a mano | 12: `Dashboard/Principal/actions/fleet.server.ts:317-346`, `MaintenanceOrders/table/actions/metrics.server.ts:37-42`, `Dashboard/Estadisticas/KPIs/actions/actions.ts:140`, `shared/components/modal/dependency-utils.ts`, `Empresa/Clientes/lib/allocated-to.ts`, `Equipos/EquipoID/components/vehicle-tires/actions/positions.server.ts`, `Operaciones/PartesDiarios/detail/queries.server.ts`, `Dashboard/Estadisticas/RecursosHumanos/actions.server.ts`, `Estadisticas/Mantenimiento/actions/actions.server.ts`, `Gomeria/shared/last-tire-pressure.server.ts`, `Permissions/actions/roles.server.ts`, `Jobs/jobs/*` |
| **Filtros de empresa olvidados** | **0 de 12** (más 1 problema de diseño: roles globales en `roles.server.ts`, F2). Todas reciben un `where` armado aguas arriba (`buildOrdersWhere(scope)`, `buildWhere()` con `company_id`), validan antes (`assertKpiInActiveCompany`, `requireTiresViewAccess`, `assertCustomerBelongsToCompany`) o son ids validados. |

Lectura honesta: **la heurística da casi 100 % de falsos positivos en la muestra**. El código está bien perimetrado. El riesgo real no es un `findMany` olvidado hoy, sino (a) que el próximo se olvide, (b) los caminos que no son Prisma tipado (§4) y (c) el contexto (§3.3). Por eso RLS vale la pena: convierte "cientos de lugares que tienen que acordarse" en "la base decide".

### 5.2 Método automatizable (para CI, no exhaustivo pero barato)

1. Generar la clasificación desde `schema.prisma` (modelos con `company_id`, nullable, y rutas por FK obligatoria).
2. Barrer `src/` con el regex `\b(?:prisma|tx|client|db)\.(\w+)\.(findMany|findFirst|count|aggregate|groupBy|updateMany|deleteMany|…)\s*\(`, extraer el argumento balanceado.
3. Marcar como OK si el argumento menciona `company_id`/`withCompany`/la relación dueña, o si el `where` es una variable cuyo origen (misma función) pasa por `withCompany`/`build*Where(scope)`; marcar como OK las ops por id precedidas por un `assert*`/`require*Access`.
4. Lo que queda va a un reporte; un allowlist versionado (`scripts/tenant-sweep.allow.json`) documenta excepciones.
5. Complemento mecánico ya usado en P2 (más útil): ningún `export` de un módulo `'use server'` acepta `companyId`/`company_id` sin `assertCompanyAccess()`.

Una vez con RLS en `enforce`, este barrido pasa a ser una ayuda de revisión, no la defensa.

---

## 6. Lista priorizada de fugas y riesgos encontrados

| # | Prioridad | Hallazgo | Evidencia | Arreglo |
| --- | --- | --- | --- | --- |
| F1 | **Crítica (latente)** | `select_distinct_values` + `querySelectDistinct`: joins y columna final controlados por el cliente → lectura de cualquier tabla/columna, incluidas otras empresas y `auth_account.password` | §4 | Borrar el DataTable legacy y la función (PR 0). |
| F2 | **Alta** | Roles globales editables desde una empresa: `createRoleWithPermissions`/`updateRoleWithPermissions`/`deleteRoleServer` (`src/features/Permissions/actions/roles.server.ts`) operan sobre `roles`/`role_permissions` sin empresa; un admin de A cambia o borra un rol custom que usan usuarios de B, y `getAllRolesWithCounts` cuenta usuarios de todas | `roles` sin `company_id`; `user_roles.company_id` sí | Decisión D1: `roles.company_id` nullable (NULL = sistema) o roles solo editables por "admin de instancia". |
| F3 | **Alta** | Empresa activa por sesión: cambiar de empresa en una pestaña cambia las escrituras de las otras pestañas | `auth_session.company`, `switchActiveCompany` | D5: llevar la empresa en la URL/encabezado y validarla, o al menos rechazar escrituras cuyo `company_id` esperado (enviado por el form) no coincide con el contexto. |
| F4 | Media (latente) | Funciones con `p_company_id DEFAULT NULL` = todas las empresas | §4 | Quitar el default o `COALESCE` con `app_current_company_id()`; RLS lo cubre. |
| F5 | Media | Vista `equipments_with_pending_deviations` correría como owner con RLS | §4 | DROP (sin consumidores) o `security_invoker`. |
| F6 | Media | `employees.cuil`/`document_number` únicos globales: oráculo entre empresas e imposibilidad de multi-empleo | §1 | D8. |
| F7 | Media | 13 tablas con `company_id` nullable, incluidas `employees` y `vehicles` | §2 | Medir (§2.2), backfill, `NOT NULL` donde corresponda. |
| F8 | Baja | `documents_contracts` y `contractors`: tablas sin FK ni empresa, posiblemente muertas | schema | Verificar uso y dropear. |
| F9 | Baja | `RAISE LOG` masivo en `select_distinct_values` llena el log del servidor | `misc.sql` | Se va con F1. |
| F10 | Info | Comentario de P2 en `prisma-tenant.ts` y línea "RLS en Supabase" de `CLAUDE.md` desactualizados | §1 | Corregir en PR 1. |

---

## 7. C2 — Diseño

### 7.1 Roles de base de datos

| Rol | Atributos | Lo usa | Variable |
| --- | --- | --- | --- |
| `alphataco_owner` | `LOGIN`, dueño de schema `public` y de todas las tablas/funciones. **No** superuser. | `prisma migrate deploy` (entrypoint), `psql` de mantenimiento | `MIGRATE_DATABASE_URL` |
| `alphataco_app` | `LOGIN NOSUPERUSER NOBYPASSRLS`. `GRANT SELECT, INSERT, UPDATE, DELETE` sobre tablas, `USAGE` sobre secuencias, `EXECUTE` sobre funciones. Sin DDL. | Next (Server Actions, páginas, `/api/*`) | `DATABASE_URL` |
| `alphataco_system` | `LOGIN NOSUPERUSER BYPASSRLS`, mismos grants que app | Jobs (`/api/jobs/*` vía un cliente aparte), `scripts/seed-company.ts`, `bootstrap-admin.ts`, demo, Better Auth (fase inicial), triggers de sistema (vía `SECURITY DEFINER` del owner) | `SYSTEM_DATABASE_URL` |
| `alphataco` (actual) | superuser del contenedor | Solo `initdb`/emergencias | `POSTGRES_USER` |

Notas:
- `ALTER DEFAULT PRIVILEGES FOR ROLE alphataco_owner IN SCHEMA public GRANT … TO alphataco_app, alphataco_system;` para que las tablas nuevas hereden grants.
- **Sin `FORCE ROW LEVEL SECURITY`** en la primera etapa: el owner sigue bypasseando, y eso es el rollback (§7.11). Se puede forzar más adelante tabla por tabla.
- `prisma.config.ts` pasa a `url: process.env['MIGRATE_DATABASE_URL'] ?? process.env['DATABASE_URL'] ?? process.env['DIRECT_URL']`; `docker/entrypoint.sh` exporta `MIGRATE_DATABASE_URL` solo para el `migrate deploy`.
- El cambio de dueño de objetos existentes (`ALTER TABLE … OWNER TO alphataco_owner` en loop sobre `pg_tables`/`pg_proc`) va en una migración que corre como el superuser actual; las siguientes ya corren como owner. Contraseñas: por variables de entorno del VPS, nunca en el repo.

### 7.2 Contexto por transacción

GUCs (todas con `set_config(nombre, valor, true)` = locales a la transacción):

| GUC | Valor | Lo fija |
| --- | --- | --- |
| `app.company_id` | uuid de la empresa activa | `withTenantTx` / extensión Prisma |
| `app.user_id` | `auth_user.id` = `profile.credential_id` = `profile.id` (ya existe) | idem (reemplaza `setActor`) |
| `app.actor_kind` | `user` \| `operator` \| `guest` \| `api` \| `job` | idem; sirve a las políticas por permiso y al log |
| `app.rls_mode` | `off` \| `shadow` \| `enforce` | default de la base (`ALTER DATABASE … SET app.rls_mode`) y opcionalmente la app |

Funciones (en un archivo nuevo `prisma/sql/tenant.sql`, duplicadas en la migración, como manda la regla):

```sql
CREATE OR REPLACE FUNCTION public.app_current_company_id() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE AS
$$ SELECT nullif(current_setting('app.company_id', true), '')::uuid $$;

-- app_current_user_id() ya existe en misc.sql (mismo patrón).

-- Empresas que el usuario de app.user_id puede usar (owner, miembro activo, empleado vinculado).
-- SECURITY DEFINER: corre como owner, así puede leer company/share_company_users/employees
-- ANTES de que haya empresa activa (pre-tenant). search_path fijo por seguridad.
CREATE OR REPLACE FUNCTION public.app_accessible_company_ids() RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(array_agg(DISTINCT c.id), '{}')
  FROM profile p
  JOIN company c ON c.owner_id = p.id
     OR EXISTS (SELECT 1 FROM share_company_users s WHERE s.profile_id = p.id AND s.company_id = c.id AND s.is_active)
     OR (p.employee_id IS NOT NULL AND EXISTS (SELECT 1 FROM employees e WHERE e.id = p.employee_id AND e.company_id = c.id))
  WHERE p.credential_id = public.app_current_user_id()
$$;
```

(La fórmula tiene que ser **exactamente** la de `canUseCompanyAsTenant()` en `src/shared/lib/company-membership.ts`; al implementar, una sola fuente: o la función SQL la usa el TS, o un test compara las dos.)

**Fallo cerrado.** Sin `app.company_id`, `app_current_company_id()` es NULL y `company_id = NULL` es falso: cero filas en lectura y error de `WITH CHECK` en escritura. Es preferible a fallo abierto, pero en producción se ve como "la pantalla vacía": por eso la fase de sombra (§7.11) existe para encontrar estos casos antes.

### 7.3 Cómo lo fija Prisma (extensión + transacción)

Hechos de Prisma 7 + `@prisma/adapter-pg` que condicionan el diseño:
- Fuera de `$transaction`, cada operación toma cualquier conexión del pool: un `set_config` suelto se pierde (se aplica a su propia transacción implícita y muere).
- `$transaction([a, b])` (batch) ejecuta en una sola conexión dentro de `BEGIN/COMMIT`: sirve para `[set_config, query]`.
- Dentro de `$transaction(async tx => …)` (interactiva) no se puede abrir otra transacción: el `set_config` va una vez al inicio.
- Las extensiones `query.$allModels.$allOperations` no ven `$queryRaw`/`$executeRaw`: hay que cubrirlas con el componente `query` de nivel cliente (`$allOperations` top-level) o envolverlas.

Diseño (un módulo nuevo `src/shared/lib/tenant-db.ts`, `server-only`):

```ts
// Esquema, no código final.
type TenantCtx = { companyId: string; userId: string | null; kind: 'user' | 'operator' | 'guest' | 'api' | 'job' };

const setCtx = (c: TenantCtx) => prismaBase.$executeRaw`
  SELECT set_config('app.company_id', ${c.companyId}, true),
         set_config('app.user_id', ${c.userId ?? ''}, true),
         set_config('app.actor_kind', ${c.kind}, true)`;

export function tenantClient(ctx: TenantCtx) {
  return prismaBase.$extends({
    query: {
      $allOperations: async ({ args, query }) => {
        const [, result] = await prismaBase.$transaction([setCtx(ctx), query(args)]);
        return result;
      },
    },
  });
}

// Interactiva: reemplaza withActor / withSessionActor / withMaintenanceActor.
export async function withTenantTx<T>(fn: (tx) => Promise<T>, opts?) {
  const ctx = await getTenantContext();           // cache() por request
  return prismaBase.$transaction(async (tx) => { await setCtxOn(tx, ctx); return fn(tx); }, opts);
}

// Lo que importan las features en lugar de `prisma`:
export const getDb = cache(async () => tenantClient(await getTenantContext()));
```

`getTenantContext()` es **el** contexto único pedido: resuelve, una vez por request, `{ companyId, userId, kind }` según el actor (dashboard: claim/cookie validada; operario: empleado de la sesión; invitado QR: empresa del equipo; API externa: `external_api_clients.company_id`; job: el que pasa `runForEachCompany`). Si no hay empresa, lanza `NoActiveCompanyError` (igual que hoy) en vez de dejar correr sin contexto.

Checks obligatorios del primer PR de código (no son afirmaciones, son cosas a verificar con un test descartable antes de migrar nada):
1. ¿La extensión `$allOperations` se dispara dentro del `tx` de una interactiva? (Si sí, hay que desactivarla ahí para no anidar `$transaction`.)
2. ¿`$transaction([setCtx, query(args)])` funciona con `adapter-pg` y devuelve el resultado de `query`?
3. ¿`include`/`select` anidados y `relationLoadStrategy` hacen consultas extra **dentro** del mismo batch?
4. ¿`$queryRaw`/`$executeRaw`/`$queryRawUnsafe` pasan por `$allOperations` top-level? Si no, `callFunction`/`callScalar`/`callVoid` de `src/shared/lib/sql.ts` reciben el cliente de tenant explícito.
5. Costo: medir p50/p95 de una lista típica con y sin el batch (son 3 viajes extra: `BEGIN`, `set_config`, `COMMIT`). Si duele, agrupar lecturas de una página en una sola `withTenantTx` de solo lectura.

Migración del código: mecánica, por lotes de features. `import { prisma }` → `const db = await getDb()`; `withActor(userId, fn)`/`withSessionActor(fn)` → `withTenantTx(fn)`. `withCompany()` **se queda** (defensa en profundidad e índices), pero deja de ser la única barrera. El cliente `prisma` crudo queda solo en `tenant-db.ts`, `auth.ts`, jobs y scripts; una regla de lint/grep en CI lo hace cumplir.

**PgBouncer:** hoy no hay. Si se agrega, solo en modo *transaction* y solo funciona porque todo es `set_config(…, true)` dentro de transacción. Nunca `SET` de sesión (se filtraría al siguiente cliente del pooler).

### 7.4 Políticas por tipo de tabla

Todas se generan con una función helper en la migración (para no escribir 200 políticas a mano) y quedan listadas en `prisma/sql/tenant.sql`.

**a) Directa** (`company_id NOT NULL`):

```sql
ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY;
-- Política FINAL (la que queda en enforce):
CREATE POLICY tenant_isolation ON public.<t>
  USING (company_id = app_current_company_id())
  WITH CHECK (company_id = app_current_company_id());
```
Durante la fase de sombra de su lote, la misma tabla lleva en su lugar la variante con interruptor de §7.11
(`app_rls_shadow_pass('<t>') OR …` en **USING y en WITH CHECK**). El PR que pasa el lote a `enforce` reemplaza esa
variante por la final: ninguna política "enforced" conserva la función volátil del interruptor.

**Todas las plantillas siguientes (b, d, e, i, j) siguen la misma regla**: variante con interruptor en sombra,
política final sin interruptor en enforce.

**b) Catálogo mixto** (`document_types`, `type`, `sub_type`, `guild`, `brand_vehicles`): dos políticas.
```sql
CREATE POLICY read_own_or_global ON public.document_types FOR SELECT
  USING (company_id IS NULL OR company_id = app_current_company_id());
CREATE POLICY write_own ON public.document_types FOR ALL
  USING (company_id = app_current_company_id()) WITH CHECK (company_id = app_current_company_id());
```
Los globales (`company_id IS NULL`) solo los escribe `alphataco_system` (D3).

**c) NULL sospechoso** (`employees`, `vehicles`, `preparte`, `share_company_users`, `customer_services`, `contacts`, `equipment_owners`, `companies_employees`): primero medir (§2.2), backfill y `SET NOT NULL`; luego política (a). Si el negocio decide que el NULL existe (D2), regla explícita, nunca "NULL visible para todos" por accidente.

**d) Herencia — EXISTS** (tablas chicas o de baja frecuencia):
```sql
CREATE POLICY tenant_via_parent ON public.supplier_contacts
  USING (EXISTS (SELECT 1 FROM suppliers p WHERE p.id = supplier_id AND p.company_id = app_current_company_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM suppliers p WHERE p.id = supplier_id AND p.company_id = app_current_company_id()));
```
El `EXISTS` usa la PK del padre: es un index lookup por fila. Bien para tablas de hasta decenas de miles de filas.

**e) Herencia — denormalizar `company_id`** (tablas grandes o calientes, o con ruta ambigua):
1. `ALTER TABLE … ADD COLUMN company_id uuid` (nullable), backfill por lotes desde el padre, `SET NOT NULL`.
2. Trigger `BEFORE INSERT` que copia `company_id` del padre si viene NULL (así ningún `create` de Prisma cambia).
3. Integridad: `UNIQUE (id, company_id)` en el padre + FK compuesta `(parent_id, company_id) REFERENCES parent(id, company_id)` en la hija. Impide que una hija apunte a un padre de otra empresa (cosa que hoy nada impide).
4. Índice `(company_id, …)` según el acceso típico.
5. Política (a).

Recomendación por tabla (hasta medir con §2.2):

| Denormalizar (grandes / hub / ruta nullable) | EXISTS (chicas) |
| --- | --- |
| `dailyreportrows`, `dailyreportemployeerelations`, `dailyreportequipmentrelations`, `dailyreport_customer_equipment_relations`, `dailyreportrows_history`, `documents_employees`, `documents_equipment`, `documents_employees_logs`, `documents_equipment_logs`, `employees_diagram`, `stock_movement_lines`, `certification_lines`, `invoice_lines`, `payment_order_lines`, `supplier_invoice_lines`, `form_answers`, `preparte_change_logs` | `supplier_*`, `payment_order_{payments,rejections,withholdings}`, `purchase_*_lines`, `customer_receipt_{lines,payments}`, `invoice_vat`, `invoice_certifications`, `own_check_events`, `third_party_check_*`, `kpi_revisions`, `tire_template_axles`, `vehicle_*`, `clothing_*` hijas, `checklist_template_*`, `sectors`, `areas_cliente`, `area_province`, `equipos_clientes`, `service_*`, `work_order_items`, `maintenance_order_item_repair_types`, `remitos`, `remito_documents`, `contractor_*`, `category_employee`, `empleado_aptitudes`, `aptitudes_tecnicas_puestos`, `employee_workshop_sectors`, `diagrams_logs`, `sub_type_compatible_items`, `material_request_lines`, `external_api_access_logs`, `tire_service_items` |

Regla práctica: si una tabla hija pasa de ~50.000 filas o aparece en listados paginados con facetas (`groupBy` + `count`), denormalizar; el `EXISTS` por fila en un `count(*)` sobre cientos de miles de filas es lo que degrada.

**f) Globales** (`modules`, `tabs`, `actions`, geografía, catálogos fijos, `checklist_sections/items`): sin RLS; `REVOKE INSERT, UPDATE, DELETE … FROM alphataco_app` (solo lectura para la app). El seed corre con `alphataco_system`.

**g) Globales por instancia** (`roles`, `role_permissions`, `role_notifications`): según D1. Opción recomendada: `roles.company_id uuid NULL` (NULL = rol de sistema: `admin`, `administrador`, `full-access-provisional`, `User`), política de catálogo mixto (b) y `role_permissions` por herencia de `roles`.

**h) Auth** (`auth_user`, `auth_session`, `auth_account`, `auth_verification`): **sin RLS** y fuera del alcance del rol de app si se puede (Better Auth en `alphataco_system`, ver §7.6). Son las tablas más sensibles (hashes, tokens): el objetivo es que el rol de app no tenga ni `SELECT` sobre `auth_account`.

**i) Usuario** (`profile`, `user_table_preferences`, `support_ticket_views`, `user_equipment_type_visibility`, y la parte de usuario de `user_roles`, `user_permissions`, `notification_deliveries`, `user_dashboards`):
```sql
-- profile: el propio + los perfiles que comparten la empresa activa (para listas de usuarios, asignaciones)
CREATE POLICY profile_visible ON public.profile FOR SELECT USING (
  credential_id = app_current_user_id()
  OR EXISTS (SELECT 1 FROM share_company_users s WHERE s.profile_id = profile.id
             AND s.company_id = app_current_company_id() AND s.is_active)
  OR EXISTS (SELECT 1 FROM company c WHERE c.owner_id = profile.id AND c.id = app_current_company_id())
);
CREATE POLICY profile_self_write ON public.profile FOR UPDATE USING (credential_id = app_current_user_id());
```

**Regla anti-recursión (crítica en L6):** las políticas de `profile` y `company` consultan `share_company_users` y
`company`, que también tendrán RLS. Postgres corta con `infinite recursion detected in policy` cuando las políticas se
consultan en círculo. Por eso, **toda verificación de pertenencia que cruce tablas pasa por las funciones
`SECURITY DEFINER` (`app_accessible_company_ids()` y similares), nunca por subconsultas directas en la política**. La
política de `profile` de arriba es ilustrativa; la implementable reemplaza los dos `EXISTS` por una función
`app_profile_visible(profile.id)` `SECURITY DEFINER`.

**j) Raíz `company`:**
```sql
CREATE POLICY company_visible ON public.company FOR SELECT
  USING (id = app_current_company_id() OR id = ANY (app_accessible_company_ids()));
CREATE POLICY company_write ON public.company FOR UPDATE USING (id = app_current_company_id());
-- INSERT de empresas: solo alphataco_system (alta de empresa = acción de instancia).
```

**k) Sistema** (`jobs_runs`, `handle_errors`, `arca_locks`): `jobs_runs` y `arca_locks` sin acceso del rol de app salvo lo que la app use (ARCA usa `arca_locks` desde requests: dejar sin RLS); `handle_errors` solo `INSERT`.

### 7.5 Roles y permisos dentro de la empresa

La app ya resuelve permisos con `user_has_permission(user, company, module, tab, action)` sobre `user_roles` + `role_permissions` + `user_permissions` (overrides). En la base:

```sql
CREATE OR REPLACE FUNCTION public.app_has_permission(p_module text, p_tab text, p_action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.user_has_permission(app_current_user_id(), app_current_company_id(), p_module, p_tab, p_action)
$$;
```

- `SECURITY DEFINER` es obligatorio: si no, la política de `user_roles`/`user_permissions` llamaría a una función que lee `user_roles`, y Postgres entraría en recursión de políticas.
- En las políticas se escribe envuelta en subconsulta, `(SELECT app_has_permission('tesoreria','cuentas','view'))`, para que el planner la evalúe **una vez por sentencia** (InitPlan) y no por fila.
- Actores sin `app.user_id` (`api`, `job`): la política los trata por `app.actor_kind` (la API externa solo lee las 6 entidades de `src/app/api/external/v1/*`).

Recomendación: **RLS de empresa en todas las tablas; RLS por permiso solo donde la fuga entre usuarios de la misma empresa sea grave** y la regla sea "ver" (no acciones): Tesorería (`treasury_*`, `bank_statement*`, `own_checks`, `third_party_checks`, `checkbooks`), credenciales fiscales (`arca_credentials`, `arca_tokens`, `company_fiscal_profiles`), gestión de usuarios (`user_permissions`, `user_roles`), y quizás salarios/legajos sensibles. Lo demás (crear/editar/borrar, pestañas) sigue en la app (`checkPermissionServer`, `PermissionGuard`), porque replicar 720 chequeos de permisos como políticas no aporta y vuelve opaco cada error. Ver D4.

### 7.6 Lo que corre antes de tener empresa (pre-tenant) y la autenticación

Se rompe seguro con el rol de app si no se resuelve:

| Flujo | Lee | Solución |
| --- | --- | --- |
| Better Auth (`prismaAdapter(prisma)` en `src/shared/lib/auth.ts`): login, sesión, `databaseHooks` → `resolveDefaultCompanyId` | `auth_*`, `profile`, `company`, `share_company_users`, `employees` | Better Auth con su **propio** `PrismaClient` sobre `SYSTEM_DATABASE_URL`. Es la frontera de identidad; no tiene sentido someterla al tenant. |
| `getActiveCompanyId()`/`canUseAsActiveCompany()`/`assertCompanyAccess()`/`switchActiveCompany()`/`canUserUseCompany()` | `profile`, `company`, `share_company_users`, `employees` de una empresa que todavía no es la activa | Reemplazar las tres lecturas por `app_accessible_company_ids()` (SECURITY DEFINER) con solo `app.user_id` fijado. Una sola fórmula en SQL. |
| `CompanySwitcher` (lista de empresas del usuario) | `company`, `share_company_users` | Política `company_visible` (§7.4 j) con `app_accessible_company_ids()`. |
| `src/app/api/files/[bucket]/[...path]/route.ts` | dueño del objeto en otra empresa + pertenencia | `app_accessible_company_ids()`; el resto con el contexto de la empresa del objeto **si** está en la lista. |
| Login de operario, invitado QR, panel de ropa | `profile`, `employees`, `vehicles` por id escaneado | Lookup puntual con `alphataco_system` (o función `SECURITY DEFINER` específica, p. ej. `app_company_of_equipment(id)`), y recién después contexto de tenant. |
| `src/proxy.ts` | claim | idem Better Auth. |

### 7.7 Jobs, cron, seed y scripts

- `src/features/Jobs/lib/per-company.ts`: `runForEachCompany` ya pasa una empresa por unidad. Envolver `work(company)` en `withTenantTx({ companyId: company.id, userId: null, kind: 'job' })`: el job queda sujeto a RLS de esa empresa (mejor que bypass). `runGlobalStep`, `claimRun` (`jobs_runs`) y `prisma.company.findMany()` inicial: cliente de sistema.
- Triggers que cruzan empresas (`update_company_by_defect`, `controlar_alertas_single_document_all_*`, `trg_document_types_update`): pasar a `SECURITY DEFINER` (owner) con `search_path` fijo. Revisar el resto de triggers con `pg_trigger` en la base viva: los que solo tocan filas de la misma empresa funcionan como invocador.
- `scripts/seed-company.ts`, `bootstrap-admin.ts`, `seed-auth-fixtures.ts`, `scripts/demo/*`: `SYSTEM_DATABASE_URL`.
- `scripts/test-db.sh` y `prisma migrate deploy`: owner.
- Tests de integración vitest (`src/**/*.integration.test.ts`, `scripts/test-*.sh`): hoy usan la URL del superuser. Siguen así para fixtures; los tests de aislamiento usan además `DATABASE_URL` del rol de app.

### 7.8 Rendimiento

1. **Índices que faltan** (34 modelos con `company_id` sin índice que lo encabece): `brand_vehicles clothing_brands clothing_items clothing_sizes contacts covenant custom_form customer_services dailyreport diagram_type document_types employees equipment_owners guild notification_deliveries preparte service_items share_company_users sub_type type types_of_repairs vehicles tire_brands tire_types tires tire_templates tire_service_orders user_dashboards company_fiscal_profiles material_units warehouse_settings bank_statement_profiles bank_statements bank_statement_lines` (algunos, como `company_fiscal_profiles` o `warehouse_settings`, tienen `company_id @unique` a nivel campo y ya están cubiertos: verificar con `\d`). Crear con `CREATE INDEX CONCURRENTLY` en migraciones separadas (Prisma no admite `CONCURRENTLY` dentro de transacción: migración de una sola sentencia o `-- prisma: no transaction` según versión; verificar).
2. Índices compuestos por acceso real: `(company_id, is_active)`, `(company_id, created_at DESC)` en listados; `dailyreport (company_id, date)` además del unique `(date, company_id)`.
3. Funciones de contexto `STABLE` + `PARALLEL SAFE`; permisos envueltos en `(SELECT …)`.
4. Medir con `EXPLAIN (ANALYZE, BUFFERS)` las 10 consultas más caras (`pg_stat_statements`) antes y después de cada lote, con `SET ROLE alphataco_app` y las GUC fijadas. Cuidado con `leakproof`: los operadores no `LEAKPROOF` (p. ej. `ILIKE` de búsqueda) se evalúan **después** de la política; si la política es selectiva (por `company_id` indexado) no importa.
5. Con una sola empresa con datos (hoy GH concentra todo según `CLAUDE.md`), la selectividad del índice por empresa es baja: el beneficio de performance es nulo y el costo es el filtro extra. Aceptable, pero medirlo.

### 7.9 Vistas, funciones y triggers

- Vistas: `CREATE VIEW … WITH (security_invoker = true)` siempre. La única existente (`equipments_with_pending_deviations`) se dropea.
- Funciones nuevas: `SECURITY INVOKER` por defecto; `SECURITY DEFINER` solo para `app_accessible_company_ids`, `app_has_permission`, los triggers de sistema y los lookups pre-tenant puntuales, todas con `SET search_path = public, pg_temp` y `REVOKE EXECUTE … FROM PUBLIC` + grant explícito.
- Funciones con `p_company_id DEFAULT NULL`: quitar el default (o `COALESCE` con el contexto).
- Agregar la verificación al baseline: `prisma/sql/tenant.sql` en el orden `misc → tenant → permissions → …` de `scripts/sql/build-baseline.ts` (solo si algún día se regenera el baseline; hoy no).

### 7.10 Pruebas (descripción; no se escriben hasta el OK del usuario)

**pgTAP** (encaja con `scripts/test-db.sh` + `prisma/tests/*.sql`, que hoy corren como superuser):
- Nuevo `prisma/tests/10_rls_isolation.sql`: crea dos empresas A y B con un recurso de cada tipo representativo (directa, catálogo mixto, herencia EXISTS, herencia denormalizada, usuario), y luego:
  - `SET LOCAL ROLE alphataco_app; SELECT set_config('app.company_id', A, true);` → `is(count(*) FROM employees WHERE company_id = B, 0)`, `throws_ok(INSERT … company_id = B)`, `is(count(*) FROM document_types WHERE company_id IS NULL, n_globales)`.
  - Sin `app.company_id` → `is(count(*) FROM employees, 0)` (fallo cerrado).
  - Hija con padre de otra empresa → `throws_ok` por la FK compuesta.
  - Test de catálogo: `results_eq` de `SELECT relname FROM pg_class WHERE relkind='r' AND relnamespace='public'::regnamespace AND relrowsecurity = false` contra la lista de globales/auth/sistema del Anexo A. **Este es el test que impide que una tabla nueva entre sin RLS.**
  - `app_has_permission` con un usuario sin rol en A → false; con rol → true; recursión ausente.
- `scripts/test-db.sh` necesita crear los roles (`alphataco_app`, `alphataco_system`) en la base de test (lo hace la migración) y el seed de una segunda empresa (`npm run db:seed -- --name Test2 --id 00000000-0000-0000-0000-000000000002`).

**Vitest de integración** (patrón de `src/features/Jobs/jobs/jobs.integration.test.ts`, que ya crea dos empresas):
- Un test por feature crítica que llame a las Server Actions reales con sesión de A y verifique que los ids de B no aparecen ni se pueden modificar (incluye `select_distinct_values` si sobrevive, archivos, dashboards).
- Necesita `DATABASE_URL` del rol de app y `SYSTEM_DATABASE_URL` para los fixtures.

### 7.11 Despliegue por fases, interruptor y rollback

Postgres no tiene "modo sombra" nativo. Se arma en tres niveles:

**Fase 0 — telemetría en la app (sin RLS).** Tiene que envolver el cliente que **hoy** usan las features (el singleton de `src/shared/lib/prisma.ts`), no el `getDb()` nuevo, porque las features recién migran a `getDb()` en PR 4+. Mecanismo: un `AsyncLocalStorage` que `getTenantContext()`/`withTenantTx()` marcan al resolverse, y una extensión `query.$allOperations` (más `$queryRaw`/`$executeRaw`) sobre el singleton que **registra** (logger + PostHog) toda operación que corre dentro de un request donde el contexto nunca se estableció, con modelo, operación y stack. Dos semanas en producción dan la lista real de caminos sin contexto (jobs, auth, pre-tenant, el que nadie conocía). Costo: cero riesgo funcional.

**Fase 1 — sombra por lote (políticas con interruptor).** La variante de sombra de cada política deja pasar todo y solo registra la señal confiable: **falta de contexto**.

```sql
CREATE OR REPLACE FUNCTION public.app_rls_mode() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT coalesce(nullif(current_setting('app.rls_mode', true), ''), 'enforce') $$;

-- true = deja pasar. En 'shadow' registra UNA vez por transacción y tabla si la consulta corre
-- SIN app.company_id. No intenta detectar "fila de otra empresa": la política se evalúa sobre las
-- filas ESCANEADAS (antes de los filtros del usuario no leakproof, joins a padres, seq scans), así que
-- una consulta correcta también tocaría filas ajenas y el log sería ruido. Eso lo cubren los tests
-- con dos empresas (§7.10).
CREATE OR REPLACE FUNCTION public.app_rls_shadow_pass(p_table text) RETURNS boolean
LANGUAGE plpgsql VOLATILE AS $$
BEGIN
  IF app_rls_mode() = 'enforce' THEN RETURN false; END IF;
  IF app_rls_mode() = 'shadow' AND app_current_company_id() IS NULL
     AND current_setting('app.shadow_' || p_table, true) IS DISTINCT FROM '1' THEN
    PERFORM set_config('app.shadow_' || p_table, '1', true);
    RAISE LOG 'rls_shadow sin_contexto table=% actor=% user=%',
      p_table, current_setting('app.actor_kind', true), app_current_user_id();
  END IF;
  RETURN true;
END $$;

-- Variante de sombra de la plantilla (a); las demás plantillas igual, con su condición propia:
CREATE POLICY tenant_isolation ON public.<t>
  USING      (app_rls_shadow_pass('<t>') OR company_id = app_current_company_id())
  WITH CHECK (app_rls_shadow_pass('<t>') OR company_id = app_current_company_id());
```

- El modo se fija por base: `ALTER DATABASE alphataco SET app.rls_mode = 'shadow'` (sin deploy; aplica a conexiones nuevas: reiniciar el pool). Valores: `off` (pasa todo, sin log), `shadow` (pasa todo, loguea falta de contexto), `enforce` (la variante con interruptor se comporta como la final).
- La función es `VOLATILE`: dentro de un `OR` impide usar el índice de `company_id`. Por eso la variante con interruptor **solo vive mientras su lote está en sombra**.
- **Fase 2 — enforce por lote.** Tras una semana de log limpio, el PR del lote **reemplaza** la variante de sombra por la política final sin interruptor (§7.4). Desde ahí el rollback de ese lote es `DISABLE ROW LEVEL SECURITY` (migración en `prisma/rollbacks/`) o la URL del owner, no el GUC.
- El interruptor es un andamio: mientras una tabla lo tenga, cualquiera que ejecute SQL como `alphataco_app` puede hacer `set_config('app.rls_mode','off',true)`. Ninguna tabla en enforce lo conserva.

**Orden de lotes** (de menor a mayor riesgo; columna "Lote" del Anexo A):

| Lote | Contenido | Por qué en ese orden |
| --- | --- | --- |
| L1 | Globales (solo `REVOKE` de escritura), catálogos directos chicos de configuración (`company_positions`, `workshops`, `workshop_sectors`, `types_of_repairs`, `tire_brands`, `measurement_units`, `cost_center`, `kpis`, `custom_form`…), legacy a dropear | Pocas filas, pocos escritores, errores visibles al instante |
| L2 | Catálogos mixtos (`document_types`, `type`, `sub_type`, `guild`, `brand_vehicles`) y nullable chicas (`contacts`, `equipment_owners`, `customer_services`, `companies_employees`), `jobs_runs` | Prueban la regla "global + propio" |
| L3 | Finanzas y Almacenes directos (Tesorería, Compras, Facturación, ARCA, Almacenes) | Módulos nuevos, ya escritos con `companyId` explícito y con tests de integración por módulo |
| L4 | Operativos directos (Mantenimiento, checklists, clientes, otros equipos, neumáticos, pre-legajos, notificaciones, `daily_indicators`, `dailyreport`, `documents_company`) | Mucho tráfico; para entonces el patrón está probado |
| L5 | Herencia (EXISTS) y denormalizaciones (`dailyreportrows` y relaciones, documentos, diagramas, líneas) | Requiere migraciones de datos y FKs compuestas |
| L6 | Núcleo: `employees`, `vehicles`, `preparte`, `share_company_users`, `company`, `profile`, `user_roles`, `user_permissions`, tablas de usuario | Pre-tenant y auth: lo más delicado, al final |
| L7 | Roles (D1) y RLS por permiso en tablas sensibles | Depende de decisiones de negocio |

**Respaldo previo** a cada lote en producción: `pg_dump -Fc` completo + verificación de restauración en dev (el proyecto no tiene PITR, según `CLAUDE.md`). Las migraciones de datos (backfill de `company_id`, `SET NOT NULL`) se escriben idempotentes.

**Rollback:**
- Inmediato y global (sin deploy de código): `DATABASE_URL` vuelve al rol `alphataco_owner`. Sin `FORCE`, el owner bypassa todas las políticas; la app sigue con `withCompany()` como antes.
- Lote en sombra: `ALTER DATABASE … SET app.rls_mode = 'off'`. Lote en enforce (ya sin interruptor): migración `ALTER TABLE … DISABLE ROW LEVEL SECURITY` para las tablas del lote (archivo en `prisma/rollbacks/`, que ya existe como carpeta).
- Las columnas denormalizadas y los índices **no** se revierten: son inocuos.

### 7.12 Qué se rompe seguro (y el arreglo)

| Se rompe | Por qué | Arreglo |
| --- | --- | --- |
| Login, registro, sesión, claims | Better Auth lee `auth_*`, `profile`, `company`, `share_company_users` sin empresa | Cliente de sistema para Better Auth (§7.6) |
| Selector de empresa, `getActiveCompanyId`, archivos | Pre-tenant | `app_accessible_company_ids()` |
| Joins a catálogos globales | `include` de `type`/`document_types` con `company_id NULL` | Política de catálogo mixto (lectura NULL o propia) |
| Cualquier consulta fuera de `getDb()`/`withTenantTx` | Fallo cerrado: cero filas | Fase 0 los encuentra; CI prohíbe importar `prisma` crudo en features |
| Triggers que cruzan empresas | Solo ven la empresa activa | `SECURITY DEFINER` |
| Vista `equipments_with_pending_deviations` | Correría como owner (bypass) | DROP o `security_invoker` |
| Jobs | Sin sesión | `withTenantTx` por empresa + cliente de sistema para el loop |
| Seed, demo, bootstrap, `sync-prod-to-dev.sh` | Sin contexto | `SYSTEM_DATABASE_URL` |
| pgTAP y vitest de integración existentes | Corren como superuser: no fallan, pero tampoco prueban nada de RLS | Agregar `SET ROLE alphataco_app` en los tests nuevos |
| `prisma migrate deploy` si `DATABASE_URL` pasa al rol de app | Sin DDL | `MIGRATE_DATABASE_URL` |
| Errores de unicidad globales (`employees.cuil`) | La fila de otra empresa es invisible pero bloquea el INSERT | D8 |
| `deleteMany`/`updateMany` en cascada desde código (`20261019100200_move_cascades_to_code`) | Si una cascada cruzaba empresas por error, ahora borra menos (correcto) | Revisar que los conteos devueltos se usen bien |

---

## 8. Orden de PRs chicos e independientes

Cada PR se despliega solo y deja el sistema funcionando igual que antes si no se activa el siguiente.

| PR | Contenido | Cambia comportamiento | Rollback |
| --- | --- | --- | --- |
| **PR 0 — Limpieza de fugas latentes** | Borrar el DataTable legacy `src/shared/components/data-table/` (verificado con grep: ningún archivo fuera de esa carpeta lo importa salvo `src/shared/actions/select-distinct.server.ts`; reconfirmar con `npx next build` antes de borrar), `querySelectDistinct`, `distinct-values.ts`, `DROP FUNCTION select_distinct_values`; `DROP VIEW equipments_with_pending_deviations`; quitar `DEFAULT NULL` de `p_company_id` en las 6 funciones; corregir comentario de `prisma-tenant.ts` | No (código muerto) | Revertir migración |
| **PR 1 — Roles y URLs** | Migración: `alphataco_owner/app/system`, `ALTER … OWNER`, grants y default privileges. `prisma.config.ts` + `entrypoint.sh` con `MIGRATE_DATABASE_URL`. `.env*.example` con las tres variables (vacías). Actualizar `.claude/rules/migrations.md` (RLS deja de estar prohibido, regla nueva: toda tabla nueva declara su política) y `CLAUDE.md` | No: `DATABASE_URL` sigue en el owner | Volver URLs |
| **PR 2 — Funciones de contexto** | `prisma/sql/tenant.sql`: `app_current_company_id`, `app_accessible_company_ids`, `app_has_permission`, `app_rls_mode`, `app_rls_shadow_pass`. Sin políticas | No | Revertir |
| **PR 3 — Contexto único en la app (fase 0)** | `src/shared/lib/tenant-db.ts` (`getTenantContext`, `getDb`, `withTenantTx`) + los 5 checks de §7.3. `withActor`/`withSessionActor` delegan en `withTenantTx`. Telemetría de "consulta sin contexto" **sobre el singleton actual** (`src/shared/lib/prisma.ts`) con `AsyncLocalStorage` (§7.11 fase 0). Better Auth y scripts a `SYSTEM_DATABASE_URL` | Fija GUCs que nadie lee todavía | Revertir |
| **PR 4..n — Migración de features a `getDb()`** | Una feature por PR (Tesorería, Compras, Almacenes, …); grep en CI que prohíbe `import { prisma }` en `src/features/**` salvo allowlist | No (mismo SQL + GUCs) | Revertir el PR |
| **PR 5 — Índices** | 34 índices `company_id` (concurrently) | Solo performance | `DROP INDEX` |
| **PR 6 — Lote L1 + L2 en shadow** | `ENABLE RLS` + políticas con interruptor; `DATABASE_URL` → `alphataco_app` en dev; `app.rls_mode = shadow` | Solo logs | `rls_mode = off` / URL |
| **PR 7 — L1/L2 enforce + L3 shadow**, y así por lote | Un PR por lote: el lote anterior pasa a enforce **reemplazando** sus políticas por las finales sin interruptor; el siguiente entra en sombra | Sí, por lote | `DISABLE RLS` (rollbacks) / URL owner |
| **PR 8 — Denormalizaciones L5** | Una migración por familia (`dailyreportrows*`, `documents_*`, líneas financieras): columna, backfill, trigger, FK compuesta, índice. Luego su política | Datos nuevos; políticas en shadow | Columnas quedan; disable RLS |
| **PR 9 — Núcleo L6 + políticas finales** | `employees`/`vehicles`/`company`/`profile`/`user_*` (sombra y luego enforce, con la regla anti-recursión de §7.4); `DROP FUNCTION app_rls_shadow_pass` cuando ningún lote quede en sombra; test pgTAP de catálogo de RLS | Sí | Migración de rollback preparada |
| **PR 10 — L7 (tras D1/D4)** | `roles.company_id`, RLS por permiso en tablas sensibles | Sí | Disable |

---

## 9. Riesgos de implementación a vigilar

- **Doble fuente de la regla de pertenencia** (`canUseCompanyAsTenant` en TS y `app_accessible_company_ids` en SQL): unificar o testear equivalencia.
- **Costo por consulta** del batch `[set_config, query]`: medir antes de migrar features (check 5 de §7.3).
- **Acciones largas** (`timeout` de interactivas) que hoy hacen lecturas fuera de la transacción: con `getDb()` cada una es su propio batch; las que mezclan `prisma` y `tx` hay que revisarlas.
- **`count`/`groupBy` de facetas** sobre tablas con política EXISTS: candidatos a denormalizar.
- **Empresa activa a mitad de request**: `getTenantContext()` se cachea por request; `switchActiveCompany` debe redirigir/recargar para no mezclar contextos en el mismo render.

---

## 10. Decisiones de negocio a pedirle al usuario

| # | Pregunta | Afecta |
| --- | --- | --- |
| D1 | ¿Los roles (`roles`, `role_permissions`, `role_notifications`) son **de la instancia** (los administra un admin de instancia) o **de cada empresa** (cada empresa crea los suyos y no ve los de las otras)? Hoy un admin de una empresa edita roles que usan las demás. | F2, L7 |
| D2 | ¿Puede existir un empleado, equipo, preparte o membresía **sin empresa** (`company_id NULL`)? Si no, se completa y se pasa a `NOT NULL`. | L2, L6 |
| D3 | ¿Quién puede crear o editar catálogos **globales** (`document_types`/`type`/`sub_type`/`guild`/`brand_vehicles` con `company_id NULL`, `checklist_sections/items`)? ¿Solo el proveedor (seed) o un admin de instancia? | L2 |
| D4 | ¿La base debe hacer cumplir **solo el aislamiento por empresa**, o también permisos por rol en tablas sensibles (Tesorería, credenciales ARCA, gestión de usuarios)? | L7 |
| D5 | ¿La empresa activa es **por sesión** (como hoy: cambiar en una pestaña cambia todas) o **por pestaña/URL**? | F3, `getTenantContext` |
| D6 | ¿Algún usuario necesita una **vista consolidada de varias empresas** (dashboards o reportes sumando empresas)? Con RLS estricto eso requiere un camino explícito. | Políticas de lectura, dashboards |
| D7 | ¿Qué puede hacer la **API externa** (`/api/external/v1/*`): solo leer esas 6 entidades de su empresa? ¿Escribe algo? | Actor `api` |
| D8 | ¿Una misma persona (CUIL/DNI) puede ser empleada en **dos empresas** de la misma instancia? Hoy `employees.cuil` y `document_number` son únicos globales. | Unicidad, oráculo entre empresas |

---

## Anexo A — Clasificación completa (217 tablas)

Columnas: **Tabla** (modelo Prisma y, si difiere, tabla real) · **Tipo** · **Ruta / nota** · **Estrategia RLS** · **Lote** (§7.11; `—` = sin RLS).

Rutas de herencia generadas desde las FK de `schema.prisma` y corregidas a mano según §2.1; en las ambiguas, la ruta muestra las FK nullable que la vuelven ambigua. Tamaños "grande" son estimaciones a confirmar con §2.2.

| Tabla | Tipo | Ruta / nota | Estrategia RLS | Lote |
| --- | --- | --- | --- | --- |
| account (`auth_account`) | Auth (Better Auth) | userId → auth_user | sin RLS | — |
| actions | Global (catálogo) |  | SELECT para todos; escritura solo rol dueño | L1 |
| aptitudes_tecnicas | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| aptitudes_tecnicas_puestos | Herencia | aptitudes_tecnicas_puestos(aptitud_id) → aptitudes_tecnicas | EXISTS sobre el padre | L5 |
| arca_call_logs | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| arca_credentials | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| arca_locks | Sistema | locks de ARCA (clave de texto) | sin RLS; solo rol app/sistema | — |
| arca_tokens | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| area_province | Herencia | area_id → areas_cliente → customers | EXISTS 2 saltos (chica) | L5 |
| areas_cliente | Herencia | areas_cliente(customer_id) → customers | EXISTS sobre el padre | L5 |
| assing_customer | Herencia | assing_customer(employee_id) → employees | EXISTS sobre el padre | L5 |
| bank_statement_lines | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| bank_statement_profiles | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| bank_statements | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| brand_vehicles | Directa nullable – catálogo mixto | company_id NULL = global | SELECT `company_id IS NULL OR = actual`; escritura `= actual` | L2 |
| category | Ambigua | covenant_id? → covenant (NULLABLE) | categorías sin convenio = ¿globales? | L2 |
| category_employee | Ambigua | emplyee_id? → employees (NULLABLE) | EXISTS por empleado; NULL sin dueño | L5 |
| certification_lines | Herencia | certification_lines(certification_id) → certifications | denormalizar company_id (grande) | L5 |
| certifications | Directa | company_id | `company_id = app_current_company_id()` | L4 |
| checkbooks | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| checklist_answers | Directa | company_id | `company_id = app_current_company_id()` | L4 |
| checklist_deviations | Directa | company_id | `company_id = app_current_company_id()` | L4 |
| checklist_items | Global (catálogo) | section_id → checklist_sections | idem | L1 |
| checklist_sections | Global (catálogo) | biblioteca reutilizable (`is_reusable`), sin dueño | idem; confirmar que ninguna empresa crea secciones propias | L1 |
| checklist_template_items | Herencia | checklist_template_items(template_id) → checklist_templates | EXISTS sobre el padre | L5 |
| checklist_template_sections | Herencia | checklist_template_sections(template_id) → checklist_templates | EXISTS sobre el padre | L5 |
| checklist_template_sub_types | Herencia | template_id → checklist_templates | EXISTS | L5 |
| checklist_template_types | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| checklist_templates | Directa | company_id | `company_id = app_current_company_id()` | L4 |
| cities | Global (catálogo) | province_id → provinces | idem | L1 |
| clothing_brands | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| clothing_deliveries | Directa | company_id | `company_id = app_current_company_id()` | L4 |
| clothing_delivery_items | Herencia | clothing_delivery_items(clothing_delivery_id) → clothing_deliveries | EXISTS sobre el padre | L5 |
| clothing_item_brand_sizes | Herencia | clothing_item_brand_sizes(clothing_item_id) → clothing_items | EXISTS sobre el padre | L5 |
| clothing_item_materials | Directa | company_id | `company_id = app_current_company_id()` | L4 |
| clothing_items | Directa | company_id | `company_id = app_current_company_id()` | L4 |
| clothing_sizes | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| companies_employees | Directa nullable – NULL sospechoso | company_id NULLABLE: medir cuántas filas NULL | `= actual` tras backfill + NOT NULL (o regla explícita para NULL) | L2 |
| company | Raíz del tenant | id = la empresa | `id = app_current_company_id()` OR `id = ANY(app_accessible_company_ids())` | L6 |
| company_fiscal_profiles | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| company_positions | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| contacts | Directa nullable – NULL sospechoso | company_id NULLABLE: medir cuántas filas NULL | `= actual` tras backfill + NOT NULL (o regla explícita para NULL) | L2 |
| contractor_employee | Ambigua | contractor_id? → customers; employee_id? → employees (ambas NULLABLE) | EXISTS por employee_id; filas con NULL: decidir | L5 |
| contractor_equipment | Ambigua | contractor_id? → customers; equipment_id? → vehicles | idem contractor_employee | L5 |
| contractor_other_equipment | Herencia | contractor_id → customers | EXISTS | L5 |
| contractors | Ambigua | tabla legacy (id, name); sin FK ni company_id | verificar uso; probablemente DROP | L1 |
| cost_center | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| countries | Global (catálogo) |  | idem | L1 |
| covenant | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| custom_form | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| customer_receipt_lines | Herencia | customer_receipt_lines(receipt_id) → customer_receipts | EXISTS sobre el padre | L5 |
| customer_receipt_payments | Herencia | customer_receipt_payments(receipt_id) → customer_receipts | EXISTS sobre el padre | L5 |
| customer_receipt_withholdings | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| customer_receipts | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| customer_services | Directa nullable – NULL sospechoso | company_id NULLABLE: medir cuántas filas NULL | `= actual` tras backfill + NOT NULL (o regla explícita para NULL) | L2 |
| customers | Directa | company_id | `company_id = app_current_company_id()` | L4 |
| daily_indicators | Directa | company_id | `company_id = app_current_company_id()` | L4 |
| dailyreport | Directa | company_id | `company_id = app_current_company_id()` | L4 |
| dailyreport_customer_equipment_relations | Herencia | daily_report_row_id → dailyreportrows | denormalizar o EXISTS vía dailyreportrows.company_id | L5 |
| dailyreportemployeerelations | Ambigua | daily_report_row_id? → dailyreportrows; employee_id? → employees | denormalizar (grande) | L5 |
| dailyreportequipmentrelations | Ambigua | daily_report_row_id? → dailyreportrows; equipment_id? → vehicles | denormalizar (grande) | L5 |
| dailyreportrows | Ambigua | daily_report_id? → dailyreport; preparte_id? → preparte; customer_id? → customers (todas NULLABLE) | denormalizar company_id (grande, hub de Operaciones) | L5 |
| dailyreportrows_history | Herencia | daily_report_row_id → dailyreportrows → (ver dailyreportrows) | denormalizar company_id (grande, sólo INSERT por trigger) | L5 |
| diagram_type | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| diagrams_logs | Herencia | employee_id → employees (o diagram_id → diagram_type) | EXISTS por employee_id | L5 |
| document_types | Directa nullable – catálogo mixto | company_id NULL = global | SELECT `company_id IS NULL OR = actual`; escritura `= actual` | L2 |
| documents_company | Directa | columna `applies` = company_id (FK a company) | `applies = app_current_company_id()` | L4 |
| documents_contracts | Ambigua | `contract_id` es String sin FK; legacy | verificar uso; probablemente DROP | L1 |
| documents_employees | Ambigua | applies? → employees (applies NULLABLE) | denormalizar company_id NOT NULL tras resolver filas con applies NULL | L5 |
| documents_employees_logs | Herencia | documents_employees_id → documents_employees → employees | denormalizar (grande) | L5 |
| documents_equipment | Ambigua | applies? → vehicles (applies NULLABLE) | idem documents_employees | L5 |
| documents_equipment_logs | Herencia | documents_equipment_id → documents_equipment → vehicles | denormalizar (grande) | L5 |
| documents_pre_employees | Directa | company_id | `company_id = app_current_company_id()` | L4 |
| empleado_aptitudes | Herencia | empleado_aptitudes(aptitud_id) → aptitudes_tecnicas | EXISTS sobre el padre | L5 |
| employee_workshop_sectors | Herencia | employee_workshop_sectors(employee_id) → employees | EXISTS sobre el padre | L5 |
| employees | Directa nullable – NULL sospechoso | company_id NULLABLE: medir cuántas filas NULL | `= actual` tras backfill + NOT NULL (o regla explícita para NULL) | L6 |
| employees_diagram | Herencia | employee_id → employees | denormalizar (grande: una fila por día y empleado) | L5 |
| equipment_owner_contract_types | Herencia | equipment_owner_contract_types(equipment_owner_id) → equipment_owners | EXISTS sobre el padre | L5 |
| equipment_owners | Directa nullable – NULL sospechoso | company_id NULLABLE: medir cuántas filas NULL | `= actual` tras backfill + NOT NULL (o regla explícita para NULL) | L2 |
| equipos_clientes | Herencia | equipos_clientes(customer_id) → customers | EXISTS sobre el padre | L5 |
| external_api_access_logs | Ambigua | external_api_client_id? → external_api_clients | EXISTS; logs sin cliente = intentos fallidos (sistema) | L5 |
| external_api_clients | Directa | company_id | `company_id = app_current_company_id()` | L4 |
| form_answers | Herencia | form_answers(form_id) → custom_form | denormalizar company_id (grande) | L5 |
| guild | Directa nullable – catálogo mixto | company_id NULL = global | SELECT `company_id IS NULL OR = actual`; escritura `= actual` | L2 |
| handle_errors | Sistema | log de errores | sin acceso del rol app salvo INSERT | L1 |
| hierarchy | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| industry_type | Global (catálogo) |  | idem | L1 |
| invoice_certifications | Herencia | invoice_certifications(invoice_id) → invoices | EXISTS sobre el padre | L5 |
| invoice_lines | Herencia | invoice_lines(invoice_id) → invoices | denormalizar company_id (grande) | L5 |
| invoice_vat | Herencia | invoice_vat(invoice_id) → invoices | EXISTS sobre el padre | L5 |
| invoices | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| jobs_runs | Sistema | company_id NULL = paso global del job | sin acceso del rol app; solo rol sistema | L2 |
| kpi_revisions | Herencia | kpi_revisions(kpi_id) → kpis | EXISTS sobre el padre | L5 |
| kpis | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| maintenance_activity_log | Directa | company_id | `company_id = app_current_company_id()` | L4 |
| maintenance_group_type_of_repairs | Ambigua | group_id? → maintenance_request_groups; type_id → types_of_repairs | EXISTS por type_id (NOT NULL) | L5 |
| maintenance_order_item_repair_types | Herencia | maintenance_order_item_id → maintenance_order_items | EXISTS | L5 |
| maintenance_order_items | Directa | company_id | `company_id = app_current_company_id()` | L4 |
| maintenance_orders | Directa | company_id | `company_id = app_current_company_id()` | L4 |
| maintenance_request_groups | Directa | company_id | `company_id = app_current_company_id()` | L4 |
| maintenance_request_items | Directa | company_id | `company_id = app_current_company_id()` | L4 |
| maintenance_requests | Directa | company_id | `company_id = app_current_company_id()` | L4 |
| material_batches | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| material_categories | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| material_request_lines | Herencia | material_request_lines(request_id) → material_requests | EXISTS sobre el padre | L5 |
| material_requests | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| material_unit_write_offs | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| material_units | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| materials | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| measure_units | Global (catálogo) |  | idem | L1 |
| measurement_units | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| model_vehicles | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| modules | Global (catálogo) |  | idem | L1 |
| notification_deliveries | Directa + usuario | company_id | `company_id = actual` AND (dueño = app.user_id OR permiso de gestión) | L6 |
| notification_events | Directa | company_id | `company_id = app_current_company_id()` | L4 |
| notification_settings | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| org_chart_positions | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| other_equipment | Directa | company_id | `company_id = app_current_company_id()` | L4 |
| other_equipment_certifications | Herencia | other_equipment_certifications(equipment_id) → other_equipment | EXISTS sobre el padre | L5 |
| own_check_events | Herencia | own_check_events(check_id) → own_checks | EXISTS sobre el padre | L5 |
| own_checks | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| payment_order_lines | Herencia | payment_order_lines(payment_order_id) → payment_orders | denormalizar company_id (grande) | L5 |
| payment_order_payments | Herencia | payment_order_payments(payment_order_id) → payment_orders | EXISTS sobre el padre | L5 |
| payment_order_rejections | Herencia | payment_order_rejections(payment_order_id) → payment_orders | EXISTS sobre el padre | L5 |
| payment_order_withholdings | Herencia | payment_order_withholdings(payment_order_id) → payment_orders | EXISTS sobre el padre | L5 |
| payment_orders | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| pre_employees | Directa | company_id | `company_id = app_current_company_id()` | L4 |
| preparte | Directa nullable – NULL sospechoso | company_id NULLABLE: medir cuántas filas NULL | `= actual` tras backfill + NOT NULL (o regla explícita para NULL) | L6 |
| preparte_change_logs | Herencia | preparte_change_logs(preparte_id) → preparte | denormalizar company_id (grande) | L5 |
| price_update_rules | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| price_update_runs | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| profile | Usuario | 1 profile por credencial; abarca varias empresas vía share_company_users | política por app.user_id (lectura propia + perfiles de la empresa activa) | L6 |
| provinces | Global (catálogo) |  | idem | L1 |
| purchase_expense_categories | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| purchase_order_lines | Herencia | purchase_order_lines(order_id) → purchase_orders | EXISTS sobre el padre | L5 |
| purchase_order_rejections | Herencia | purchase_order_rejections(order_id) → purchase_orders | EXISTS sobre el padre | L5 |
| purchase_orders | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| purchase_quote_lines | Herencia | purchase_quote_lines(quote_id) → purchase_quotes | EXISTS sobre el padre | L5 |
| purchase_quotes | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| purchase_receipt_lines | Herencia | purchase_receipt_lines(receipt_id) → purchase_receipts | EXISTS sobre el padre | L5 |
| purchase_receipts | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| purchase_request_lines | Herencia | purchase_request_lines(request_id) → purchase_requests | EXISTS sobre el padre | L5 |
| purchase_requests | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| remito_documents | Herencia | remit_id → remitos → dailyreportrows | EXISTS 2 saltos o denormalizar | L5 |
| remitos | Herencia | daily_report_row_id → dailyreportrows | EXISTS sobre dailyreportrows (ya denormalizada) | L5 |
| role_hidden_equipment_types | Ambigua | role_id (global) + type_id → type (nullable) | decisión: ¿ocultamiento por rol global o por empresa? hoy no tiene empresa | L7 |
| role_notifications | Global por instancia (DECISIÓN) | role_id → roles | idem roles | L7 |
| role_permissions | Global por instancia (DECISIÓN) | role_id → roles | idem roles | L7 |
| roles | Global por instancia (DECISIÓN) | sin company_id: un rol editado afecta a TODAS las empresas | SELECT para todos; escritura solo `is_system=false` y decisión de negocio | L7 |
| sales_points | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| sector_repair_types | Herencia | sector_repair_types(repair_type_id) → types_of_repairs | EXISTS sobre el padre | L5 |
| sectors | Herencia | sectors(customer_id) → customers | EXISTS sobre el padre | L5 |
| service_areas | Herencia | service_id → customer_services (company_id NULLABLE) | EXISTS; depende de resolver customer_services | L5 |
| service_item_price_revisions | Herencia | service_item_price_revisions(service_item_id) → service_items | EXISTS sobre el padre | L5 |
| service_items | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| service_sectors | Herencia | service_id → customer_services (company_id NULLABLE) | idem | L5 |
| session (`auth_session`) | Auth (Better Auth) | userId → auth_user; guarda el claim `company` | sin RLS | — |
| share_company_users | Directa nullable – NULL sospechoso | company_id NULLABLE: medir cuántas filas NULL | `= actual` tras backfill + NOT NULL (o regla explícita para NULL) | L6 |
| stock_balances | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| stock_movement_lines | Herencia | movement_id → stock_movements | denormalizar (grande) | L5 |
| stock_movements | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| sub_type | Directa nullable – catálogo mixto | company_id NULL = global | SELECT `company_id IS NULL OR = actual`; escritura `= actual` | L2 |
| sub_type_compatible_items | Herencia | sub_type_compatible_items(sub_type_id) → sub_type | EXISTS sobre el padre | L5 |
| supplier_categories | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| supplier_category_links | Herencia | supplier_category_links(supplier_id) → suppliers | EXISTS sobre el padre | L5 |
| supplier_contacts | Herencia | supplier_contacts(supplier_id) → suppliers | EXISTS sobre el padre | L5 |
| supplier_documents | Herencia | supplier_documents(supplier_id) → suppliers | EXISTS sobre el padre | L5 |
| supplier_invoice_lines | Herencia | supplier_invoice_lines(invoice_id) → supplier_invoices | denormalizar company_id (grande) | L5 |
| supplier_invoice_taxes | Herencia | supplier_invoice_taxes(invoice_id) → supplier_invoices | EXISTS sobre el padre | L5 |
| supplier_invoice_vat | Herencia | supplier_invoice_vat(invoice_id) → supplier_invoices | EXISTS sobre el padre | L5 |
| supplier_invoices | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| supplier_withholding_profiles | Herencia | supplier_withholding_profiles(supplier_id) → suppliers | EXISTS sobre el padre | L5 |
| suppliers | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| support_ticket_views | Usuario | user_id | `user_id = app.user_id` | L6 |
| tabs | Global (catálogo) |  | idem | L1 |
| third_party_check_events | Herencia | third_party_check_events(check_id) → third_party_checks | EXISTS sobre el padre | L5 |
| third_party_check_operation_items | Herencia | third_party_check_operation_items(operation_id) → third_party_check_operations | EXISTS sobre el padre | L5 |
| third_party_check_operations | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| third_party_checks | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| tire_brands | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| tire_materials | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| tire_service_items | Herencia | service_order_id → tire_service_orders | EXISTS (o denormalizar si crece) | L5 |
| tire_service_orders | Directa | company_id | `company_id = app_current_company_id()` | L4 |
| tire_template_axles | Herencia | tire_template_axles(template_id) → tire_templates | EXISTS sobre el padre | L5 |
| tire_templates | Directa | company_id | `company_id = app_current_company_id()` | L4 |
| tire_types | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| tires | Directa | company_id | `company_id = app_current_company_id()` | L4 |
| treasury_accounts | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| treasury_concepts | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| treasury_movements | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| treasury_transfers | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| type | Directa nullable – catálogo mixto | company_id NULL = global | SELECT `company_id IS NULL OR = actual`; escritura `= actual` | L2 |
| type_hitch_types | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| type_operative | Global (catálogo) |  | idem | L1 |
| types_of_contract | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| types_of_repairs | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| types_of_vehicles | Global (catálogo) |  | idem | L1 |
| user (`auth_user`) | Auth (Better Auth) |  | sin RLS | — |
| user_dashboards | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| user_equipment_type_visibility | Usuario | user_id → profile + type_id → type | `user_id = app.user_id` AND tipo visible | L6 |
| user_permissions | Directa + usuario | company_id | `company_id = actual` AND (dueño = app.user_id OR permiso de gestión) | L6 |
| user_roles | Directa + usuario | company_id | `company_id = actual` AND (dueño = app.user_id OR permiso de gestión) | L6 |
| user_table_preferences | Usuario | user_id (texto) | `user_id = app.user_id` | L6 |
| vehicle_axle_tire_sizes | Herencia | vehicle_axle_tire_sizes(vehicle_id) → vehicles | EXISTS sobre el padre | L5 |
| vehicle_tire_positions | Herencia | vehicle_tire_positions(vehicle_id) → vehicles | EXISTS sobre el padre | L5 |
| vehicles | Directa nullable – NULL sospechoso | company_id NULLABLE: medir cuántas filas NULL | `= actual` tras backfill + NOT NULL (o regla explícita para NULL) | L6 |
| verification (`auth_verification`) | Auth (Better Auth) |  | sin RLS | — |
| warehouse_settings | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| warehouses | Directa | company_id | `company_id = app_current_company_id()` | L3 |
| withholding_regimes | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| work_diagram | Directa | company_id | `company_id = app_current_company_id()` | L4 |
| work_diagram_active_novelties | Directa | company_id | `company_id = app_current_company_id()` | L4 |
| work_order_item_repairs | Directa | company_id | `company_id = app_current_company_id()` | L4 |
| work_order_items | Herencia | work_order_id → work_orders (o maintenance_order_item_id → maintenance_order_items) | EXISTS o denormalizar si crece | L5 |
| work_orders | Directa | company_id | `company_id = app_current_company_id()` | L4 |
| workshop_sectors | Directa | company_id | `company_id = app_current_company_id()` | L1 |
| workshops | Directa | company_id | `company_id = app_current_company_id()` | L1 |
