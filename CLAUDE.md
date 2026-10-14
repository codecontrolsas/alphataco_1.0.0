# CLAUDE.md

**IDIOMA**: SIEMPRE comunicarte, planificar, comentar y documentar en **espanol**.

## Project Overview

Sistema de gestion integral para Grupo Horizonte (GH). Administra empleados, equipos, documentacion, operaciones (partes diarios), mantenimiento de vehiculos, formularios, y modulo comercial. Multi-empresa con RLS en Supabase.

## Tech Stack

- **Framework**: Next.js 16 with React 19 (App Router, Server Components)
- **Database**: PostgreSQL (Docker) vía Prisma — ya no queda nada de Supabase en `src/`
- **Auth**: Better Auth sobre el adaptador de Prisma (`src/shared/lib/auth.ts`). Lectura de sesión
  SIEMPRE por `src/shared/lib/session.ts`; los claims de empresa/legajo sólo los escribe
  `src/shared/lib/session-claims.ts` (server-only) — ver la invariante en `auth.ts`
- **Storage**: MinIO (S3) por `src/shared/lib/storage.ts`
- **State**: Zustand (global), React Query (server state), Jotai (atomic)
- **UI**: shadcn/ui + Tailwind CSS + Lucide icons
- **Forms**: React Hook Form + Zod validation
- **Analytics**: PostHog (error tracking and analytics)
- **Dates**: moment.js (NOT date-fns)

## Development Workflow

Verification loop for quality:

1. Make changes
2. Run `npm run check-types` (TypeScript)
3. Before committing: review diff against project rules (see `/review-changes`)
4. Before creating PR: run full check-types + diff review (see `/grill`)

```sh
# Development
npm run dev              # Start Next.js dev server
bash scripts/dev-up.sh   # Start postgres + minio (Docker) para dev local

# Verification
npm run check-types      # TypeScript type checking

# Database (ver docs/desarrollo/entornos.md y .claude/rules/migrations.md)
npm run db:deploy        # Aplicar migraciones pendientes (prisma migrate deploy)
npm run db:seed          # Seed idempotente de empresa/módulos/tabs/roles
npm run test:db          # Tests pgTAP contra Postgres (Docker)
npx prisma generate      # Regenerate Prisma client

# Testing
npm test                 # Unit tests (vitest)
npm run test:auth        # Integracion de auth (claims, credenciales, invitacion) vs. el compose
npm run test:e2e         # Run Cypress E2E tests headless
npm run test:e2e:open    # Open Cypress test runner
```

## Slash Commands

| Command           | Description                                             |
| ----------------- | ------------------------------------------------------- |
| `/commit-push-pr` | Verify, commit, push, and open a PR                     |
| `/quick-commit`   | Stage all changes and commit with a descriptive message |
| `/review-changes` | Review uncommitted changes against project rules        |
| `/test-and-fix`   | Run check-types and fix any failures                    |
| `/worktree`       | Create a git worktree for parallel Claude sessions      |
| `/grill`          | Adversarial code review — don't ship until it passes    |
| `/techdebt`       | End-of-session sweep for duplicated and dead code       |

## Agents

| Agent             | When to use                                                            |
| ----------------- | ---------------------------------------------------------------------- |
| `table-expert`    | Create, audit, or modify DataTables (columns, filters, export, facets) |
| `linear-sync`     | Interact with Linear: create/edit issues, sync notes, audit status     |
| `build-validator` | Ensure project builds correctly for deployment                         |
| `code-architect`  | Design reviews and architectural decisions                             |
| `code-simplifier` | Simplify recently written code without changing functionality          |
| `staff-reviewer`  | Review plans and architectures as a skeptical staff engineer           |
| `verify-app`      | Thoroughly verify the application works correctly after changes        |
| `oncall-guide`    | Help diagnose and resolve production issues                            |

**REGLA DataTables**: TODA tarea que involucre DataTables DEBE delegarse al agente `table-expert`.

## Skills (Superpowers — invocacion automatica)

| Peticion del usuario              | Skill que se invoca                           |
| --------------------------------- | --------------------------------------------- |
| "Planifica esto"                  | `superpowers:brainstorming` → `writing-plans` |
| "Implementa este plan"            | `superpowers:executing-plans`                 |
| "Debuguea esto"                   | `superpowers:systematic-debugging`            |
| "Revisa el codigo"                | `superpowers:requesting-code-review`          |
| "Crea un componente / formulario" | `superpowers:brainstorming` + MCP shadcn      |
| "Verifica que funcione"           | `superpowers:verification-before-completion`  |

Always use Context7 MCP first for library docs. Always use shadcn MCP for UI components.

## MCPs Disponibles (MCPs de Supabase: legacy hasta P6 — la BD vigente es el Postgres del compose)

1. **Supabase (LOCAL, PROD)** — SOLO LECTURA. Usar LOCAL por defecto. Solo usar PROD cuando el usuario lo indique explicitamente.
2. **Supabase DEV** — LECTURA + ESCRITURA DE DATOS ÚNICAMENTE. Permitido: `SELECT`, `INSERT`, `UPDATE`, `DELETE` sobre datos existentes (seeds de prueba, clonar registros desde PROD, editar datos para testing). **ESTRICTAMENTE PROHIBIDO**: toda query que modifique estructura o metadata — `CREATE`, `ALTER`, `DROP`, `TRUNCATE`, `RENAME`, `GRANT`, `REVOKE`, cambios de políticas RLS, creación/modificación de funciones/triggers/vistas/índices/tipos/enums. **TODA migración (estructura, funciones, triggers, políticas) se hace EXCLUSIVAMENTE con Prisma** siguiendo `.claude/rules/migrations.md`. Si el usuario pide un cambio estructural, responder con el flujo de Prisma — nunca ejecutarlo por MCP.
3. **shadcn-ui** — SIEMPRE usar para UI
4. **Context7** — SIEMPRE usar PRIMERO para docs de librerias
5. **Migraciones**: Ver `.claude/rules/migrations.md`. NUNCA `prisma migrate dev`. Flujo: baseline `0_init` + migraciones manuales (carpeta + SQL) + `npm run db:deploy` (contra el Postgres del compose).

## Critical Rules

Todas obligatorias. Guias completas en `.claude/rules/`:

| Regla                              | Archivo                   |
| ---------------------------------- | ------------------------- |
| Migraciones con Prisma             | `migrations.md`           |
| NO `:any` — Inferir tipos          | `typescript-types.md`     |
| Server Actions en features/        | `server-actions.md`       |
| Logger vs console.\*               | `logger.md`               |
| React Query obligatorio            | `react-query.md`          |
| Server Components First            | `server-components.md`    |
| TabContent y Fallbacks             | `tab-content.md`          |
| Sistema de Permisos                | `permissions.md`          |
| DataTable con Prisma               | `datatable.md`            |
| Filtros de DataTable               | `datatable-filters.md`    |
| Estructura de Features             | `feature-structure.md`    |
| Forms con shadcn + zod             | `forms.md`                |
| Evitar useEffect innecesarios      | `no-useeffect.md`         |
| Legajo en listas de empleados      | `employee-file-number.md` |
| Date pickers con escritura directa | `date-pickers.md`         |
| Queries eficientes                 | `efficient-queries.md`    |
| No dialogs nativos                 | `no-native-dialogs.md`    |
| Codigo en ingles                   | `code-language.md`        |
| moment.js para fechas              | `moment-dates.md`         |
| Reglas de Git                      | `git-rules.md`            |

## Self-Improvement

**OBLIGATORIO — NO OMITIR:** Después de TODA corrección del usuario, INMEDIATAMENTE actualizar la sección "Learned Corrections" de este archivo con la regla aprendida. Esto NO es opcional y NO se reemplaza con guardar en memoria (`memory/`). Ambos deben hacerse: memoria Y CLAUDE.md.

Checklist post-corrección:

1. Aplicar el fix solicitado
2. Agregar la regla a "Learned Corrections" en este CLAUDE.md
3. Guardar en memoria si aplica para futuras conversaciones

End corrections with: "Now update CLAUDE.md so you don't make that mistake again."

Keep iterating until the mistake rate measurably drops.

## Working with Plan Mode

- Start every complex task in plan mode (shift+tab to cycle)
- Pour energy into the plan so Claude can 1-shot the implementation
- When something goes sideways, switch back to plan mode and re-plan. Don't keep pushing.
- Use plan mode for verification steps too, not just for the build

## Parallel Work

- For tasks that need more compute, use subagents to work in parallel
- Offload individual tasks to subagents to keep the main context window clean
- When working in parallel, only one agent should edit a given file at a time
- For fully parallel workstreams, use git worktrees: `/worktree`

## Things Claude Should NOT Do

- Don't use `:any` or `as any` in TypeScript without explicit approval
- Don't use `console.*` — use logger from `@/lib/logger`
- Don't use `window.confirm/alert/prompt` — use shadcn dialogs
- Don't use `date-fns` — use moment.js
- Don't use `useEffect` + `useState` for data fetching — use React Query
- Don't use Supabase direct for new code — use Prisma
- Don't create API routes — use Server Actions
- Don't commit without running check-types first
- Don't add Co-Authored-By to commits
- Don't commit automatically — only when the user asks
- Don't skip updating CLAUDE.md "Learned Corrections" after a user correction — SIEMPRE actualizar
- Don't create .md files unless explicitly requested
- Don't skip error handling

## Project Structure

```
src/
├── app/                    # Next.js pages (thin, import from features/)
├── features/               # Business logic by domain
│   └── {Feature}/
│       ├── components/     # React components
│       ├── hooks/          # useQuery hooks
│       ├── actions/        # Server actions ('use server')
│       ├── types/          # TypeScript types
│       └── utils/          # Utilities
├── shared/components/      # Shared components (DataTable, etc.)
├── components/ui/          # shadcn/ui components
├── lib/                    # logger.ts, utils.ts, prisma
└── store/                  # Zustand stores
```

## Quick References

- `src/features/Permissions/permissions-map.ts` — Permissions map
- `src/features/Permissions/components/PermissionGuard.tsx` — Permission guard
- `src/lib/logger.ts` — Custom logger
- `src/shared/lib/auth.ts` — Configuración de Better Auth y la invariante del claim de empresa
- `src/shared/lib/session.ts` — Única lectura de sesión del sistema
- `src/shared/components/common/DataTable/DataTable.tsx` — DataTable component
- `src/shared/components/common/DataTable/DOCS.md` — DataTable docs
- Module IDs: see `.claude/rules/permissions.md`

## Learned Corrections

### Columnas UUID/FK opcionales: enviar `null`, nunca string vacío

Al persistir en Supabase/Postgres, una columna `@db.Uuid` (o `Int`) que recibe `''` provoca **400 invalid input syntax**. Los forms suelen inicializar FKs opcionales como `vehicle?.campo || ''`; ese `''` debe convertirse a `null` antes del `insert`/`update`. Normalizar en la **server action** (límite contra la BD), no campo por campo en el form. NO convertir columnas de texto ni `NOT NULL` (ej. `engine`). Referencia: `normalizeVehicleFkFields()` en `vehicle-actions.ts`.

### Diagnóstico: ir al error real, no al ruido

Si un error de servidor aparece enmascarado por una capa secundaria (ej. PostHog/instrumentación que falla al capturar la excepción), ignorar esa capa y rastrear el error de origen (el `400`/`500` real de la query). No perseguir issues tangenciales de entorno salvo que el usuario lo pida.

### Permisos: 3 roles de acceso completo

Al insertar nuevas tabs o `role_permissions`, SIEMPRE incluir los 3 roles: `admin`, `administrador`, y `full-access-provisional`. No solo `admin`.

```sql
WHERE r.slug IN ('admin', 'administrador', 'full-access-provisional')
```

**Y SOLO esos 3.** Los roles custom de la empresa (`roles.slug IS NULL`: "Usuario de RR.HH.", "Usuario Control Documental", "Administrador Operaciones", etc.) NO se cargan por migración aunque sean los que más usuarios tienen — se asignan **manualmente** desde el editor de permisos. Si al revisar una tab nueva ves que los roles operativos no la tienen, eso es lo esperado, no un bug de la migración.

Para que la asignación manual funcione, la tab DEBE estar declarada en `permissions-map.ts` con sus `allowedActions`: el editor arma las acciones cruzando `allowedActions` con la tabla `actions`, y una tab ausente del mapa se muestra sin ninguna acción tildeable.

### Legajo: columna separada en DataTables

El legajo (`employees.file`) SIEMPRE debe ser una columna separada con su propio filtro `text`. NUNCA embeber el legajo dentro de la columna de nombre (ej: `[123] Apellido Nombre` está MAL). Columna de legajo ANTES de la columna de nombre. En comboboxes/selectores SÍ se puede combinar.

### NUNCA encadenar modales — unificar en un solo form

Si una tarea requiere capturar datos secundarios u opcionales después de una acción principal, **NUNCA** resolver con "un modal que abre otro modal". El usuario detesta ese patrón.

**Solución correcta**: un único formulario con secciones separadas por `<Separator />`:

- Sección principal: campos obligatorios (ej: form de creación del Área)
- Separador con título descriptivo (ej: "Vincular a contratos (opcional)")
- Sección secundaria: campos opcionales, renderizada condicionalmente si dependen de inputs previos (ej: MultiSelect de contratos solo visible cuando hay `customer_id` seleccionado)
- **Un solo botón de submit** que ejecuta: acción principal → captura ID del resultado → acciones secundarias con ese ID

Siempre consultar `/frontend-design:frontend-design` antes de implementar para distribuir el form correctamente.

### Al revisar un ticket, leer SIEMPRE los comentarios (no solo la descripción)

La descripción del ticket suele ser el sintoma percibido por el usuario final; los **comentarios** (`manage_task_comments` action=list) contienen el diagnostico real del equipo. Ej: ticket 292 describia "no puedo asignar recurso empleado", pero el comentario de Fabricio aclaraba "al asignar uno nuevo me borra los anteriores, desde comercial". Leer comentarios ANTES de invertir en investigacion de codigo: reorienta la causa raiz y evita perseguir la hipotesis equivocada.

### El campo "análisis y supuestos" del ticket manda sobre la descripción

En TaskApp, `analysis_notes` (análisis y supuestos del equipo) es la bajada del pedido y **define el alcance por encima de la `description`** del cliente. Orden de lectura y autoridad: `analysis_notes` / `acceptance_criteria` → comentarios → `description`. En el 690 la descripción hablaba de "solapa Taller, contenedores y trailer", y el análisis de "todas las solicitudes de Equipamientos, permisos por tipo de equipamiento, en el Rol": pregunté cuatro cosas que el análisis ya respondía. Preguntar solo lo que ninguno de los dos resuelve.

### Alertas de documentos: excluir bajas SALVO los tipos "Documento de baja"

Al excluir empleados/equipos dados de baja (`is_active = false`) de la generacion de alertas de documentos pendientes, los tipos marcados como **"Documento de baja"** (`document_types.down_document = true`) **DEBEN seguir generando alertas a los recursos dados de baja** (son la documentacion de egreso). Regla: crear/mantener alerta `<=> (down_document = true) OR (recurso is_active = true)`. Los **documentos reales** (con `document_path`) de bajas NUNCA se borran; la limpieza solo elimina filas `state='pendiente'` **sin archivo**. La generacion vive en triggers SQL de Postgres (`controlar_alertas_single_document_all_employees/vehicles`, `controlar_alertas_documentos_single_employee/vehicle`) — modificarlos es migracion Prisma, no MCP.

### Entornos de BD: `.env` local apunta a DEV, prod es otra BD

El `.env` local apunta al proyecto **dev** Supabase (`ref pdrylqbztmpgawsfdsbr`). `DIRECT_URL_MAIN` (prod) NO esta en el `.env` local, asi que `prisma db execute`/`migrate` desde local solo tocan dev (prod corre por el pipeline de deploy). MCP `horizonte-prod` = prod (solo lectura); `horizonte-dev` = dev. Verificar SIEMPRE el target antes de ejecutar migraciones.

### Modal `SimpleDocument` != flujo `UploadDocumentMulti*`

El boton "Subir documento" de las tablas de documentos abre `SimpleDocument.tsx` (flujo propio, persistencia inline), DISTINTO de los forms `UploadDocumentMultiEmployee/Equipment` (que usan `uploadDocument(..., multipleResources)` de `utils.ts`). Si un fix "multirecurso" se hace en uno, verificar el otro: `SimpleDocument` no tenia logica multirecurso (subia a un solo recurso) y usaba `router.refresh()` (recarga toda la ruta) en vez de `queryClient.invalidateQueries()` (refresca solo la tabla en client-side mode).

### "Cerrar una tarea" / "ponle un cierre" = resumen interno, NUNCA comentario al cliente

Cuando el usuario pide "cerrar la tarea", "ponle un cierre", "dale cierre al ticket", se refiere al **cierre interno**: completar el campo `completion_summary` (qué se hizo, causa raíz, fix, commits/PRs, datos tocados) y/o pasar el estado a Resuelto. **NUNCA** significa escribir un comentario de cara al cliente. Los comentarios públicos (`manage_task_comments` con `is_internal: false`) son visibles al reporter externo y **NO** se redactan salvo pedido explícito e inequívoco. Ojo adicional: el estado "Resuelto" (id 6) tiene `triggers_resolved_email: true` → al pasar a Resuelto se dispara un email automático al cliente; tenerlo presente antes de cambiar estado. Ante la duda sobre algo que impacte al cliente (comentario público, email, cambio de estado que notifica), preguntar primero.

### Tras subir documentos: invalidar React Query, no solo `router.refresh()`

Las tablas de documentos (empleados/equipos) corren en **client-side mode con React Query**. Tras subir un documento (flujo masivo `UploadDocumentMultiEmployee/Equipment` o individual `SimpleDocument`), `router.refresh()` por sí solo **NO** actualiza la tabla de fondo (solo refresca Server Components/SSR). SIEMPRE llamar también `queryClient.invalidateQueries()`. Patrón: `queryClient.invalidateQueries(); router.refresh();` (el invalidate para las tablas React Query; router.refresh para las tablas SSR del sistema viejo). Extiende la regla de "Modal SimpleDocument != flujo UploadDocumentMulti\*".

### Carga masiva multirecurso: persistir server-side (Prisma), nunca `.in([cientos])` client-side

Subir un documento multirecurso a cientos de recursos con `supabaseBrowser().in('applies', [cientos de ids])` (client-side) **muere por timeout**: arma una URL gigante y dispara la cadena de triggers `update_status_trigger` (row-level) → `UPDATE employees/vehicles` → `controlar_alertas_*` → recálculo completo de alertas, **por cada fila** (N×N×M). Solución: server action Prisma con `$transaction` (`updateMany` faltantes-pendientes + `createMany` ausentes, ignorando los ya presentados) + compensación del storage si la transacción falla. Y los triggers de documentos deben ser **statement-level** (`REFERENCING NEW TABLE ... FOR EACH STATEMENT`, un trigger por evento porque Postgres no admite transition tables con `INSERT OR UPDATE` juntos) con `UPDATE ... SET status = (CASE ... END)::status_type` (la columna `status` es enum, requiere cast explícito). Los `controlar_alertas_*` de employees/vehicles deben tener guarda `WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active OR OLD.company_id IS DISTINCT FROM NEW.company_id)` para no recalcular alertas en cambios de `status`.

### Cambiar guardas/triggers row-level: analizar cascadas y TODOS los flujos masivos antes

Antes de modificar la guarda `WHEN` o el nivel de un trigger row-level (ej. `controlar_alertas_employees/vehicles`), mapear el grafo COMPLETO de cascadas (qué trigger dispara qué otro) y TODOS los flujos que hacen `UPDATE`/`updateMany` masivo sobre esa tabla. Un "flag de sesión" para cortar la recursión NO cubre los updates masivos originados en server actions (ej. `reassignVehiclesToOwner`, `recalculateResourceStatus`). La opción segura suele ser una **lista explícita de columnas en el `WHEN`** (las que realmente disparan el recálculo), no quitar la guarda. Verificar el disparo/no-disparo empíricamente con `EXPLAIN (ANALYZE)` (reporta el tiempo POR trigger). Extiende [[carga masiva multirecurso]].

### "No solicitar documentos que ya no aplican" (cambio de función): archivar, no borrar

Cuando un documento deja de aplicar a un recurso (cambió `company_position`/categoría/cliente/aptitud), si tiene archivo subido NO se borra: se **archiva** (columna `archived_at`, NULL=vigente) para conservarlo como HISTORIAL, y se excluye de status, listas, alertas, descargas y estadísticas. Solo se muestra en el DETALLE del recurso marcado "Ya no aplica". Las alertas vacías (sin archivo) que dejan de aplicar sí se borran. La re-evaluación se dispara ante el UPDATE del RECURSO (no del documento): por trigger si cambian columnas directas, y por llamada explícita a `controlar_alertas_documentos_single_employee/_vehicle` para las M:M (contratistas/aptitudes, que no tienen trigger en la pivote) desde las server actions de edición/creación y de asignación a cliente. Cobertura "en todo lugar" = mutaciones + mostrar + calcular status + estadísticas.

### Funciones SQL que retornan `void`: usar `$executeRaw`, NUNCA `$queryRaw`

`$queryRaw` **deserializa** el resultado de cada columna; si llamás una función Postgres que retorna `void` (ej. `SELECT controlar_alertas_documentos_single_employee(...)`), Prisma falla en runtime con `UnsupportedNativeDataType: void` / _"Failed to deserialize column of type 'void'"_ (código `P2010`). Usar **`$executeRaw`** (ejecuta sin deserializar, retorna el count de filas). Aplica a TODA invocación de función void via Prisma raw, incluido el patrón `SELECT fn(x) FROM unnest(...)`. **El error NO aparece en `check-types` ni al correr la función por psql/MCP** — solo en el flujo real de la app (editar/crear empleado o equipo, asignar a cliente). Por eso: tras agregar una llamada raw a una función void, **probar el flujo de UI real**, no solo el SQL. Bug introducido en el 358 (los recálculos M:M de `updateEmployee`/`createEmployee`/`updateVehicle`/`assign*ToCustomer`).

### La config de los `document_types` la define el CLIENTE — nos adaptamos, no la cuestionamos

Las condiciones de un tipo de documento (`special`, `conditions` por `company_position`/`guild`/`category`/etc.) son **decisión del cliente**. Si el cliente configuró `Apto Medico GH` como especial para 9 funciones, **así debe ser**: los empleados de otras funciones que lo tengan cargado **ya no lo requieren** y archivarlos es **correcto** — aunque intuitivamente "un apto médico debería aplicar a todos". NO asumir que una config "está mal" ni proponer corregirla salvo que el usuario/cliente lo pida explícitamente. Al validar el backfill o cualquier re-evaluación de alertas, el criterio de verdad es: _"¿el recurso cumple las conditions que el cliente definió?"_ — si no las cumple, el doc no le aplica, punto. La función `controlar_alertas_documentos_single_*` es fiel a esas conditions; un archivado masivo "sorprendente" (ej. 142 aptos médicos) refleja la config del cliente, no un bug. Extiende [[archivado docs por cambio de función]].

### Reconciliacion de documentos: hay DOS funciones (por-recurso vs por-tipo); la "all" estaba rota para tipos globales

Al re-evaluar que documentos aplican hay DOS caminos: `controlar_alertas_documentos_single_employee/_vehicle` (por-RECURSO, se dispara al cambiar el recurso: company_position, guild, category, etc.) y `controlar_alertas_single_document_all_employees/_vehicles` (por-TIPO, se dispara al editar `conditions`/`mandatory` del `document_type` via `trg_document_types_update`). Bug del ticket 411: la version "all" tenia DOS defectos: (a) filtraba `WHERE company_id = doc.company_id` y como los tipos afectados son GLOBALES (`company_id NULL`, ej. Apto Medico GH) no iteraba a NINGUN recurso -> editar sus conditions nunca reconciliaba; y (b) en la rama "vuelve a cumplir" solo hacia `INSERT ... WHERE NOT EXISTS`, sin el `UPDATE ... SET archived_at = NULL` -> los documentos archivados por el 358 quedaban trabados en "Ya no aplica" para siempre aunque el recurso volviera a cumplir la condicion (la version por-recurso SI tenia el des-archivado; por eso los cambios de funcion individuales si reactivaban, pero no la edicion de conditions del tipo). Ademas, el flujo de subida (`SimpleDocument`, `ReplaceDocument`, `upload-multiresource-document`) no limpiaba `archived_at` al subir -> re-subir el documento no lo des-archivaba. **Modelo real de empresas**: es efectivamente MONO-EMPRESA — solo GRUPO HORIZONTE SRL (`be4119b0`) tiene recursos (652 empleados, 377 vehiculos); las otras 3 empresas (La Nueva gh 1, Empresa 2, InfinityBrozz) estan vacias (0 recursos, 0 tipos); los `document_types` son globales (`company_id NULL`) o de GH. Por eso la reconciliacion aplica a TODOS los recursos sin filtrar por empresa (el filtro por company_id solo agregaria complejidad para empresas que nunca tendran recursos). La reparacion de datos (des-archivar los que hoy cumplen) va EMBEBIDA en la migracion para que el deploy corrija prod. Extiende [[archivado docs por cambio de funcion]] y [[config document_types cliente]].

### Toda modificación exige analizar el IMPACTO en lo vinculado — nunca tratar una entidad como aislada

Antes de implementar cualquier cambio (edición, alta, baja, integración), **mapear las relaciones y el flujo real de la funcionalidad** y determinar qué MÁS se ve afectado. Una entidad casi nunca vive sola: modificarla suele tener consecuencias en otras tablas, módulos, cálculos o estados derivados.

**Ejemplo del criterio** (no existe en este proyecto, ilustra la idea): en un módulo de stock, editar una _solicitud de materiales_ — agregar o quitar materiales — no es solo actualizar la solicitud: **impacta el stock** (reservas, disponibilidad, movimientos). Implementar solo el UPDATE de la solicitud dejaría el stock inconsistente.

**Cómo aplicarlo:**

1. **Antes de codear**: leer bien la funcionalidad y sus relaciones (schema Prisma, FKs, tablas pivote, triggers SQL, server actions que tocan lo mismo, cálculos de estado/status, alertas, estadísticas, exportaciones, PDFs).
2. **Listar los efectos colaterales** que el cambio debería producir para que el flujo quede correcto y consistente.
3. **Si hay duda sobre si algo DEBE verse afectado o no, PREGUNTAR al usuario** antes de implementar. No asumir ni por exceso (tocar de más) ni por defecto (dejar datos inconsistentes).
4. **Al reportar**, explicitar qué se tocó y qué quedó deliberadamente afuera.

Casos típicos en este proyecto donde esto aplica: documentos ↔ alertas/status del recurso ↔ triggers SQL; recursos dados de baja ↔ documentación de egreso; asignaciones M:M (contratistas, aptitudes, clientes) ↔ re-evaluación de qué documentos aplican; cambios en DataTables ↔ filtros + facets + export + sorting + permisos. Extiende [[cambiar guardas/triggers row-level]].

### Mensajes de commit: SOLO la línea de asunto, sin cuerpo

Un commit se describe con **una sola línea** en formato conventional commit. **NUNCA** agregar cuerpo, bullets, explicaciones, detalle de archivos ni justificaciones. Si el cambio parece necesitar más explicación, esa explicación va en el PR o en la conversación, no en el commit.

```bash
# ✅ CORRECTO — una línea y nada más
git commit -m "feat(dashboard): 516 - agregar subtipo y propietario al reporte de vencimientos de equipos"

# ❌ INCORRECTO — cuerpo con detalle
git commit -m "feat(dashboard): 516 - agregar subtipo y propietario

- Se suman las columnas X e Y
- Los filtros viven en la relación vehicles
- ..."
```

Aplica a TODOS los commits, sin importar el tamaño del cambio. Formato: `tipo(scope): <nro ticket si aplica> - descripción breve`. Ver también las reglas de `git-rules.md` (conventional commits, cero atribución a herramientas, nunca commitear sin pedido explícito).

### Implementación: usar `/feature-dev:feature-dev`, no las skills de superpowers

Para **implementar** una feature, el flujo preferido del usuario es la skill `feature-dev:feature-dev` (discovery → exploración con agentes → preguntas → arquitectura → implementación → review), **no** `superpowers:writing-plans` / `superpowers:executing-plans` / `superpowers:subagent-driven-development`.

`superpowers:brainstorming` sigue siendo válido para la etapa previa de exploración de la idea y definición de alcance; el cambio aplica al momento de pasar a construir.

### Schemas Zod compartidos server/client: NUNCA definirlos en un archivo `'use client'`

Si una server action importa un schema Zod que vive en un archivo con `'use client'`, Next entrega ese módulo como **referencia de cliente** y el objeto Zod no existe en el servidor: falla en runtime con `X.parse is not a function`. **No lo detecta `npm run check-types`** (los tipos resuelven perfecto) — solo aparece al ejecutar el flujo real.

Regla: los schemas Zod que se usan de los dos lados van en un módulo **sin directiva** (ej. `features/{X}/schemas/*.ts`); el componente de cliente los importa de ahí (y puede re-exportarlos para no romper imports existentes, pero **el consumidor server debe importar del módulo de schemas, no del componente**). Mismo criterio que [[funciones SQL void con executeRaw]]: tras conectar un módulo nuevo entre server y client, **probar el flujo de UI real**, no alcanza con que compile. Bug encontrado en el 505 (`employeeFormSchema` definido en `employee-form.tsx`, importado por `approvePreEmployee`).

### Obligatoriedad de campos: la define el TICKET, no la conveniencia de implementación

Si las notas del ticket especifican que una sección de datos va **completa** (ej. ticket 505: "Datos personales => completo, Datos de Contacto => completo, Datos Laboral => Sector y Puesto Propuestos (solo estos campos)"), esa obligatoriedad es **requisito**, no sugerencia. NO relajarla a `nullable`/opcional porque una decisión de UX (guardado parcial, borrador, wizard por pasos) lo haría más cómodo de implementar.

Cuando una decisión de UX entra en conflicto con una especificación explícita del ticket, **plantear la contradicción al usuario y dejar que él la resuelva** — nunca resolverla unilateralmente en el diseño y menos aún sin mencionarlo. Ojo con el detalle del enunciado: en el 505 el "ir cargando" del pedido original se refiere a **los documentos** ("que julia pueda ir cargando del personal que esta en proceso de ingreso **sus documentos**"), no a los datos personales — leer QUÉ es lo que se carga progresivamente antes de asumir que todo el formulario es un borrador.

Regla práctica al modelar una entidad espejo de otra (pre legajo ↔ empleado): **espejar EXACTAMENTE la nullability de la tabla original** — ni relajar ni endurecer. Si en `employees` la columna es NOT NULL, en la tabla espejo también; si en `employees` admite NULL (`gender`, `email`, `city`, `postal_code`, `born_date`, `document_type`, `nationality`, `marital_status`, `level_of_education`, `picture`…), en la espejo también, **aunque el formulario los exija a todos**. En este proyecto la capa Zod es deliberadamente más estricta que la BD: la obligatoriedad "de negocio" vive en el schema del form, no en el DDL. No "mejorar" el modelo poniendo NOT NULL donde el original no lo tiene. Extiende [[analizar impacto en lo vinculado]].

### Todo `<Button>` dentro de un `<form>` que NO guarda lleva `type="button"`

El `Button` de shadcn (`src/components/ui/button.tsx`) **no fija `type`**, así que dentro de un `<form>` el default del HTML es `type="submit"`: cualquier botón de acción (ver, subir, eliminar, abrir modal, agregar fila) **dispara el submit del formulario** además de su propio `onClick`. El síntoma no se parece a la causa — se ve como "la acción X ejecuta la mutación del form" (bug del 505: tocar "Ver" un documento en la tab Documentos del pre legajo ejecutaba `updatePreEmployee` y tiraba _"El pre legajo ya fue convertido en legajo y no se puede modificar"_).

Regla: al meter cualquier sección interactiva dentro de un `<form>` (tabs, listados, checklists, acciones inline), **todos** sus botones llevan `type="button"` explícito. Excepción: los envueltos por un trigger de Radix con `asChild` (`PopoverTrigger`, `DialogTrigger`, `DropdownMenuTrigger`) — Radix ya inyecta `type="button"`.

Complemento (defensa en profundidad): el handler de submit debe cortar temprano si el estado no admite edición (`if (!canEditData) return;`). Un `<fieldset disabled>` NO alcanza: solo cubre los controles que envuelve, y no impide que un botón fuera de él submitee. Y `check-types` no detecta nada de esto — se ve solo probando el flujo real de UI. Extiende [[analizar impacto en lo vinculado]].

### NUNCA aplicar una migración a dev antes de que el usuario valide el alcance

Aplicar una migración a dev **no es "ir adelantando trabajo"**: dev es el entorno donde el usuario está probando la app en ese mismo momento. En el 546 diseñé y apliqué una migración (rename de tabla, enum de categorías, backfill, `DROP COLUMN`) mientras el usuario usaba el sistema: la ficha de otros equipos dejó de cargar, el usuario intentó subir un documento y falló con un `404` de tabla inexistente, y hubo que revertir todo.

Reglas:

1. **La migración se escribe, se muestra, y se aplica recién con el OK explícito.** El paso `prisma db execute` no se ejecuta "para avanzar". _Actualización 2026-09-11: el usuario autorizó en forma permanente aplicar en DEV ("todas las migraciones en dev las puedes aplicar sin problemas") las migraciones cuyo alcance ya está validado; lo que sigue exigiendo mostrar primero es un diseño no validado. PROD nunca._
2. **Antes de diseñar esquema, buscar si la capacidad YA existe y solo está mal nombrada o mal ubicada.** El 546 ("necesito adjuntar documentos a las piletas") se resolvió renombrando el label de una tab que ya hacía exactamente eso. El camino más corto suele ser texto, no DDL.
3. **Si el usuario dice "es simple" o "no requiere migraciones", eso es un dato de alcance, no una subestimación a corregir.** Ajustar la solución hacia abajo, no defender el diseño grande.
4. Si hay que revertir: reconstruir el estado original consultando **PROD** los valores que la migración pisó (`tabs.name`, `description`, `role_permissions`), no adivinarlos. Y borrar la fila de `_prisma_migrations` para dejar el historial limpio.

Extiende [[analizar impacto en lo vinculado]] — el impacto también incluye el entorno de trabajo del usuario, no solo las tablas.

### Mandar un fix aislado a `main` cuando `dev` tiene trabajo sin liberar

`dev` suele acumular features que todavía no deben salir. Si el usuario pide mandar un fix puntual a `main`, **NO** abrir un PR `dev` → `main`: arrastra todo lo pendiente.

Flujo correcto: `git switch -c fix/<ticket>-<desc> origin/main` → `git cherry-pick <commit>` → push de esa rama → PR de esa rama a `main`. Verificar SIEMPRE con `gh pr view <n> --json files` (contra GitHub, no contra la copia local) que el PR contenga solo los archivos esperados.

Ojo con el orden de las migraciones: un fix con timestamp posterior que llega a `main` antes que las migraciones más viejas de `dev` se aplica primero. No rompe nada si es independiente (Prisma aplica todas las pendientes), pero hay que verificar que no dependa de las que quedaron atrás.

### Cambios en componentes compartidos: el mecanismo va al shared, la activación es opt-in

Cuando un ticket pide cambiar el comportamiento de UNA pantalla pero la implementación vive en un componente compartido (`DataTable`, forms genéricos, helpers de `shared/`), el mecanismo se escribe en el shared **pero se activa con un flag opt-in** (`persistViewPreferences={true}` en el 547) y se conecta SOLO en la tabla/pantalla del ticket. Habilitar el comportamiento nuevo para todo el sistema "de paso" toca pantallas que nadie pidió revisar, no se puede validar entero, y las regresiones aparecen lejos del ticket.

Práctica: props opcionales + booleana con default `false`, conectar la pantalla del ticket, documentar en el `DOCS.md` del componente cómo se engancha el resto, y al reportar decir explícitamente qué quedó afuera. Si el cambio compartido no admite opt-in y altera a todos, preguntar ANTES de escribirlo. Extiende [[analizar impacto en lo vinculado]].

### Si el usuario reporta "hicimos todo bien y no pasó nada", buscar el fallo SILENCIOSO en la rama de éxito

Ante un bug reportado por un usuario final, la primera hipótesis tentadora suele ser "no completaron el flujo" (cerraron el modal, no guardaron, se fueron de la página). **Es la hipótesis que culpa al operador y casi siempre es la equivocada.** Cuando el reporte dice explícitamente que cargaron todo correctamente, hay que tomarlo como dato duro y buscar el punto donde el sistema **falla mostrando éxito**.

Señales de que estás ante un fallo silencioso: el código tiene una rama tipo `if (yaExiste) { actualizar } else { crear }`, y el toast dice "guardado correctamente" en las dos. Ahí la rama de "actualizar" puede no hacer nada útil y el usuario nunca se entera.

**Cómo distinguir empíricamente** una hipótesis de la otra: buscar el **predictor** en los datos. En el 570 comparé los checklists que fallaron contra los que funcionaron: 92% de los fallidos tenían una solicitud previa sin procesar en ese equipo, contra 35% de los exitosos. Ese contraste descartó "no completaron el modal" y señaló la causa real. Un conteo de casos rotos, solo, no prueba nada; el **grupo de control** (los que sí funcionaron) es lo que convierte una corazonada en diagnóstico.

Corolario de UI: **un mensaje de éxito debe reflejar lo que realmente ocurrió**, con números (`Se registraron N desvíos en M solicitudes`). Un toast genérico convierte un bug en un reporte de "el sistema anda mal" seis meses después.

### Modales de dos pasos: el paso 2 no puede ser el que da vida al registro

Si un formulario guarda su entidad principal y **después** abre un modal que crea la entidad dependiente (la que la hace visible/procesable en el circuito), todo lo que interrumpa ese segundo paso deja huérfano el dato. Peor si además el modal se llena con datos de **todo el recurso** en vez de los de la operación en curso: ahí no solo puede quedar huérfano, sino que mezcla contextos y toma decisiones sobre registros que no son los de esta operación.

Reglas: (1) el modal posterior recibe SIEMPRE el id del registro recién creado y opera solo sobre él; (2) al crear una entidad hija que referencia un padre único (`checklist_answer_id` en `maintenance_requests`), agrupar por ese padre — nunca meter hijos de varios padres en un registro que solo puede apuntar a uno; (3) nunca reutilizar/mutar un registro en estado cerrado (`approved`) para colgarle datos nuevos: crear uno nuevo. Extiende [[analizar impacto en lo vinculado]].

### Textos que los usuarios vienen usando hace años: cambio mínimo y con precedente del propio documento

Al digitalizar un formulario en papel, la tentación es "mejorar" la redacción. **No**: el operario lleva años leyendo esos enunciados y cualquier cambio le cuesta. Regla: reformular **solo** los ítems que lo necesitan por una razón técnica concreta, y dejar el resto textual.

En el 554, de 28 ítems solo **6** tenían polaridad invertida (preguntas de defecto tipo _"¿Presenta rajaduras?"_, donde responder SÍ significa que el equipo está MAL, mientras el sistema interpreta `M` = malo y copia el label al desvío). Los otros 22 se cargaron palabra por palabra.

Y para esos 6, la redacción **no se inventa**: se busca el precedente dentro del mismo documento. El RO 06-1 ya usaba la fórmula _"Ausencia de…"_ en ESTABILIZADORES, NEUMÁTICOS y CHASIS — o sea, el propio formulario ya resolvía el problema en otras filas. Usar su vocabulario evita el rechazo que produce un texto ajeno.

Complemento obligatorio: **el texto original nunca se pierde**. Va a `checklist_template_items.description` y se muestra en pantalla bajo la pregunta ("Formulario RO 06-1: …"), que sirve de trazabilidad ante una auditoría de HSE y de puente para el que busca la fila del papel.

### Al verificar en browser: un control tapado por un toast parece un bug de datos

Perseguí durante varias iteraciones un supuesto bug de "el valor del select no llega a React Hook Form", con evidencia aparentemente sólida (el combo mostraba el valor y el contador de errores no bajaba). La causa real era que **el botón que dispara el autorrelleno estaba debajo del toast** (`fixed bottom-16` contra `bottom-4`) y el click iba al toast, así que el autorrelleno nunca corría y el contador no tenía por qué cambiar.

Antes de concluir que hay un bug de estado, **instrumentar y mirar el dato crudo**: un `logger.debug` con `Object.keys(errors)` resolvió en un intento lo que tres screenshots no habían podido. Y ante síntomas raros de UI, sospechar primero de superposición de elementos (`fixed`, toasts, modales) y del estado del dev server —Turbopack puede quedar corrupto tras un HMR fallido y renderizar páginas vacías— antes que del código recién escrito.

### Digitalizar un documento: no recortar secciones del original por criterio propio

Al llevar un formulario en papel al sistema, **todo lo que el documento oficial trae forma parte del entregable**, incluidas las secciones que "parecen" accesorias. En el 554 decidí por mi cuenta no incluir el diagrama de partes en el PDF generado, argumentando que el PDF es el registro de una inspección ya hecha y el dibujo solo sirve al operario mientras completa. El usuario lo reclamó: el RO 06-1 lo lleva, el nuestro también.

Regla: si el documento fuente tiene una sección, va — y si hay una razón real para dejarla afuera, se **plantea antes**, no se resuelve en silencio. Al reportar, enumerar explícitamente qué partes del original quedaron sin replicar (en el 554: "OTRAS CONSIDERACIONES" y el bloque de firmas extendido). Extiende [[textos que los usuarios vienen usando hace años]].

Detalle técnico del mismo caso, útil para cualquier imagen en `@react-pdf/renderer`: **un PNG con canal alpha se maqueta mal** — react-pdf le calcula una proporción equivocada, estira el dibujo y reserva altura de más, dejando un hueco. La solución es una variante **JPEG aplanada sobre fondo blanco** con `width`/`height` fijos **en puntos** (los porcentajes lo estiran para llenar la fila). El PNG transparente se conserva aparte para la pantalla, donde hace falta para `dark:invert`. Y para inspeccionar un PDF generado: rasterizarlo con `mupdf` (WASM, `npm i mupdf`, sin binarios nativos) y mirar el PNG — pelear con el visor de Chrome vía CDP es una pérdida de tiempo (congela la pestaña y no respeta `#zoom`).

### `created_at` NO es fecha de alta si el código hace delete+insert — validar toda reconstrucción histórica contra una fuente externa

Al reconstruir un dato histórico que la BD no versiona, la tentación es usar `created_at` de la fila como "fecha en que empezó a existir". **Es falso en cualquier tabla pivote que el código reescriba entera.** En el 578 usé `contractor_employee.created_at` para saber si un empleado estaba afectado a un cliente en la fecha del parte; pero editar un empleado (o un cliente) hace `deleteMany()` + `createMany()` de TODAS sus afectaciones, así que `created_at` es la fecha de la última edición. Resultado: el backfill inventó 136 desvíos para un día que tuvo 46.

**Antes de confiar en una reconstrucción, contrastarla contra una fuente externa al sistema** (mails enviados, PDFs, export del cliente). Sin los correos del reporte nocturno, el error se habría deployado con aspecto de dato correcto — `check-types` pasa, la query corre, los números son verosímiles. Bastaron 5 fechas para detectarlo. Y verificar la **dirección** del error, no solo su magnitud: yo predije que subestimaría y sobreestimaba 3x.

**Criterio para saber qué es reconstruible:** un dato es recuperable solo si depende de tablas inmutables. Si depende de una tabla maestra que el propio proceso corrige (afectaciones, diagramas, condición del equipo), NO lo es — y menos aún cuando el reporte existe justamente para que la corrijan: reportado el error, lo arreglan, y la base deja de tener rastro de que ocurrió. En el 578 solo los duplicados sobrevivieron (dependen del parte, que es inmutable): coincidieron 10/10 contra los mails, mientras los otros 5 componentes eran irrecuperables por diseño del circuito.

**Ante un dato no medible, va `NULL`, nunca `0`.** Cero significa "medí y no hubo"; null significa "no hay medición". Un 0 inventado se lee como buena noticia. Mismo criterio que [[estado vacío que afirma la buena noticia]].

### Estado vacío: verificar CUÁNDO se dispara antes de redactarlo

Un empty state que dice "No hay desvíos registrados" parece correcto hasta que se verifica en qué caso aparece. Si el snapshot se escribe también los días sin novedad, "cero" se dibuja como serie plana y **el empty state solo aparece cuando NO hay datos cargados** — o sea, afirma la buena noticia justo cuando falló la carga. Regla: rastrear en el código/SQL qué condición exacta deja la lista vacía, y redactar para ESE caso. Si además existe el caso "hubo actividad y dio cero", ese sí se informa aparte y **con denominador** ("sin desvíos en N días con parte cerrado"), nunca con un adjetivo. Extiende [[no culpar al operador: buscar el fallo silencioso]].

### Paletas de gráficos: medir la separación de color, no elegir a ojo

Cinco series con hues a 5–10° de distancia son **el mismo color** en pantalla, aunque en el editor los valores se vean distintos. En el 578 dos pares daban ΔE de 6.1 y 7.5 (el piso para visión normal es 15) y la línea de meta verde era indistinguible de una serie en deuteranopía. Regla: al definir una paleta de N series, medir la diferencia perceptual de **todos los pares** en modo claro y oscuro, y para visión normal y CVD — el agente `ui-skills` tiene un validador ejecutable. Además, los colores van como tokens por tema (`theme: {light, dark}`) declarados en un ancestro común, no hardcodeados: los KPI que hacen de leyenda viven fuera del `ChartContainer` y no ven las variables que inyecta shadcn.

### Un cambio que "depende" de trabajo sin liberar casi siempre puede independizarse

Ante el pedido de llevar a `main` un ajuste construido sobre una feature que todavía vive solo en `dev`, mi primera lectura fue "es imposible: el fix renombra una tab que en main no existe". El usuario insistió, y tenía razón: el cambio **se independiza** creando la entidad desde cero en `main` en lugar de renombrar la de `dev`, con **una migración idempotente que converge en los dos entornos**:

```sql
INSERT INTO tabs (id, ...) VALUES ('...034', 'slug', 'Nombre nuevo', ...)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
```

En prod la crea; en dev, donde la fila ya existe por la migración de la feature, solo le corrige el nombre. Manteniendo el **mismo `tab_id` y el mismo slug** en ambas ramas, la migración vieja que después llegue a `main` (con timestamp anterior y `ON CONFLICT DO NOTHING`) se vuelve un no-op y no pisa nada.

Flujo: rama desde `origin/main` con la versión autónoma → PR a `main`; después una segunda rama desde `origin/dev` que mergea la primera y resuelve los conflictos integrando lo de la feature (mover la carpeta, unificar la tab, un solo TabContent). Verificar SIEMPRE con `gh pr view <n> --json files` que el PR a main no arrastre archivos de la feature. Extiende [[mandar un fix aislado a main]].

**Antes de declarar algo imposible por dependencias entre ramas, preguntarse qué parte del cambio es realmente autónoma y si el DDL puede escribirse para converger.**

### El alcance lo define el ticket + la reunión grabada: si no se dice, NO se toca

Regla del usuario, absoluta: **solo se modifica lo que el ticket o el video de la reunión dicen que hay que modificar.** Si algo no se menciona en ninguno de los dos, queda tal cual — aunque quede inconsistente con lo que sí se cambió, aunque "de paso" parezca una mejora obvia, aunque use un patrón deprecado.

En el 594 esto aplicó dos veces: la pantalla **Equipos → Mantenimiento** (`EquiposComponent` → `RepairTypes` → `OperacionesTabContent`) monta un pipeline viejo con su propia tabla "Para Taller" y `BaseDataTable` (sistema deprecado); como el video solo habla del módulo Mantenimiento, no se tocó. Y la tabla de Seguimiento usa el patrón **bulk** de facets (`getXxxFacets` + `externalCounts`), deprecado a favor de `fetchFacet` lazy-load: se respetó el patrón existente en vez de migrarla.

**Cuando aparezca una duda de alcance y exista un video de la reunión, la respuesta está ahí — hay que buscarla, no resolverla por criterio propio ni preguntar de entrada.** Pero **"exista" lo dice el usuario, no yo**: no salir a rastrear `CodeControl\_reuniones` ni otras carpetas por iniciativa propia para ver si hay un video del ticket. En el 727 lo hice (y además me cambié de directorio de trabajo con un `cd` que quedó persistido) y el usuario lo cortó: _"no hay, si llega a haber yo te aviso"_. Si el ticket no trae análisis y el usuario no mencionó reunión, el alcance sale del texto del ticket y lo que quede abierto se pregunta. Cómo buscarla bien, cuando el usuario indica que hay video:

1. **Barrido de keywords sobre el transcript completo** (`elimin|borr|sacar|volar|desaparec|limpi|queda|dejar` + el nombre de la pantalla), no solo del tramo que uno cree relevante.
2. **Re-transcribir el tramo dudoso con `whisper-large-v3`** (no el turbo) pasando `language=es`, `temperature=0` y un `prompt` con la jerga del dominio. La diferencia es enorme: el turbo devolvió _"pendiente de ingresos de ayer"_ y _"que no ocurre a mí"_ donde en realidad decía _"pendiente de ingreso a taller"_ y _"se me ocurre a mí"_.
3. **Mirar los frames de esos segundos exactos** con `--timestamps`: qué señala el mouse, qué pantalla está abierta, y sobre todo **qué está escribiendo en el ticket**. En el 594 la prueba decisiva fue ver que borraba su propia objeción (_"no lo veo recomendable por ahora"_) y la reemplazaba por la instrucción contraria. Una decisión puede revertirse dentro del mismo video: no alcanza con la primera frase que uno encuentra.

Corolario sobre **borrar código**: el video decide sobre _pantallas_, no sobre archivos. Pero si al sacar algo de la UI el código queda sin ningún consumidor, **se borra** (el usuario lo autorizó explícitamente) — nunca sin antes mapear los importadores reales con grep, porque puede haber una pantalla viva colgando de ahí. Extiende [[analizar impacto en lo vinculado]] y [[cambios en componentes compartidos: opt-in]].

### Una funcionalidad nueva HEREDA el comportamiento del flujo donde se inserta

Al agregar un camino nuevo dentro de un flujo existente, el default es **replicar las reglas que ya rigen ese flujo**, no diseñar reglas propias. Si el sistema hoy auto-aprueba cuando quien carga es el supervisor, el camino nuevo también auto-aprueba. Cambiar eso es **cambiar el flujo**, y eso solo se hace si el ticket o el video lo piden.

En el 592 hice que la "Carga Manual" pasara siempre por validación de Operaciones, razonando por mi cuenta que un pedido sin checklist que lo respalde merecía más control. El usuario lo cortó en seco: _"aquí no vinimos a cambiar flujos"_. Aunque el razonamiento sea defendible, introduce una asimetría que nadie pidió y que el usuario tiene que descubrir probando.

**Señal de alerta**: si estoy por escribir en un comentario o en un reporte una justificación del tipo _"lo hice así porque me pareció más prudente"_ sobre una regla de negocio, es que estoy decidiendo algo que no me toca. La pregunta correcta no es _"¿qué comportamiento es mejor?"_ sino _"¿qué hace hoy el flujo del que esto forma parte?"_.

Corolario técnico: heredar el comportamiento suele ser MÁS trabajo, no menos (en el 592 obligó a crear también la orden y sus items, mapeando el texto libre a la descripción para que el taller no viera un ítem en blanco). Ese trabajo extra es parte del ticket, no una razón para simplificar el comportamiento. Extiende [[alcance: lo fija el ticket + el video]].

### Mutaciones M:M: enviar altas y bajas EXPLÍCITAS, nunca "borrar todo e insertar lo nuevo"

Al actualizar una relación M:M (afectaciones cliente↔empleado/equipo, aptitudes, sectores de taller), **nunca** mandar el conjunto final para que el servidor borre por diferencia, ni hacer `deleteMany()` + `createMany()` de todo. Se envían **los ids explícitos**: si hay que quitar uno, va el id de ese; si hay que agregar dos, van esos dos. **La ausencia de un id no significa nada** — jamás debe implicar borrado.

El 26/08/2026 un solo guardado en Comercial → Clientes → Empleados borró **149 afectaciones** de Vista Oil. El modal calculaba la preselección desde el estado de la pantalla (tres `setEmployees` asincrónicos compitiendo entre sí) y el botón "Cargar empleados" no estaba bloqueado durante la carga: se abrió con el combo vacío, el operador tildó un empleado y el servidor leyó "los otros 260 ya no están en la lista" = borrarlos. Y el toast dijo _"Empleados asignados correctamente"_ porque la server action capturaba el error y lo **devolvía** en vez de lanzarlo, así que el `catch` del cliente nunca corría.

**Cómo se implementa** (referencia: `updateCustomerEmployeeAssignments` en `src/features/Empresa/Clientes/actions.ts`):

1. Server action con firma `updateXxx(parentId, { add: string[], remove: string[] })`; el `DELETE` va acotado a `parent_id = X AND child_id IN (remove)` y el `INSERT` solo a `add`, todo en una `$transaction`. Retorna `{ added, removed }` reales.
2. El baseline se lee **de la base al abrir el modal** (query directa a la pivote), nunca del estado de la pantalla. Sin baseline cargado **no se puede guardar**: combo deshabilitado con spinner y submit bloqueado.
3. Mostrar el delta **antes** de confirmar ("N afectados actualmente. Se agregan X. Se quitan Y." — las bajas en rojo) y el toast con los números que devolvió el servidor.
4. Un reemplazo total solo es aceptable si el formulario se renderiza **desde el servidor** con el estado real y acotado a UNA entidad (ej. `allocated_to` en el legajo del empleado, que sale de `employee.contractor_employee` en el mismo request): ahí no hay carrera posible.

Ojo adicional: `contractor_employee` no tiene triggers de auditoría ni historial, y el proyecto **no tiene PITR** (`archive_mode = off` en prod). Un borrado masivo en una pivote es irrecuperable salvo por el backup diario de Supabase o por el clon de dev. Extiende [[no culpar al operador: buscar el fallo silencioso]] y [[created_at no es fecha de alta si el código hace delete+insert]].

### Cambiar un trigger que escribe texto: verificarlo con un evento NUEVO, no mirando el historial

Al reemplazar un texto hardcodeado dentro de un trigger de Postgres, `pg_get_functiondef` confirma que la **función** cambió, pero eso NO prueba que la UI muestre el texto nuevo: las filas ya escritas conservan el texto viejo materializado en su columna. Abrir el historial de un registro existente y ver la frase anterior parece un fix que falló, y no lo es.

La verificación correcta es **provocar un evento nuevo desde la UI** (en el 596: planificar un pedido para disparar `date_confirmed`) y leer la fila recién insertada. Además, hay que **decirle al usuario que los registros anteriores siguen mostrando el texto viejo** y dejarle a él la decisión de reescribirlos — es su dato histórico, no una decisión de implementación. En el 596 quedaron 894 filas con "Fecha aprobada por operaciones", incluidas las de los pedidos de prueba de la demo, que es justo donde el usuario iba a mirar.

### "¿Lo verificaste?" es la señal de que reporté terminado demasiado pronto

Correr `check-types`, consultar la BD y leer el diff **no es haber verificado una feature de UI**. En esta sesión reporté los cambios como listos y el usuario tuvo que preguntar "¿las subiste y las verificaste?": faltaba la pasada por el navegador, que es donde aparecieron los bugs de las sesiones anteriores (las 2 fotos que se perdían, el `commitPendingDraft` incompleto) — ninguno de los dos lo habría detectado el compilador.

Regla: mientras falte la prueba en la app real, el estado se reporta como **"subido, verificación visual pendiente"**, nunca como "listo". Y al verificar, medir en el DOM (`getBoundingClientRect`, opacidad efectiva de los ancestros, cantidad de `<img>`) en vez de mirar un screenshot: el screenshot no distingue "0 fotos" de "fotos que no scrollée hasta ver", ni un modal que desborda de uno que scrollea. Extiende [[no culpar al operador: buscar el fallo silencioso]].

### Antes de inventar un mapa visual (colores, iconos, labels), buscar el precedente en el módulo

Al crear `RequestItemComments` definí mi propio mapa de colores por rol: chofer azul, supervisor ámbar. El módulo ya tenía uno — `commentStyleConfig` en `ItemComments.tsx`, que consumen 8 diálogos — y ahí es **al revés**: chofer ámbar + icono `Truck`, supervisor/validador azul + `ClipboardList`. Resultado: el mismo comentario del mismo chofer cambiaba de color según la pantalla desde la que se lo mirara.

El error no fue elegir mal los colores, fue **no preguntarme si ya existían**. Regla: ante cualquier convención visual (color por estado/rol, icono por tipo, label de enum), grepear primero por el concepto en el módulo; si hay un mapa, **importarlo**, no replicarlo. Un mapa duplicado no se detecta con `check-types` ni en la pantalla que estás mirando: se ve recién cuando alguien compara dos pantallas.

Corolario: si el mapa existente no encaja del todo, se extiende el compartido — nunca se crea uno paralelo.

### Tailwind v4: una clase construida en runtime NO existe

`config.color.replace('text-', 'border-')` parece elegante y es un bug silencioso: Tailwind v4 escanea el código **como texto plano**, así que solo emite las clases que aparecen escritas completas en algún archivo. En `ActivityHistoryModal` esto dejaba sin borde a 5 de las 11 familias del timeline (`red`, `purple`, `indigo`, `cyan`, `emerald`) — las que no figuraban literales en ningún otro `src/`. Las otras 6 funcionaban **por accidente**, porque otro archivo las usaba.

Por eso el síntoma es tan raro: algunos círculos con color y otros neutros, sin patrón. No lo detecta `check-types`, no hay warning, y en dev con caché caliente puede verse distinto que en prod.

Regla: las clases de Tailwind van **escritas completas**, en un `Record<string, string>` si hace falta variar. Nada de `replace()`, template literals con fragmentos, ni concatenación. Para verificar si una clase existe de verdad: `grep -r "border-purple-600" src/` — cero resultados significa que no se genera.

### Un aviso dentro de una lista con `max-h` no lo ve nadie

Puse el "Mostrando 50 de 387" al final del `CommandGroup`, dentro de un `CommandList` con `max-h-[300px]` que muestra ~6 filas: quedaba 44 filas más abajo. Yo mismo, verificando en el navegador, tuve que scrollear 20 ticks para encontrarlo — y no saqué la conclusión de que si a mí me costó, al usuario no le va a aparecer nunca.

Regla: un aviso sobre el **contenido de una lista** va fuera del área scrolleable (arriba, junto al buscador, o `sticky bottom-0`). Y si mientras verificás tenés que scrollear para ver algo que debería ser evidente, ese es el hallazgo, no un paso más de la verificación.

Complemento: los contadores que cambian mientras se tipea llevan `tabular-nums` (si no, los números saltan de ancho), el conteo lleva el sustantivo ("50 de 387 **equipos**"), y si el aviso tiene que anunciarse a lectores de pantalla, la región `role="status"` debe existir **siempre** en el DOM — una que se monta y desmonta no dispara el anuncio.

### Entorno: el dev server de este proyecto no arranca con Turbopack

`npm run dev` falla con `Turbopack Error: create symlink to ../../../node_modules/pg` (panic de Turbopack, la página queda en "An unexpected Turbopack error occurred"). Es del entorno, no del código: Windows sin modo desarrollador no permite crear symlinks, y el proyecto vive en OneDrive.

**Levantarlo con `npx next dev --webpack`.** Arranca en 3s y funciona igual para verificar UI.

Y **no borrar `.next` "para limpiar"**: mientras los symlinks ya existen, Turbopack anda; borrarlos obliga a recrearlos y ahí rompe. Yo lo borré ante un error de HMR y pasé de "una pantalla con error" a "no compila nada". Si hay que reiniciar el server, matar el proceso alcanza. Ojo también con el lock: `.next/dev/lock` queda tomado si el proceso anterior no murió (`Unable to acquire lock`).

### No preguntar lo que el pedido ya respondió, y verificar la fuente externa ANTES de proponer usarla

Dos errores en la misma tanda de preguntas del ticket de desvíos de "otros equipos":

1. **Pregunté cosas que el propio pedido ya había contestado.** El usuario había escrito "agregar la lógica necesaria en todos lados que se necesite" y "muestralo como me dijiste" — o sea, ya había aceptado la propuesta de presentación y el alcance. Volver a ofrecerlas como opciones lo obliga a repetirse. Antes de armar un `AskUserQuestion`, releer el pedido y sacar todo lo que ya esté decidido ahí: quedan solo las decisiones que el texto del usuario no cubre (en ese caso eran dos, no cuatro).

2. **Ofrecí cargar histórico desde una fuente externa sin haber verificado que aportara algo.** El usuario propuso sacar los mails de Thunderbird; al mirar el mbox, los 192 mails cubrían **exactamente** el rango 2026-02-05 → 2026-08-18 que la migración del 578 ya había cargado, y no había ninguno anterior. El trabajo habría sido cero. La verificación (localizar el archivo, contar los mails, comparar el rango contra lo que ya está en la BD) cuesta minutos y tiene que ir **antes** de plantear el plan, no después.

**Cómo aplicarlo:** cuando el usuario propone una fuente de datos externa (una casilla de correo, un export, un PDF), primero medir qué cubre y contrastarlo con lo que ya está cargado; recién entonces proponer qué hacer con ella. Y al preguntar, que cada pregunta sea sobre algo genuinamente abierto.

### Agregar o modificar un trigger: auditar el grafo completo y MEDIR antes de escribirlo

Un trigger nuevo no se agrega "porque falta". Antes hay que mapear el grafo completo de disparos de las tablas involucradas y medir el costo, porque el riesgo no está donde parece. En el 712 iba a agregar un `AFTER DELETE` sobre `documents_employees` y el usuario me frenó: _"los triggers pueden afectar negativamente muchas cosas, auto llamados en bucle, muchas ejecuciones sin querer, problemas en otras funcionalidades"_. Tenía razón y la auditoría cambió el diseño.

**Qué verificar, en este orden:**

1. **Ciclos**: qué escribe la función del trigger, y si esa escritura puede volver a disparar algo que toque la tabla original. Se verifica sobre la BASE VIVA (`pg_trigger` + `pg_get_functiondef`), no sobre las migraciones — puede haber triggers viejos sin dropear. En este proyecto la protección es la guarda `WHEN` con lista explícita de columnas: `status` no está en la de `controlar_alertas_employees`/`_vehicles`, y por eso escribir `status` no reabre la cadena. Hay además un flag de sesión (`myapp.inside_controlar_alertas`) como segunda barrera.
2. **Cuántas veces se dispara de verdad**: un trigger **statement-level se dispara aunque la sentencia afecte 0 filas**. Si hay un `DELETE`/`UPDATE` dentro de un `FOR ... LOOP` de plpgsql, son N disparos por recurso (en el 712: 40 tipos obligatorios de Persona → ~80 sentencias por empleado → ~10.400 disparos al afectar 260 empleados a un cliente).
3. **Medir antes y después, y con/sin el trigger**: la medición base (`clock_timestamp() - statement_timestamp()` sobre el flujo real, no `EXPLAIN` de una query aislada) es lo que convierte la discusión en datos. Para aislar el costo del trigger: `BEGIN; ALTER TABLE x DISABLE TRIGGER y; ...medir...; ROLLBACK;` alternando corridas.

**Mitigar en el diseño, no aceptar la carga:** (a) early-return en la función del trigger (`SELECT array_agg(...) INTO ids FROM affected_rows; IF ids IS NULL THEN RETURN NULL;`) para que los disparos vacíos cuesten nada; (b) que el `UPDATE` solo escriba lo que cambia (`WHERE t.col IS DISTINCT FROM calc.nuevo`), así un recálculo redundante no genera WAL ni despierta otros triggers; (c) sacar las escrituras de dentro del loop — que el loop solo CLASIFIQUE en arrays (`v_archivar`, `v_desarchivar`, …) y las sentencias se ejecuten agrupadas al final. En el 712 eso bajó de 80 sentencias a 4 por recurso y el flujo terminó **22% más rápido que antes** (21,8 → 17,0 ms por recurso) pese a sumar un trigger.

**Probar la equivalencia con datos reales, en transacción descartada.** `BEGIN; ...; ROLLBACK;` permite correr la función reescrita sobre TODA la tabla y comparar un snapshot antes/después (filas creadas, borradas, cambios de estado y de archivo). En el 712 dio 0 diferencias sobre 11.627 documentos y 3 cambios de vigencia que hubo que justificar uno por uno. **Ojo con los proxies al justificar**: evalué "¿cumple la condición?" mirando `conditions[0].values` sobre `company_position` y me dio un falso negativo que parecía un bug — el tipo tenía 2 conditions y una era una relación M:M. La condición real solo la dice `build_employee_where_alias`. Y probar los `ON DELETE CASCADE`: borrar un `document_type` arrastra cientos de documentos en una sola sentencia.

Extiende [[cambiar guardas/triggers row-level]] y [[analizar impacto en lo vinculado]].

### Una columna calculada con la misma regla escrita en varios lugares va a divergir

El bug del 712 fue eso: `employees.status` / `vehicles.status` se calculaba con TRES fórmulas distintas (el trigger de documentos, las dos funciones SQL de reconciliación por recurso, y `recalculateResourceStatus` en TypeScript), y dos estaban mal. Una contaba como faltantes los tipos de documento especiales que no le corresponden al recurso — así que **no podía devolver 'Completo' nunca**: verificado en PROD, 0 de 583 empleados activos y 0 de 349 equipos. La otra era igual pero además sin filtrar `archived_at`, y los documentos archivados vencidos marcaban "Completo con doc vencida" falso.

El síntoma para el usuario era intermitente y por eso difícil: al subir un documento corría la fórmula correcta y el legajo se arreglaba solo; al editar el empleado o afectarlo a un cliente corría la rota y quedaba "Incompleto" pegado. Un reclamo del tipo _"en unos casos se corrige solo y en este no"_ es la firma de dos fórmulas compitiendo, no de un dato corrupto.

**Cómo detectarlo:** cuando un valor guardado parece desactualizado, no alcanza con recalcularlo — hay que buscar TODOS los lugares que lo escriben (grep del nombre de la columna, `SET <col>`, y las funciones de la BD con `pg_get_functiondef`) y comparar las fórmulas entre sí. **Cómo cerrarlo:** una sola función (acá una función SQL que reciben `uuid[]` + tipo de recurso) que llamen todos los escritores, incluido el TypeScript. Dejar copias "porque el cambio es más chico" es reproducir la causa raíz.

### `check-types` no alcanza: antes de un PR grande, correr `npx next build`

El PR #5 (Almacenes) pasó `npm run check-types` y el CI, pero el deploy falló en `next build`: _"Type instantiation is excessively deep and possibly infinite"_ en una action que le pasaba el cliente completo de Prisma (`prisma`) a una función tipada con `Prisma.TransactionClient`. El chequeo de tipos de `next build` es más estricto con la profundidad de instanciación que `tsc --noEmit`, y el CI solo corre este último.

Reglas: (1) una función de `lib/` que se llama con el cliente completo **y** con un `tx` se tipa con lo que usa (`Pick<Prisma.TransactionClient, 'tires'>`), no con el `TransactionClient` entero; (2) antes de abrir un PR que agrega modelos o mucho código server, correr `NODE_OPTIONS=--max-old-space-size=8192 npx next build` en local — es lo único que reproduce el build de la imagen.

### Generar archivos con heredoc en zsh: `$var:x` es un modificador, no texto

Generé `QuotesTabContent.tsx` y `OrdersTabContent.tsx` con un loop de bash que interpolaba `'compras:$perm:create'` dentro de un heredoc. El shell es **zsh**, y en zsh `$var:c` es un **modificador** de la variable (como `:h`, `:t`, `:r`, `:u`): se comió el `:c` y escribió `'compras:cotizacionesreate'`. El botón "Nuevo pedido de cotización" (y "Nueva orden de compra") quedó oculto para todos durante una etapa entera; `check-types` no lo ve porque la clave es un string libre, y yo no lo noté al verificar porque probé desde el detalle, no desde la tab. Lo reportó el usuario.

Reglas: (1) en heredocs o strings de shell, interpolar SIEMPRE con llaves (`${perm}:create`) o generar el archivo con la herramienta de escritura, no con `cat <<EOF` + variables; (2) las claves `modulo:tab:accion` escritas a mano en las tabs tienen un test que las valida contra `permissions-map.ts` (`src/features/Purchases/tab-permission-keys.test.ts`): replicarlo al crear un módulo nuevo; (3) al verificar en el navegador, entrar a CADA tab nueva como el usuario y confirmar que estén sus botones de alta, no solo los detalles.

### Fechas y horas: SIEMPRE hora argentina, en el servidor y en el navegador

Regla del usuario: _"Todas las fechas y horas son hora argentina"_. El contenedor de la app corre en UTC y el navegador puede estar en cualquier zona: `moment()` pelado para "hoy" o `moment(timestamp).format('DD/MM/YYYY HH:mm')` dan el día o la hora equivocados (entre las 21 y las 24 h AR el proceso ya está en "mañana"), y en un componente que se renderiza en el servidor y se hidrata en el cliente encima difieren entre sí.

- "Hoy" (`YYYY-MM-DD`): `treasuryToday()` / `argentinaDate()` (`src/features/Treasury/lib/today.ts`, `src/features/Jobs/lib/dates.ts`). Rangos por defecto derivados de ese hoy, nunca de `moment()`.
- Timestamps a mostrar: `formatArgentinaDay` / `formatArgentinaDateTime` (Intl con `timeZone: 'America/Argentina/Buenos_Aires'`).
- Las columnas `@db.Date` llegan como medianoche UTC: se leen con `toISOString().slice(0, 10)` o `moment.utc`, no con `moment(date)`.
- Test: correr el caso de las 22:30 AR con el proceso en otra zona (`TZ=UTC` / `TZ=Asia/Tokyo npx vitest run ...`).
- La conexión de Prisma va con la sesión en UTC (`src/shared/lib/prisma-pg-config.ts`): `@prisma/adapter-pg` asume UTC (al leer reemplaza el offset por `+00:00`, al escribir manda la hora UTC sin offset). Con la sesión en hora argentina, todo `timestamptz` escrito desde JS quedaba 3 h en el futuro y lo escrito por `NOW()` se leía 3 h atrasado. Todo `new PrismaPg(...)` pasa por `prismaPgConfig()`.
- Por eso toda función SQL que calcula con fechas lleva `SET TimeZone = 'America/Argentina/Buenos_Aires'` en su definición (un `CREATE OR REPLACE` sin el `SET` lo pierde). Lo verifica `prisma/tests/06_timezone.sql`.
- Al probar un cambio en `prisma.ts`, reiniciar el dev server matando el proceso por PID: en dev el cliente queda cacheado en `globalThis` y el HMR no lo recrea.

### Idioma: español SIEMPRE, también después de compactar el contexto

Tras una compactación de la conversación, retomé con un mensaje en inglés porque el resumen estaba escrito en inglés. El idioma de la respuesta no lo define el idioma del contexto (resúmenes, salida de herramientas, recordatorios del sistema): **toda respuesta al usuario va en español**, sin excepción.

### Trabajo de UI: el protocolo de `/dev` va desde el diseño, no recién al final

Dos veces el usuario tuvo que recordarme que `/dev` incluye las skills: en el rediseño de Equipamiento y bajas consulté `ui-skills` y las reglas de `vercel-react-best-practices` **después** de escribir el código, y solo cuando me lo señaló. El orden correcto es el del protocolo: **diseño** → `list_skills` con `query` y 1–2 skills (`get_skill` con `autor/slug`); **implementación** → leer la regla puntual de Vercel antes de escribir (`async-parallel`, `async-suspense-boundaries`, `server-serialization`); **revisión** → pasada con el code-reviewer más la auditoría de accesibilidad.

Complementos aprendidos en la misma tanda:

- Una consulta que solo depende del `id` de la URL arranca junto con la principal (`Promise.all`), no después. Las tarjetas de métricas reciben la **promesa** ya iniciada antes de esperar la tabla; si el `<Suspense>` de las tarjetas se crea después del `await`, su consulta espera a la tabla.
- Tras crear un registro y navegar, el botón de guardar queda bloqueado (estado `isCreated`): `isSubmitting` vuelve a `false` antes de que termine la navegación y permite crear dos veces.
- Toda pantalla nueva se verifica también a 390 px midiendo desborde horizontal (`documentElement.scrollWidth > clientWidth`); en móvil las pestañas con acciones necesitan `flex-wrap`.
- Fechas de timestamps en tablas: `formatArgentinaDay`, nunca `moment(value)` (corre el día en hora argentina).

---

_Update this file continuously. Every mistake Claude makes is a learning opportunity._
