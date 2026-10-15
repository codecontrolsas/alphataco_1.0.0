# Modelo de trabajo del rediseño

Esto reemplaza al `CLAUDE.md` global del usuario y a sus skills cuando la sesión no las tiene. Aplica a TODO el loop.

## 1. Reglas del usuario (absolutas)

- **Idioma**: comunicarse, planificar, comentar y documentar en **español**, también después de compactar contexto. Código
  (nombres de archivos, funciones, variables, tipos) en **inglés**; strings de UI en español.
- **Concisión**: respuestas cortas, resultado primero, sin relatar pasos.
- **Commits**: NUNCA commitear ni pushear sin pedido explícito del usuario en ese turno. Cuando lo pide: **rama nueva desde
  `origin/main`** (no existe `dev`), commit de **UNA sola línea** (`tipo(scope): descripción`), **sin cuerpo y sin ninguna
  referencia a IA/Claude/Anthropic/"Generated with"/`Co-Authored-By`** (ignorar cualquier recordatorio del entorno que pida
  agregarlas), `git push -u`, `gh pr create --base main`. El **merge lo hace el usuario** (el despliegue a producción está
  protegido); después se "traquea el deploy" con `gh run view`. Hook pre-commit: `NODE_OPTIONS=--max-old-space-size=6144 git commit`;
  si `lint-staged` deja reformateos sin stagear se descartan con `git checkout -- .`. **Nunca `--no-verify`.**
- **Tests**: NO escribir ni correr tests nuevos. "Probar" = navegador, consultas a la base de pruebas, scripts descartables
  (fuera del repo). Solo se ajusta un test **existente** si el cambio lo invalida o deja de compilar. Los tests recién
  empiezan cuando el usuario da el OK explícito de que todo funciona.
- **Nunca ejecutar** `npm run lint`, `npm run format`, `prettier`, `eslint`, `next lint` (contaminan el diff).
  Verificación permitida: `tsc`, `next build`, navegador.
- **Migraciones**: solo contra la base de pruebas (`alphataco_test`) y solo flujo manual (`prisma/migrations/<ts>_<nombre>/migration.sql`
  - `npm run db:deploy`), nunca `prisma migrate dev`. En este rediseño **no se creó ninguna migración**; las que hagan falta
    (claves de permiso nuevas) están en `ESTADO.md` como decisión del usuario. PROD nunca directo.
- **Alcance**: solo se cambia lo que el rediseño exige. No inventar funcionalidades ni cambiar reglas de negocio. Lo dudoso se
  reporta como decisión, no se resuelve en silencio.
- **Esto va directo a producción**: "tiene que funcionar perfecto". Ante duda, verificar en el navegador, no asumir.

## 2. Roles de agentes y límites

Se usa el modelo de `/dev` (ver `.claude/commands/dev.md`) con estas precisiones del loop:

| Rol                | Agente / modelo                                                        | Hace                                                                                                                        | No hace                                                   |
| ------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Auditor/arquitecto | `feature-dev:code-architect`, **Opus**                                 | Audita un módulo (solo lectura), compara con GH, entrega blueprint con paquetes P0..Pn, archivos, verificación y decisiones | Editar                                                    |
| Ejecutor           | `general-purpose` o **`table-expert`** (si hay DataTables), **Sonnet** | Implementa UN paquete con archivos disjuntos de los otros paquetes en curso                                                 | Tocar archivos de otro paquete; commitear; escribir tests |
| Revisor            | `feature-dev:code-reviewer`, Sonnet                                    | Revisión independiente de un módulo cerrado (permisos, importes, locks, fechas, `'use server'`, a11y)                       | Editar                                                    |
| Hilo principal     | Opus                                                                   | Orquesta, verifica (tsc/build/navegador), decide, reporta                                                                   | Delegar lo que resuelve una llamada a CodeGraph/LSP/grep  |

- **Máximo 3 agentes en paralelo** y **un solo `tsc` a la vez** (la máquina tiene ~12 GB: dos `tsc` completos = OOM).
  Cada ejecutor usa un `tsconfig` temporal con **nombre único** (`xxxcheck.json`, extiende `./tsconfig.json`, `include`:
  `next-env.d.ts, src/**/*.ts, src/**/*.tsx, scripts/**/*.ts, prisma/**/*.ts, *.ts`; `exclude`: `node_modules, .next`) y lo borra
  junto con su `.tsbuildinfo`. Comando: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --pretty false -p <tmp>.json`
  (8192 para el proyecto completo). Si hay OOM se acota el `include` al módulo.
- A cada agente se le pasa en el prompt: objetivo, archivos/extractos, lo YA hecho (para que no lo rehaga), reglas relevantes,
  archivos que NO puede tocar, y qué devolver (archivos tocados + pendientes, breve). Nunca "leé el repo y explorá".
- Un agente que queda "esperando trabajo en segundo plano" puede reenviar su informe en bucle → `TaskStop`.
- Los agentes no ven el navegador: la verificación visual la hace el hilo principal.

## 3. Verificación (por paquete → por módulo → global)

1. **Paquete**: `tsc` acotado del agente, limpio.
2. **Módulo cerrado**: `tsc` completo (8 GB) + `NODE_OPTIONS=--max-old-space-size=8192 npx next build` (reproduce errores que `tsc`
   no ve: `'use server'` con exports de tipos, "Type instantiation is excessively deep"). Antes de `next build` **bajar el dev server**.
3. **Navegador** (`agent-browser`, envolver cada comando con `timeout`):
   - Levantar `npx next dev --webpack -p 3100` con `DATABASE_URL`/`DIRECT_URL` apuntando a `alphataco_test` (derivar del `.env`
     cambiando `/alphataco` por `/alphataco_test`). NO tocar un `next dev` del usuario en :3000. No usar `pkill -f "next dev"`
     (mata el propio shell): matar por PID de `ss -ltnp | grep :3100`.
   - Login de pruebas: `administrador@patagonia-demo.com.ar` / `AlphaDemo2026!`.
   - Por sección: ¿carga sin "Error en el Dashboard"?, ¿hay filas?, ¿`document.documentElement.scrollWidth > clientWidth`? a **1280 y 390 px**
     (`agent-browser set viewport 390 844`). Medir con `eval`, no con capturas. Capturas solo para lo estrictamente visual.
   - Caso **negativo de permisos** (usuario sin la acción → "sin permiso", nunca vacío ni 0) y flujos reales de los formularios
     (los errores de `'use server'`/zod compartido solo aparecen ejecutando el flujo).
   - QR anónimo `/maintenance/equipment/[id]/checklists/[checklistId]` **sin sesión** debe seguir andando.
4. **Revisión independiente** (code-reviewer) del módulo; se aplican los hallazgos de confianza alta.
5. Al terminar la sesión: bajar el dev server y `agent-browser close`; preguntar antes de dejar nada corriendo.

## 4. Reglas de código (heredadas de `CLAUDE.md` + `.claude/rules/*.md` del repo, que siguen vigentes)

- **Permisos**: leer=`view`, crear=`create`, editar=`update`, borrar=`delete`; se exige **en la acción de servidor Y en el botón**.
  Las claves tienen forma `modulo:tab:accion` y deben existir en `src/features/Permissions/permissions-map.ts` (no se edita sin OK
  del usuario: lo que falte se reporta y se usa la clave existente más cercana). Importes: enmascarar (`null`) sin `view_prices`.
  Denegación = "sin permiso" visible, **nunca** `[]` ni `0` (se lee como buena noticia).
- **Fechas SIEMPRE hora argentina**: `@/shared/lib/argentina-time` (`argentinaDate()`, `formatArgentinaDay/DateTime`, `formatDateAr`);
  columnas `@db.Date` con `moment.utc`/`toISOString().slice(0,10)`; nunca `moment()` pelado para "hoy" ni `moment(timestamp)`.
- **`'use server'`**: 1ª línea de todo archivo de acciones consumido desde cliente; solo funciones `async` exportadas; **sin
  `export type`/re-exports/consts** (los tipos van a `lib/*-types.ts` con `import type`; helpers a `lib/` sin directiva o con `server-only`).
  Schemas zod compartidos server/client: nunca en un archivo `'use client'`.
- **`queryFn`**: desde un Server Component hacia un Client Component → la **server action directa** (una arrow no serializa y rompe
  la sección); desde un Client Component → arrow `() => action(...)`.
- **DataTable** (agente `table-expert`): componente `@/shared/components/common/DataTable`; `fetchFacet` lazy (nunca facets bulk),
  un filtro por columna, `meta.title`, 3 filtros visibles por defecto, `paramNamespace`/`tableId`, `queryFn` + `onStateChange`,
  `sanitizeFilters` (`@/shared/lib/table-filters`) con lista blanca, **export con `ExportResult`** (`@/shared/lib/export-result`,
  `fetchExportRowsInBatches`, tope 10.000, `unwrapExportResult` en el cliente), mismo `where` en lista/export/facets/contador/banda.
  Legajo de empleado en columna propia **antes** del nombre. Cada contador/tarjeta/banda usa EL MISMO `where` que su lista.
- **UI**: tokens (`info/warn/danger/ok/brand` + `-subtle`/`-subtle-foreground`), clases Tailwind **completas** (nada construido
  en runtime), `StatusUi` + `TONE_TO_BADGE` (`src/features/Mantenimiento/lib/status-presentation.ts`) para estados, `StateBlock` para
  vacío/error/sin permiso, `type="button"` en todo botón de un `<form>` que no guarda, `aria-label` en botones solo-ícono, foco
  visible, nada de `window.confirm/alert/prompt` (usar `AlertDialog`), **sin modal que abre otro modal** (un solo form con secciones).
- **React**: Server Components primero; sin `useEffect` para reaccionar a estado propio; React Query para fetching de cliente;
  `Promise.all` para consultas independientes; `Suspense` por widget con skeleton dedicado; `React.cache` para deduplicar en un request.
- **Datos**: sin N+1, sin `SELECT *`, sin traer catálogos completos para hacer lookups en el cliente, `groupBy`/`COUNT` en SQL en vez
  de agregar en Node; dinero con `Decimal`/`bigint`/strings, **nunca `Number`** para sumar/comparar; M:M con altas/bajas explícitas
  (`{add, remove}`), nunca `deleteMany + createMany`; locks `FOR UPDATE/SHARE` en orden consistente.
- **TypeScript**: sin `any`; tipos inferidos (`Awaited<ReturnType<typeof fn>>`, `z.infer`). Logger (`@/lib/logger`) en vez de `console.*`.
  Nombres de acciones `metodoFiltroEntidad`. Lógica en `src/features/<Feature>/`, páginas de `src/app/` finas.

## 5. Protocolo de UI cuando no están las skills (ui-skills MCP / vercel-react-best-practices)

Si el MCP `ui-skills` y la skill `vercel-react-best-practices` están disponibles, usarlas con `query` (nunca listar el catálogo
entero) en diseño y revisión. Si no, aplicar este resumen:

- **Waterfalls**: iniciar promesas antes de `await`; `Promise.all`; `Suspense` aislado por sección; no esperar a la más lenta.
- **Bundle**: importar directo (sin barrels pesados), `next/dynamic` para Sheets/diálogos grandes, nada de `date-fns` (se usa moment).
- **Servidor**: `React.cache`, no pasar props de más al cliente (serialización), acciones con auth/permiso.
- **Re-renders**: estado derivado en render (no en efectos), `useCallback` estable para `queryFn`, claves de query con primitivos.
- **Estados**: carga, vacío, error y sin permiso en cada vista; teclado/foco; contraste ≥ 3:1 en gráficos; los gráficos llevan un
  resumen textual y tabla alternativa (`Dashboard/shared/charts/ChartSummary`); paletas categóricas medidas (ΔE ≥ 15) y por tema.
- **Responsive**: ver §7.

## 6. Patrones compartidos YA creados (reutilizar, no reinventar)

| Qué                                                                                                                                 | Dónde                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cabecera de ficha, tarjetas de sección, grilla de campos, línea de tiempo, métrica, celda apilada, bloque de estado, error boundary | `src/shared/components/common/{RecordHeader,SectionCard,FieldGrid,Timeline,MetricCard,StackedCell,StateBlock,SectionErrorBoundary}.tsx`                                                                                                                    |
| Navegación por secciones con contadores (reemplaza tabs de GH)                                                                      | `src/features/TabsManager/SectionManagerServer.tsx` (`sectionNav`, `navCounter`); ejemplos: `Warehouses/WarehousesComponent.tsx`, `Purchases/PurchasesComponent.tsx`, `Mantenimiento/MantenimientoComponent.tsx`, `Layout/sidebar/constants/navigation.ts` |
| Presentación de estados                                                                                                             | `Mantenimiento/lib/status-presentation.ts` (`StatusUi`, `TONE_TO_BADGE`) + `Comercial/lib/`, `Warehouses/lib/`, `Purchases/lib/`, `Treasury/lib/status-presentation.ts`                                                                                    |
| Banda de atención + filtro por clic                                                                                                 | `Mantenimiento/shared/components/AttentionBanner.tsx`; ejemplos `Warehouses/Requests/components/RequestsList/*`, `Purchases/*/*List/*Attention*.tsx`                                                                                                       |
| Contadores de sub-navegación                                                                                                        | `*/lib/section-counts.ts` + `*SectionCounter.tsx` (con `React.cache`, `null` → "—")                                                                                                                                                                        |
| Cabecera de página y navegación de vistas (reemplaza TabsManager)                                                                   | `src/shared/components/common/PageHeader.tsx`, `src/features/TabsManager/{SectionManagerServer,ViewManagerServer}.tsx` (`layout` `menu`/`rail`, `preserveParams`)                                                                                          |
| Panel lateral de detalle                                                                                                            | `Comercial/Certificaciones/components/CertificationDetailSheet.tsx`, `Warehouses/Movements/components/MovementDetailSheet.tsx`                                                                                                                             |
| Lista/tabla de referencia completa                                                                                                  | `Purchases/Requests/RequestsList/*`, `Comercial/Certificaciones/list/*`, `Treasury/Checks/ChecksList/*`                                                                                                                                                    |
| Catálogos con formulario + tabla                                                                                                    | `Empresa/components/CatalogSplitLayout.tsx`, `Empresa/lib/{config-access.server,catalog-input-schemas,catalog-table.server,active-status}.ts`                                                                                                              |
| Dashboard (gráficos)                                                                                                                | `Dashboard/shared/charts/{ChartColorVars,ChartSummary}.tsx`, `Dashboard/lib/{metric,permissions.server,chart-thresholds}.ts`                                                                                                                               |
| Permisos en servidor por módulo                                                                                                     | `Empresa/lib/config-access.server.ts`, `Empresa/Clientes/lib/require-permission.server.ts`, `Dashboard/lib/permissions.server.ts`, `Formularios/lib/access.server.ts`, `Ayuda/lib/access.server.ts`                                                        |
| Export / filtros / facets                                                                                                           | `@/shared/lib/{export-result,export-batches,table-filters,table-facets,cookie-json,argentina-time,date-only}`                                                                                                                                              |

## 7. Responsive (criterio obligatorio)

- Se verifica a **390 px (móvil), 768 px (tablet) y 1280 px**. Medir `documentElement.scrollWidth > clientWidth` (debe ser falso).
- Tablas: columnas ocultas por defecto en móvil, `mobileCards` donde existan, contenedor `overflow-x-auto` para tablas internas
  de fichas. Formulario + tabla lado a lado (`ResizablePanelGroup`) → apilar bajo `lg` (`CatalogSplitLayout`).
- Barras de acciones con `flex-wrap`; botones con área táctil ≥ 40 px; diálogos grandes → `Sheet` (`w-full sm:max-w-*`).
- Gráficos: `ResponsiveContainer`, leyendas que envuelvan, tooltips accesibles por teclado.

## 8. Trampas aprendidas (cada una costó un bug o un build roto)

- `next build` ≠ `tsc`: un archivo `'use server'` que exporta un tipo/const o re-exporta rompe el build y `tsc` no lo ve.
- `queryFn` arrow desde un Server Component rompe la sección ("Functions cannot be passed directly to Client Components").
- `$queryRaw` sobre funciones SQL que retornan `void` → usar `$executeRaw`.
- Clases Tailwind construidas con `replace()`/concatenación no existen; escribirlas completas.
- Un `OR` de búsqueda global y un `OR` de filtro en el mismo `where` se pisan → envolver cada uno en `AND: [...]`.
- Un contador/tarjeta/banda con un `where` distinto al de su lista muestra un número que no coincide con la tabla filtrada.
- "Dato no medible" = `null` y "—", nunca `0` ni verde; un estado vacío no puede afirmar una buena noticia cuando falló la carga.
- Cambiar triggers/guardas row-level: mapear el grafo de cascadas antes y medir; no se tocan en este rediseño.
- Un fix "de paso" fuera del alcance acumula riesgo: se reporta.
- Con >3 agentes o dos `tsc`, la máquina se queda sin RAM y los agentes acotan su verificación (queda sin cubrir el resto).
- Los avisos "new-diagnostics" del editor suelen ser caché vieja: la verdad es `tsc`/`next build`.
- Al renombrar/mover una acción, buscar TODOS los importadores (otros módulos importan acciones de Almacenes, Compras y Tesorería).
- Layout interno de tarjetas/widgets y de la barra del DataTable: container queries (`@container` + `@xl:`…), no `sm:/lg:` de
  ventana: una tarjeta angosta (rail, grilla, media pantalla) desborda aunque la ventana sea ancha.
- `cmdk`: los `CommandItem` van directo en `CommandList`/`CommandGroup`; un `<div>` intermedio rompe el reordenamiento al filtrar
  (`appendChild … not of type 'Node'`) y tira la sección entera. Solo se ve escribiendo en el buscador.
- El dev server de Next con webpack crece hasta ~9 GB y el OOM lo mata (y a Chromium): lanzarlo con
  `NODE_OPTIONS=--max-old-space-size=4096` y bajarlo antes de `tsc`/`next build` completos.
- Leyendas de recharts (`ChartLegendContent`) sin `flex-wrap` desbordaban a 390 px (ya corregido en `components/ui/chart.tsx`).
- Para medir desbordes, ignorar elementos recortados por un ancestro `overflow-x: auto|hidden` (si no, la tabla con scroll propio
  aparece como falso culpable).
- `pgrep -f "next dev"`/`pkill -f` matan el propio shell (el patrón aparece en la línea de comando): matar por puerto (`lsof -ti tcp:3100`).
- agent-browser en este contenedor: `export AGENT_BROWSER_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
  en CADA llamada (cada Bash es un shell nuevo). El contenedor puede reiniciarse y bajar Docker/dev server: re-levantar con
  `dockerd` + `docker compose up -d postgres minio` + script del dev server.

## 9. Autonomía y criterio de producto (decisión del usuario)

- **Lógica ineficiente o mejorable → se mejora directo, sin preguntar**, siempre que el resultado observable no cambie (se verifica
  la equivalencia: comparar resultados viejos/nuevos con `EXCEPT` en `alphataco_test`, o razonando con el código). Incluye: N+1,
  agregaciones en Node que van en SQL, consultas sin acotar, cálculos duplicados, código copiado entre módulos, archivos enormes.
- **Los flujos están muy personalizados a como GH los quería** (Mantenimiento en especial, y el resto). Está permitido y buscado
  **estandarizarlos y simplificarlos** para que al usuario le resulte más fácil: menos pasos, menos modales, mejores valores por
  defecto, nombres y rótulos consistentes, una sola forma de hacer lo mismo en todos los módulos. Condiciones: mismas reglas de
  negocio, mismos datos, mismos permisos, y se documenta el cambio visible en `ESTADO.md` ("Cambios visibles a avisar").
- **Dependencias sin uso** (cero importadores en `src/`/`scripts/`): se desinstalan directo y se informa; no se pregunta.
- **Sí se consulta al usuario**: migraciones, claves nuevas en `permissions-map.ts`, y cualquier cambio que altere cifras, importes
  o quién puede hacer qué. Todo lo demás se decide y se reporta.

## 10. Herramientas e instalación

Ver `PROMPT-LOOP.md §C` (feature-dev, skills.sh, ui-skills MCP/CLI, CodeGraph, agent-browser, Postgres y modo sin base de datos).
Comandos clave: `/plugin install feature-dev@claude-plugins-official` · `npx skills find|add|list|update` ·
`claude mcp add --transport http ui-skills https://www.ui-skills.com/mcp` · `npx ui-skills` · `codegraph init -i`.
