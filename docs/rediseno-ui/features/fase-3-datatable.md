# Fase 3 — DataTable: desktop nuevo + modo mobile — plan de UI

Estado: plan
Fase del PLAN: 3 · Ficha del inventario: no hay una ficha propia del DataTable. El contrato son las fichas de las
3 tablas del Checkpoint 3: `inventario/operaciones.md` (Gestor de Pedidos), `inventario/empleados.md` (Empleados
Activos) y `inventario/dashboard.md` (RRHH → Detalle de Ausencias). A eso se suman las 9 tablas anchas de §3.6 y el
comportamiento genérico que figura en §8.

Implementa: **`table-expert`** (regla del repo: toda tarea de DataTable va por ese agente; `PLAN.md` §5). Este
documento está escrito para que lo ejecute él, en el modo especial de la §4.0: **rediseño, no auditoría**.
Diseña y audita: `ui-skills` (`PLAN.md` §3.1).

Skills consultadas (barrido por MCP `ui-skills` con `list_skills`: `table`, `mobile`, `container`, `responsive`,
`accessibility`, `filter`, `empty state`, `performance`, `density`, `shadcn`, `scroll`, `interaction`, `data`):
- `vercel-react-best-practices` (local, tool `Skill`): se leyeron las reglas `rendering-content-visibility`,
  `rendering-hydration-no-flicker`, `bundle-dynamic-imports`, `bundle-conditional`, `rerender-memo`,
  `rerender-no-inline-components` y `rendering-activity`. Aportó la §4 completa. Lo más importante: `exceljs` hoy
  entra al bundle de cada página con tabla (`bundle-conditional`), y el DOM doble se acota con `content-visibility`.
- `flornkm/prefer-container-queries` (leída completa; es la columna vertebral del modo mobile): se usa
  `@container/table` con nombre, porque el DataTable vive dentro de otros contenedores (`@container/panel`,
  `@container/dialog`). La regla es "una variante sin container ancestro nunca aplica". No se traduce `md:` → `@md:`
  a ciegas: el corte es `@3xl/table` (768px **de contenedor**). Se prueba en el contexto más angosto real, un
  dialog de 760px, y no solo a 375px de viewport.
- `pbakaus/adapt` (leída completa): dice que adaptar es repensar, no escalar. De ahí salen bottom sheets en lugar
  de popovers, controles al alcance del pulgar, progressive disclosure (tarjeta → detalle), 44px con
  `pointer: coarse` y "nunca esconder funcionalidad en mobile". Por eso exportar, columnas, filas por página y
  ordenar tienen lugar en mobile.
- `vercel-labs/react-best-practices`: componentes a nivel de módulo, tarjeta memoizada con `isSelected`
  booleano, defaults no primitivos hoisteados, `role="status"` siempre montado, sin medir layout en el render.
- `ibelick/baseline-ui`: sin mezclar primitivos (todo Radix/vaul vía shadcn), `aria-label` en todo control de solo
  ícono, `h-dvh`/`dvh`, escala de z fija, skeleton estructural, animación solo de opacidad.
- `vercel-labs/web-design-guidelines` (las reglas se bajaron de `web-interface-guidelines/command.md`): `<button>`
  real como disparador de la tarjeta y no `div onClick` como única vía; `scroll-padding` por el header sticky; estado
  en la URL; `overscroll-behavior: contain` en los sheets; "…" y "–" tipográficos.
- `jakubkrehel/better-accessibility`: nada de interactivos anidados en la tarjeta; tres paradas de Tab por tarjeta;
  hit areas de 44px por pseudo-elemento; foco devuelto al disparador; `aria-disabled` en lugar de tooltip sobre
  `disabled`.
- `pbakaus/harden`: distinguir vacío, filtrado a cero, error y carga (inicial vs refetch); datos extremos; los
  nulos se muestran con el mismo "Sin asignar"/"—" que ya pinta la celda.
- `emilkowalski/mobile-native`: inputs a 16px, safe-area con `viewportFit: 'cover'` (ya está en
  `src/app/layout.tsx:21`), `overscroll-contain`, `touch-action: manipulation`, el texto de las tarjetas se puede
  copiar (sin `select-none` en el contenido).
- `jakubkrehel/better-typography`: `tabular-nums` en contadores y rango; "1–50" con raya corta; `whitespace-nowrap`
  en badges y chips; nada por debajo de 12px.
- `shadcn-ui/shadcn`: Title obligatorio en Drawer y Sheet, ítems siempre dentro de su Group, `asChild` en los
  triggers, sin z-index manual en overlays, `gap-*` en vez de `space-*`. Se descartó lo que asume la API nueva
  (`Empty`, `Field`, `Spinner`): el repo es new-york + Radix y ya tiene `EmptyState` propio (Fase 2).
- `jakubkrehel/better-layout`: agrupar con espacio antes que con líneas (toolbar en 2 grupos), orden del DOM = orden
  visual, una sola primaria, el truncado necesita un camino al texto completo (el panel de detalle). También advierte
  que `container-type: inline-size` colapsa a 0 un flex item sin ancho: se cubre en §3.2.
- `emilkowalski/break-ui`: datos de peor caso inyectados por el mismo borde que los reales (fixture en `queryFn`),
  fallos repartidos en las primeras filas, plurales ("1 seleccionado"), 0 / 1 / 100 filas, muchos chips activos.
- `mengto/container-lines`: las hairlines van en la estructura (contenedor, filas, header), no en cada grupo de la
  toolbar; toolbar, tabla y pie comparten bordes izquierdo y derecho.
- `wshobson/wcag-audit-patterns`: aportó poco cuerpo propio (dos referencias no se pudieron traer por MCP). Los
  criterios 2.5.8, 1.4.10, 2.4.11, 1.4.11 y 4.1.3 se tomaron del texto de WCAG 2.2 y están en §3.9.
- Descartadas tras ver la descripción: `dickwu/apple-design` y `justinwetch/apple-hig` (HIG nativo),
  `emilkowalski/apple-design` (gestos y springs: el modo es instrumental), todo lo de GSAP/Three/Vue/Figma.
  `rendering-activity` (sugerida por un destilado) se descarta para los sheets: el detalle es por fila y se
  remonta con otra fila, así que conservar estado oculto no aporta.

---

## 1. Alcance

### 1.1 Archivos del componente (`src/shared/components/common/DataTable/**`)

| Archivo | Líneas | Qué le pasa |
|---|---|---|
| `DataTable.tsx` | 561 | Se parte (§4.1): queda el orquestador (estado, React Query, persistencia) y delega el render en `DataTableDesktop`, `DataTableCards`, `DataTableDetailSheet` y `DataTableSelectionBar`. Contenedor `@container/table` (§3.2). |
| `types.ts` | 461 | `declare module '@tanstack/react-table'` con `ColumnMeta` tipado (§3.1). Props nuevas: `mobileLayout`, `selectionActions`. |
| `DataTableToolbar.tsx` | 211 | Se reescribe la piel: un solo DOM que se reacomoda por container query (§3.3 y §3.5). |
| `DataTableFacetedFilter.tsx` · `DataTableTextFilter.tsx` · `DataTableDateRangeFilter.tsx` | 229 · 130 · 143 | Se separa el **estado** (hook) del **cuerpo** (lista de opciones, input, fechas), para que el mismo cuerpo viva en el popover desktop y en el acordeón del sheet mobile (§4.1). |
| `DataTableFilterOptions.tsx` | 83 | Pasa a ser el menú "Filtros (n)" de desktop (§3.3). |
| `DataTableViewOptions.tsx` | 303 | Piel nueva. Hoy está `hidden lg:flex`, así que entre 768 y 1023px nadie puede elegir columnas: pasa a estar siempre disponible (en mobile, dentro del ⋯). |
| `DataTableColumnHeader.tsx` | 106 | Header de 32px, `text-overline`, flecha de 12px solo en la columna ordenada (§3.3). |
| `DataTablePagination.tsx` | 122 | Pie "1–50 de 387" + "50 / pág." + `‹ 1 2 … 8 ›`. Variante compacta por container query (§3.4). |
| `_DataTableExportButton.tsx` | 93 | `exceljs` se carga al hacer clic (`bundle-conditional`, §4.5). Mismo resultado de exportación. |
| `DataTablePendingContext.tsx`, `useDataTable.ts`, `helpers.ts`, `in-memory.ts` | — | **No se tocan** (URL, estado, Prisma). |
| `index.ts` | 84 | Exporta lo nuevo (tipos de `meta.mobile`). No se agrega nada pesado al barrel. |
| `DOCS.md` | 1669 | Secciones nuevas: "Modo mobile", "`meta.mobile`", "`mobileLayout`", "`selectionActions`", "Estados"; se actualiza "Card wrapper" → `Panel` (§3.8). |

Archivos nuevos en la misma carpeta (nombres en inglés, regla `code-language.md`):

| Archivo nuevo | Qué es |
|---|---|
| `mobile-columns.ts` | Función pura (sin directiva) que resuelve qué columna va como título, subtítulo, estado y campo, con anotación o con la heurística (§3.1). Testeable y sin React. |
| `DataTableDesktop.tsx` | `<table>` real: header sticky, filas, celdas, estados vacío/carga/error dentro del cuerpo. |
| `DataTableCards.tsx` | Lista `<ul>` de tarjetas + skeleton de tarjetas. |
| `DataTableCard.tsx` | Una tarjeta (`memo`). Reusa los `cell` con `flexRender`. |
| `DataTableDetailSheet.tsx` | Detalle de la fila: `ResponsiveDialog layout="sheet"` (sheet de 480px a la derecha en desktop, bottom sheet en mobile). Dentro de un dialog, expansión en línea (§3.5). |
| `DataTableMobileFilters.tsx` | Sheet "Filtros": "Ordenar por" + acordeón por filtro + footer "Limpiar" / "Ver N resultados". |
| `DataTableSelectionBar.tsx` | Barra de selección: en desktop reemplaza la toolbar y en mobile queda pegada abajo (§3.5). |
| `DataTableMoreMenu.tsx` | Menú ⋯ de mobile: Columnas, Exportar, Filas por página, Mostrar filtros. |
| `DataTableActiveFilterChip.tsx` | Chip "Estado: Activo +2 ×" que también funciona como trigger de su popover. |
| `DataTableStates.tsx` | Vacío (`EmptyState` empty/filtered), error (callout + "Reintentar") y skeleton de filas. Los usan tanto la vista desktop como la de tarjetas. |
| `filters/use-facet-filter.ts`, `filters/use-url-text-filter.ts`, `filters/use-url-date-range.ts` | Estado de cada filtro, extraído **sin cambios de lógica** de los tres componentes actuales. |
| `filters/FacetOptionsList.tsx`, `filters/TextFilterBody.tsx`, `filters/DateRangeFilterBody.tsx` | Cuerpos compartidos por popover y acordeón. |

Fuera de la carpeta, también dentro de la Fase 3:
- `src/app/globals.css`: dos utilidades de fade de un solo lado (`scroll-fade-start` y `scroll-fade-end`, §3.2.4).
  El archivo es compartido: lo edita un solo agente (`PLAN.md` §5).
- `src/shared/components/skeletons/TableSkeleton.tsx`: geometría nueva (header de 32px, filas de 36px) y variante de
  tarjetas por container query.
- Los `columns.tsx` de las **9 tablas anchas** (§3.6): **solo se agrega `meta.mobile`**. No se toca nada más del
  archivo.
- `src/features/Operaciones/Preparte/list/components/_PreparteDataTable.tsx`: "Cambiar estado" pasa de
  `toolbarActions` a `selectionActions` (§3.5.4). Es la tabla del Checkpoint 3 con acciones masivas.

### 1.2 Tablas del Checkpoint 3

| # | Caso | Tabla | Ruta | Por qué esta |
|---|---|---|---|---|
| 1 | Selección + acciones masivas | Gestor de Pedidos, `preparte-table` (`Operaciones/Preparte/list/components/_PreparteDataTable.tsx`) | `/dashboard/operations?tab=preparte` | Selección **condicional por fila** (`pendiente`/`reprogramado` y permiso `update`), acción masiva "Cambiar estado", `clearSelectionTrigger`, limpieza de la selección al cambiar de params, 23 columnas, filtros `dateRange` + `text` + facetados, KPIs que escriben la URL con `DATA_TABLE_URL_CHANGE_EVENT` y Cypress (`cypress/e2e/operations/preparte.cy.ts` usa `status-badge-*`, `confirmar-button-*` y `eliminar-button-*`). |
| 2 | Filtros de texto y fecha | Empleados Activos, `_EmployeeDataTable.tsx` | `/dashboard/employee?tab=employees&subtab=empleados-activos` | 10 filtros de texto y 4 `dateRange` (`_EmployeeDataTable.tsx:369-389`), la tabla más ancha (39 columnas visibles u ocultas), columnas ocultas por defecto, visibilidad de filtros guardada, `toolbarActions` ("Agregar empleado") y selección **entre páginas** sin acción masiva (`rowSelection` persiste al paginar). |
| 3 | En memoria | Detalle de Ausencias por Empleado, `_EmployeeAbsenceDataTable.tsx` | `/dashboard?tab=estadisticas&subtab=rrhh` (y el dialog "Ver ausentes" de Resumen por Sector y de Ausentismo Diario) | `inMemory`, facetas con opciones calculadas en el cliente, búsqueda global en memoria y export de las filas filtradas (`DataTable.tsx:402-408`). Además se monta **dentro de un dialog** (Tabs Bajas/Ausentes/Altas), que es la prueba real del container query y del detalle sin modal encadenado (§3.5). |

Verificación adicional, sin ser del checkpoint: **Equipamiento** (`/dashboard/equipment?tab=equipos&subtab=others`,
`_OtherEquipmentDataTable.tsx`) es la única tabla con `persistViewPreferences` + `enableColumnReorder`. Ahí se
prueban "filas por página y orden guardados" y el reordenamiento de columnas desde el ⋯ de mobile.

### 1.3 Dialogs, sheets y forms que abre el DataTable

- Popovers por filtro (facetado, texto, rango de fechas), menú de columnas (o panel con reordenamiento), menú
  "Mostrar filtros", menú de orden por columna (header) y tooltip de exportar.
- **Nuevos**: sheet de detalle de fila, sheet de filtros mobile, menú ⋯ mobile y barra de selección.
- Los dialogs que abren las **celdas** de cada consumidor (confirmaciones de Preparte, foto del empleado, etc.)
  son del consumidor. En mobile se abren desde el sheet de detalle (§3.5.3).

### 1.4 Fuera de esta fase aunque se vea en la pantalla

- Las 18 `BaseDataTable` (Fase 5), las tablas manuales y `SimpleTable` (salvo la decisión del fade, §3.2.4).
- El contenido de las celdas de cada consumidor: colores de badges, `RowActions`, `StatusBadge`. Se migran con su
  módulo (Fase 6). La tarjeta muestra la celda **tal como la dibuja hoy** el consumidor.
- El `useIsMobile` propio de `_AllDeliveriesDataTable.tsx:225` (Indumentaria): lo saca la Fase 4 (piloto), que pasa
  esa tabla al modo mobile genérico.
- Los fallbacks `fallback/*Skeleton.tsx` de cada feature (Fase 6). Lo compartido (`TableSkeleton`) sí entra acá.
- Las facetas en modo bulk de Preparte y Seguimiento (patrón deprecado, `datatable.md`): no se migran, porque el
  inventario dice "no se toca el comportamiento". El cuerpo de opciones nuevo sirve igual para bulk y para lazy.

---

## 2. Estado actual

### 2.1 Problemas de UI

- Header: la altura sale del botón de orden de cada `DataTableColumnHeader` (`h-8` + `-ml-3`,
  `DataTableColumnHeader.tsx:42-45`). El texto no está en mayúsculas ni en `text-overline`, y el ícono
  `ChevronsUpDown` aparece en **todas** las columnas ordenables (`:52-58`), incluidas las no ordenadas, lo que suma
  ruido en 39 columnas. El badge de multi-sort es `rounded-full bg-primary/15` (`:60-63`).
- Toolbar: GH en estado puro, con una fila de botones `border-dashed` (`DataTableFacetedFilter.tsx:122`,
  `DataTableTextFilter.tsx:96`, `DataTableDateRangeFilter.tsx:99`) y un `Separator` que abre una segunda fila
  (`DataTableToolbar.tsx:176-208`). No hay chips de filtros activos: el valor se ve **adentro** del botón (badges
  `rounded-sm`), y debajo de 640px solo como un número (`DataTableFacetedFilter.tsx:131-134`).
- Paginación: "Filas por página" + "Página X de Y" (`DataTablePagination.tsx:51,73`), rasgo de GH (`DISENO.md` §7).
  Dice "387 registros" pero no el rango visible. La selección se informa como "· 3 seleccionada(s)" (`:44`).
- Contenedor: `rounded-md border` (`DataTable.tsx:509`) y `space-y-4` entre toolbar, tabla y pie. Son tres cajas
  sueltas en vez de un panel.
- Vacío: una celda `h-24 text-center` con `emptyMessage` (`DataTable.tsx:541-545`). No distingue "sin datos" de
  "sin resultados para los filtros" y no tiene acción.
- Carga: en client-side mode con `data={[]}` de placeholder (los dialogs selectores, `DataTable.tsx:253-263`), la
  tabla muestra **"No se encontraron resultados"** mientras la primera consulta todavía corre: es un vacío que
  afirma algo falso (regla aprendida del 578). El refetch atenúa el cuerpo con `opacity-50` (`:526`) y no hay barra
  de progreso.
- Error: si la `queryFn` falla, no se muestra nada. La tabla sigue con `propData` (`:296`).
- Fila seleccionada: `data-[state=selected]:bg-muted` de `table.tsx:39`, sin la barra de acento de 2px.
- Acciones de fila: dependen del consumidor. No hay columna fija a la derecha, así que en tablas anchas el ⋯ queda
  fuera de la vista.

### 2.2 Accesibilidad

- Los botones de filtro, columnas y exportar no tienen `aria-label` cuando colapsan a ícono (`Excel` se oculta con
  `hidden sm:inline`, `_DataTableExportButton.tsx:86`, y queda un botón de solo ícono con nombre por tooltip).
- El contador de selección y el total no están en una región `role="status"`: el lector de pantalla no se entera
  de "3 seleccionadas" ni de que el filtro dejó 12 resultados.
- `aria-sort` no está en los `<th>`: el orden se ve solo por el ícono.
- El checkbox "Seleccionar fila" de los consumidores no dice **qué** fila (`EmployeeList/columns.tsx:189`). La
  tarjeta nueva corrige esto en mobile (§3.5); en desktop la celda es del consumidor (Fase 6).
- Las celdas truncadas de algunos consumidores no tienen forma de leer el texto completo con teclado. En mobile, el
  panel de detalle pasa a ser ese camino.

### 2.3 Responsive (el bloqueante de la Fase 1, `PLAN.md` §9)

- **Desborde horizontal a 375px en todas las páginas con DataTable.** Medido en la Fase 1 y en la ola 0 de la
  Fase 2. Causas en el código:
  1. Toolbar: el grupo derecho es `flex items-center space-x-2 shrink-0` (`DataTableToolbar.tsx:157`), con
     exportar + "Filtros" + "Columnas" + `toolbarActions` del consumidor, y **no puede achicarse ni hacer wrap**. El
     buscador es `w-[150px]` fijo (`:96`).
  2. Paginación: `flex items-center space-x-6` con "Filas por página" + select de 70px + "Página X de Y" con
     `w-[100px]` + 2 a 4 botones (`DataTablePagination.tsx:48-119`). Ocupa unos 480px y no hace wrap.
  3. Tabla: `min-w-fit` dentro de un `overflow-auto` (`DataTable.tsx:509-510`). El scroll queda contenido, pero el
     **min-content** de toolbar y paginación sube por los ancestros flex/grid que no tienen `min-w-0` y ensancha el
     layout viewport. En celular eso hace que los dialogs midan más que la pantalla (hallazgo de la Fase 1).
- La tabla en celular es scroll horizontal de 39 columnas: el rasgo de GH que `DISENO.md` §7 manda reemplazar.
- Los controles miden 32px también con `pointer: coarse` (por debajo de 44px).
- La tabla vive dentro de dialogs (`DailyAbsence`, `DepartmentSummary`, los selectores de partes diarios) donde el
  ancho útil es menor a 768px **aun en desktop**.

### 2.4 Rasgos de GH presentes (contra `DISENO.md` §7)

Fila de botones dashed por filtro · "Filas por página" + "Página X de Y" · filas de 40-48px (`TableCell` de
shadcn) · tabla con scroll horizontal en mobile · `rounded-md` en contenedor, badges y skeletons · header
`text-sm` en caja mixta. El header con color hardcodeado ya se arregló en la Fase 1 (`DataTable.tsx:518` → `bg-muted`).

### 2.5 Deuda de código

- `DataTable.tsx` tiene 561 líneas, por encima del límite de 400 (`AUDITORIA-UI.md` §2, S3). Mezcla orquestación
  (estado, React Query, persistencia) con markup de tabla.
- **`exceljs` entra al bundle de cliente de cada página con DataTable**: `_DataTableExportButton.tsx:9` importa
  `exportToExcel` de forma estática y `src/shared/lib/excel-export.ts:4` hace `import ExcelJS from 'exceljs'`. Esto
  viola `bundle-conditional` (CRÍTICO). Se corrige acá porque el archivo es del alcance (§4.5).
- **Bug previo, no se arregla** (va a §9 del PLAN): `DataTableFilterOptions.tsx:39-48`, al **ocultar** un filtro,
  borra el param **sin namespace** (`params.delete(columnId)`) y navega con `router.replace` **aun en
  client-side mode**. En una tabla con `paramNamespace`, el param `ns__columnId` queda en la URL, así que el filtro
  sigue aplicado pero ya no tiene chip a la vista. Además dispara una navegación de servidor en una tabla que
  promete no hacerlas. Es funcionamiento, no UI: se pregunta (§7, P-15).
- Bug previo menor: el vacío usa `colSpan={columns.length}` y no la cantidad de columnas visibles
  (`DataTable.tsx:542`). Es cosmético, así que se corrige solo porque el markup se reescribe (`DataTableStates`).
- `meta` está sin tipar: `DataTableViewOptions.tsx:24` castea `(column.columnDef.meta as { title?: string })` y
  `excel-export.ts:386-396` lee `meta.title`, `meta.excludeFromExport` y `meta.exportFormatter` sin tipo.
- `ColumnMeta` vacío hoy: TypeScript no hace chequeo de exceso de propiedades contra `{}`, así que un `meta: {
  tittle: 'x' }` compila. El tipado lo vuelve error (§6, riesgo R-3).
- 146 archivos importan del barrel `@/shared/components/common/DataTable` (`bundle-barrel-imports`). El barrel
  reexporta `exportToExcel`. Se mide en §4.5; no se reescriben 146 imports en esta fase.
- `useEffect` en `DataTable.tsx`: 5. Todos son sincronización con sistemas externos (notificar `onStateChange`,
  3 persistencias con debounce, reset por trigger externo) y se quedan como están (`no-useeffect.md` los admite).

### 2.6 Mediciones de partida (2026-10-08)

| Medición | Valor |
|---|---|
| `node scripts/ui/count-hardcoded-colors.mjs --path src/shared/components/common/DataTable` | **0** |
| `rounded-*` / `border-dashed` / `shadow` en `DataTable/*.tsx` | 16 ocurrencias |
| Archivos con `'use client'` en la carpeta | 13 de 16 |
| Archivos > 400 líneas | `DataTable.tsx` (561), `types.ts` (461), `helpers.ts` (459, no se toca) |
| `useEffect` | `DataTable.tsx` 5 · `useDataTable.ts` 2 · `DataTableTextFilter.tsx` 1 |
| Usos de `<DataTable` | 72 archivos · importadores del barrel: 146 |
| `data-testid` del DataTable usados por Cypress | ninguno directo. Cypress usa `cy.contains('tr', …)`, `tbody tr` (`daily-report-crud.cy.ts:226,267`) y testids **de celdas** del consumidor (`preparte.cy.ts:275`, `status-badge-*`). Viewport de Cypress: 1920×1080 (`cypress.config.ts:13`). |
| Conteo global de hardcodeados (última bitácora) | 2707 |

---

## 3. Diseño propuesto

### 3.1 `ColumnMeta` tipado y resolución de roles mobile

**Declaración** (en `types.ts`, que ya es un módulo incluido en el programa; la augmentation aplica a todo el repo):

```ts
declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Título legible: menú de columnas, cabecera del Excel, label de la tarjeta y del detalle. */
    title?: string;
    /** Columnas de UI (select, actions, imagen): fuera del Excel. */
    excludeFromExport?: boolean;
    /** Lo lee `excel-export.ts:396` (hoy sin tipo). */
    exportFormatter?: (value: unknown, row: TData) => string | number | null;
    /** Cómo se muestra la columna en la tarjeta mobile. Sin `mobile` en ninguna columna → heurística. */
    mobile?: DataTableColumnMobileMeta;
  }
}

export type DataTableMobileRole = 'title' | 'subtitle' | 'status' | 'field' | 'hidden';

export interface DataTableColumnMobileMeta {
  role: DataTableMobileRole;
  /** Menor = primero. Default: el orden de la columna en la tabla. */
  priority?: number;
  /** Label en tarjeta y detalle. Default: meta.title → header si es string → column.id. */
  label?: string;
  /** Solo el valor en la tarjeta (chips que se explican solos). En el detalle el label siempre va. */
  hideLabel?: boolean;
}
```

`TValue` se declara aunque no se use, porque TanStack lo exige en la firma de la interfaz. No va `:any`.

**Semántica de cada rol** (geometría de la tarjeta según `DISENO.md` §4.6):

| Rol | Dónde | Máximo | Regla |
|---|---|---|---|
| `title` | Fila 1, en línea, en orden de `priority` | 2 | Pensado para `[código] + nombre` (`file` + `fullName`, `domain` + `intern_number`). Si hay una columna `title` de más, baja a `field`. El texto plano de los `title` (`getValue()` → string) arma el nombre accesible de la tarjeta, del checkbox y del sheet. |
| `subtitle` | Fila 2, a la derecha del estado, `text-caption` muted, truncado | 1 | Es el "1 dato" de la fila 2. |
| `status` | Fila 2, a la izquierda | 1 | La celda se renderiza tal cual (badge del consumidor). |
| `field` | Fila 3, `dl` de pares label/valor en 2 columnas | 3 visibles | Los que superan los 3 (por `priority`) se ven solo en el detalle. |
| `hidden` | Solo en el panel de detalle | — | Default de toda columna sin `mobile` en una tabla **anotada**. |

Columnas estructurales, que no tienen rol:
- `select`: el checkbox lo dibuja la tarjeta (§3.5.2).
- `actions`: va al pie del panel de detalle.

Se reconocen por `id === 'select'` / `id === 'actions'`, que es la convención de las 72 tablas. Las columnas sin
`accessorFn` y con `meta.excludeFromExport`, como `preparteImage`, son de UI y van solo al detalle.

**Visibilidad (D2):** se resuelve sobre `table.getVisibleLeafColumns()`. Una columna que el usuario ocultó en
desktop no aparece ni en la tarjeta ni en el detalle, porque es el mismo estado y la misma preferencia guardada.
Si el usuario oculta la columna `title`, la tarjeta asciende al siguiente candidato (heurística) para no quedarse
sin título. El orden de columnas elegido (`enableColumnReorder`) define el orden de `field` cuando no hay
`priority`.

**Heurística por defecto** (tablas sin ningún `meta.mobile`: 63 de 72 hoy). Vive en `mobile-columns.ts` como
función pura, `resolveMobileLayout(visibleColumns)`:
1. Candidatas: columnas visibles, sin las estructurales, en el orden actual.
2. `title` = la primera candidata.
3. `status` = la primera candidata (≠ título) cuyo id en minúsculas sea `status`, `state` o `estado`.
4. `field` = las 3 candidatas siguientes, en orden.
5. El resto, `hidden` (en el detalle).

Es deliberadamente simple y predecible: mirando la tabla se adivina el resultado. Ninguna tabla queda rota sin
anotar, y las que se vean mal se anotan en la Fase 6 (lo exige el checklist C4 de la auditoría).

**Labels:** `mobile.label ?? meta.title ?? (typeof header === 'string' ? header : column.id)`. **No se agrega
`meta.title` donde falta** (por ejemplo `fullName`, `EmployeeList/columns.tsx:201`): `excel-export.ts:393` usa
`meta.title || key` como cabecera del Excel, y agregarlo cambiaría el archivo exportado. En esos casos el label va
en `mobile.label` (P-14).

### 3.2 El desborde a 375px: solución transversal (las 72 tablas, antes de anotar ninguna)

Se resuelve en el componente compartido, por capas, desde la ola 0 (§4.7). Ninguna tabla depende de estar anotada.

1. **Contención del ancho.** La raíz del DataTable pasa a ser el contenedor `@container/table` (`container-type:
   inline-size`). Con containment de tamaño inline, **el min-content de la raíz deja de depender de su contenido**:
   ni la toolbar, ni la paginación, ni una tabla de 39 columnas pueden empujar a los ancestros flex/grid. Esto corta
   la causa 3 de §2.3 en todas las tablas a la vez. La raíz lleva `w-full min-w-0`. Un elemento con containment
   inline toma el ancho de su padre, y como flex item de fila sin `w-full` colapsaría a 0 (advertencia de
   `jakubkrehel/better-layout`; riesgo R-1).
2. **Recorte de seguridad.** `overflow-x-clip` en la raíz. `clip` no crea contenedor de scroll, así que no rompe el
   `sticky` del header ni el de la barra de selección (a diferencia de `overflow-hidden`), y evita que lo que todavía
   desborde engorde el `scrollWidth` del documento. Para no recortar el outline de foco de 2px en los bordes:
   `[overflow-clip-margin:2px]`.
3. **Reflujo de toolbar y pie** (sin esta capa, la 2 escondería controles en vez de acomodarlos):
   - **Toolbar**: un solo DOM.
     - Debajo de `@3xl/table`: buscador a ancho completo en la fila 1; "Filtros (n)", "Ordenar" y ⋯ en la fila 2.
       Los triggers de filtro, columnas, exportar y "Mostrar filtros" quedan `hidden` y pasan al sheet o al ⋯
       (§3.4, §3.5).
     - Desde `@3xl/table`: una fila con `flex-wrap`. El grupo izquierdo es `min-w-0 flex-1` y el derecho hace wrap,
       **sin `shrink-0` sobre un grupo entero**.
   - **`toolbarActions`** del consumidor ("Agregar empleado", etc.): van en su propio `flex flex-wrap gap-2 min-w-0`,
     en las dos vistas. En mobile se ubican en la fila 2, a la derecha, y hacen wrap a una fila 3 si no entran. No
     van al ⋯: son nodos arbitrarios, y dentro de un menú perderían los dialogs que abren (mismo motivo que §3.5.3).
   - **Pie**: un solo DOM.
     - Debajo de `@3xl/table`: "‹ 1–50 de 387 ›" centrado, con botones de 44px y sin select de filas por página
       (pasa al ⋯).
     - Desde `@3xl/table`: el pie completo de `DISENO.md` §4.6.
4. **Scroll horizontal de la tabla en desktop y fade de `SimpleTable`** (pendiente A-15 de la Fase 2). El scroll
   queda **dentro** del panel. La sombra de borde de `DISENO.md` no puede ser una `mask-image` sobre el scroller,
   porque enmascararía la columna `actions` fija a la derecha (el mismo problema que tiene `SimpleTable` con su
   primera columna fija). Propuesta (P-13):
   - `globals.css`: agregar `scroll-fade-start` (fade solo a la izquierda) y `scroll-fade-end` (solo a la
     derecha), con el mismo `@property`, la misma scroll-driven animation y el mismo `@supports` que
     `scroll-fade-x`.
   - DataTable: `scroll-fade-start` en el borde izquierdo. La columna `actions` es `sticky right-0 bg-card` con
     `shadow-[inset_1px_0_0_var(--border)]`; esa hairline indica que hay más contenido a la derecha.
   - `SimpleTable`: `scroll-fade-end`, porque su columna fija está a la izquierda. Es una clase en
     `SimpleTable.tsx:325`, archivo compartido de la Fase 2, y la cambia el mismo agente de la ola 0.
5. **Verificación** en los 72 usos: `document.documentElement.scrollWidth <= innerWidth` a 375px, a 320px y con zoom
   de 200%. El barrido se puede automatizar (§8.3).

### 3.3 Desktop (contenedor ≥ `@3xl/table`, 768px)

```
<section data-slot="data-table" data-testid={dataTestId}
         class="@container/table w-full min-w-0 overflow-x-clip bg-card border border-border">
  [Toolbar h-12 px-3 border-b]  ← o la SelectionBar en el mismo lugar (con selección y selectionActions)
  [Barra de progreso de 2px, solo en refetch]
  [Scroller: overflow-auto max-h-[60dvh] scroll-pt-8 scroll-fade-start]
     <table> header sticky h-8 · filas h-9 · columna actions sticky right-0 </table>
  [Pie h-11 px-3 border-t bg-panel-2]
  [<p role="status" class="sr-only">, siempre montado]
</section>
```

- **Contenedor.** El DataTable trae su propio borde (`bg-card border border-border`, sin radio ni sombra), así que
  deja de necesitar el `<Card><CardContent className="pt-6">` del consumidor. **Hasta la Fase 6 los consumidores
  siguen envueltos en `Card`.** Para evitar doble borde, la raíz omite el suyo cuando su padre ya es un panel. Se
  resuelve en CSS, sin JS: `in-data-[slot=card-content]:border-0` o el equivalente del `Panel` de la Fase 2. Antes de
  escribir la clase hay que verificar el `data-slot` real de `card.tsx` y de `panel.tsx` (R-2). El `pt-6` del
  `CardContent` sigue hasta la Fase 6 y deja aire arriba. Se acepta: cada módulo lo cambia por `Panel p-0` al
  migrarse (`DISENO.md` §4.3).
- **Toolbar** (`h-12 px-3 flex items-center gap-2 border-b`; si hace wrap, `min-h-12 py-2`):
  - **Buscador** (grupo izquierdo): `h-8 w-64 max-w-full`, ícono `Search` a la izquierda, `type="search"`,
    `text-base md:text-sm` (evita el zoom de iOS) y `data-testid="search-input"`. Se muestra solo con `showSearch`,
    igual que hoy. **Sin el hint `Ctrl K`** (P-3).
  - **Filtros visibles** según `filterVisibility` (manda la preferencia guardada; por defecto son 3):
    - Inactivo: botón `secondary sm` con el título y un chevron de 12px, sin `border-dashed` ni `PlusCircle`.
      Conserva `data-testid="filter-<columnId>"` en los facetados.
    - Activo: **chip** `h-7 border border-input bg-card px-2 text-caption whitespace-nowrap`. Muestra `Título:` en
      muted, el valor en `text-foreground` (truncado a ~16ch con `title`), "+2" en `tabular-nums` si hay más
      valores, y una ✕ (`aria-label="Quitar filtro <Título>"`) que lo limpia. Un clic en el cuerpo del chip abre su
      popover. En fechas el valor es "12/08–30/09" (moment `DD/MM`, como hoy); en texto, lo tipeado.
    - Si las opciones de un facetado todavía no cargaron (recarga con el filtro en la URL), el chip muestra el
      skeleton de una línea que ya existe (`DataTableFacetedFilter.tsx:139-142`), con la geometría nueva.
  - **Chip de orden**: "Orden: Fecha ↓ ×", o "Orden (2) ×" con multi-sort. Conserva
    `data-testid="clear-sorting"`. Se muestra con la condición de hoy (`isSorted`, `DataTableToolbar.tsx:123`), sin
    cambiar cuándo aparece.
  - **"Limpiar filtros"**: `ghost sm`, visible con `isFiltered` como hoy. Conserva `data-testid="clear-filters"`.
  - **Derecha:**
    - **"Filtros (n)"** (`secondary sm`). `n` cuenta los filtros activos, incluidos los de fecha y los de
      columnas ocultas, en `tabular-nums`; con 0 se lee "Filtros", nunca "(0)". Abre el menú "Mostrar filtros" de
      hoy (`DataTableFilterOptions`), con el mismo `saveTableFilterVisibility`, y suma "Limpiar filtros" al pie
      del menú. Se ve solo cuando hoy se vería (`showFilterToggle && tableId && facetedFilters.length > 0`) (P-1).
    - **"Columnas"** (`secondary sm`, ícono `Columns3`, `data-testid="column-toggle"`). Sin `hidden lg:flex`.
    - **"Exportar"** (`secondary sm`, ícono `Download`). Mientras exporta muestra "Exportando…" con `aria-busy`.
      Mismo tooltip: "Exportar todos los datos filtrados a Excel".
    - **`toolbarActions`** al final. Si el consumidor trae una `primary`, es la única de la vista.
  - **Densidad 32/36: no se agrega** (P-2).
- **Popovers de filtro** (`DISENO.md` §4.6):
  - Facetado: `w-64 p-0`, buscador `h-9 border-b` (`CommandInput`), ítems `h-8` con checkbox cuadrado de 16px,
    label (con ícono si la opción lo trae) y count `font-mono text-caption tabular-nums` a la derecha. Hoy el count
    tiene `w-4` fijo y se corta desde 3 dígitos (`DataTableFacetedFilter.tsx:197`).
  - "Limpiar filtros" al pie, con `data-testid="filter-clear-<col>"`; cada ítem conserva `filter-option-<value>`.
  - Los cuerpos de texto (input + "Aplicar") y de fechas (los dos `Calendar` de hoy) se extraen sin cambiar la
    lógica; solo cambia la piel. En el rango no se agrega escritura directa: no está pedido y `date-pickers.md`
    excluye los rangos.
- **Header**:
  - `TableHead`: `sticky top-0 z-10 h-8 bg-muted px-3 text-overline text-muted-foreground border-b
    border-border-strong whitespace-nowrap`, con `aria-sort="ascending|descending"` en la columna ordenada (`none`
    no se escribe).
  - `DataTableColumnHeader`: botón `ghost` de alto completo, sin `-ml-3`, en `text-overline`.
  - Flecha de 12px (`ArrowUp`/`ArrowDown`) **solo en la columna ordenada**. Las demás no muestran ícono en reposo;
    en hover o foco aparece un `ChevronsUpDown` de 12px (`group-hover`/`group-focus-visible`) para que se vea que se
    puede ordenar.
  - El índice de multi-sort pasa a un cuadrado `font-mono text-[10px] tabular-nums`.
  - El menú (Ascendente, Descendente, Agregar al ordenamiento, Sin ordenar, Ocultar) no cambia y conserva todos sus
    `data-testid`.
- **Filas**: las clases van en `DataTableDesktop` y **no en `table.tsx`**, que lo usan otros 27 archivos.
  - Base: `h-9 border-b border-border text-cell`, celdas `px-3 py-0 align-middle`, hover `hover:bg-accent/60` sin
    transición. `h-9` es un mínimo: si la celda de un consumidor tiene 2 líneas, la fila crece y no se recorta.
  - Seleccionada: `data-[state=selected]:bg-primary-soft shadow-[inset_2px_0_0_var(--primary)]`. Se conservan
    `data-state="selected"` y `data-testid="table-row-<id>"`.
  - `rowClassName` del consumidor se sigue aplicando (`_DailyReportDetailDataTable.tsx:681`).
- **Columna `actions`**: `sticky right-0 bg-card` (en la fila seleccionada, `bg-primary-soft`) con la hairline
  izquierda. El contenido es del consumidor y no cambia.
- **`scroll-pt-8`** en el scroller, para que una fila enfocada con Tab no quede debajo del header sticky
  (WCAG 2.4.11).
- **Pie** (`h-11 px-3 border-t bg-panel-2 text-caption tabular-nums flex items-center justify-between gap-3`):
  - Izquierda: "**1–50** de **387**" (raya corta U+2013); con 0 filas, "0 resultados". Con `showRowSelection` y
    selección se agrega " · 3 seleccionados", con el plural correcto ("1 seleccionado") y sin "(s)".
  - Derecha:
    - Select "50 / pág." (`h-7`, `data-testid="page-size-select"`, mismas `pageSizeOptions`).
    - `‹`, números de página compactos (`1 2 … 8`, ventana de 5; la actual con `aria-current="page"`) y `›`.
    - Los 4 botones de hoy conservan sus testids (`pagination-first`/`-prev`/`-next`/`-last`). Primera y última
      (hoy `hidden lg:flex`) pasan a `«`/`»` y se ocultan bajo `@5xl/table`.
  - Se eliminan "Filas por página" y "Página X de Y".
- **Estados** (`DataTableStates.tsx`; dentro del `<tbody>` con `colSpan` = columnas visibles, o dentro de la lista
  de tarjetas):
  - **Carga inicial** (`isRemoteQuery && !queryResult && isFetching && !hasRealInitialData`, los dialogs que pasan
    `data={[]}` de placeholder). Hoy se ve "No se encontraron resultados"; pasa a un skeleton de 10 filas de 36px
    (`bg-muted animate-pulse motion-reduce:animate-none`, sin radio). **Es el único cambio en lo que se ve sin cambio
    de datos, y corrige un vacío falso** (anotado en §5).
  - **Refetch** (`isPlaceholderData`):
    - Los datos anteriores se ven a `opacity-60` y con `pointer-events-none`, como hoy (`DataTable.tsx:526`), para
      que no se pueda hacer clic sobre datos viejos (P-16).
    - Debajo del header aparece una barra indeterminada de 2px en `--primary` (estática con `motion-reduce:`),
      `role="progressbar"` y `aria-label="Actualizando"`.
  - **Vacío sin filtros**: `EmptyState variant="empty" size="default"`, con `title={emptyMessage}` (el texto de cada
    tabla se conserva) y sin descripción. No se inventa un "por qué" genérico: la condición real la conoce el
    consumidor (regla del 578). Se agrega la prop opcional `emptyDescription` para la Fase 6.
  - **Vacío con filtros o búsqueda** (`hasActiveFilters || state.search`): `EmptyState variant="filtered"`, título
    "Sin resultados para los filtros aplicados" y acción "Limpiar filtros" (`resetFilters`).
  - **Error** (`isError` de `useQuery`): callout `danger` en el cuerpo con "No se pudieron cargar los datos." y
    "Reintentar" (`refetch()`). Si había datos, se siguen viendo y el callout va arriba. `role="alert"`, sin
    autocierre. Hoy el error es silencioso; esto es UI y no cambia datos.
- **Live region**: `<p role="status" class="sr-only">` siempre montado en la raíz. Anuncia "387 resultados" cuando
  cambia el total y "3 seleccionados" cuando cambia la selección. Nunca `{n && <div role=status>}`.

### 3.4 Mobile (contenedor < `@3xl/table`)

**El cambio de layout es por container query, en CSS.**
- `DataTableDesktop` lleva `hidden @3xl/table:block` y `DataTableCards` lleva `@3xl/table:hidden`.
- Las dos vistas se renderizan desde el servidor con las mismas filas. El servidor no conoce el ancho; así no hay
  salto al hidratar (`rendering-hydration-no-flicker`) ni hace falta `useIsMobile`.
- Costo: el DOM se duplica para una página (≤ 50 filas por defecto, ≤ 100 si el usuario elige 100). Se mitiga con
  `content-visibility: auto` en tarjetas (`[contain-intrinsic-size:auto_120px]`) y filas
  (`[contain-intrinsic-size:auto_36px]`). Se mide en Empleados con 100 filas (§6, R-5). Si la medición da mal,
  hay alternativa (P-12).

**Orden del DOM: primero la tabla, después las tarjetas.** `cy.contains('<texto>')` sin selector se queda con el
primer elemento del documento. Si las tarjetas fueran primero, Cypress (que corre a 1920px) tomaría un elemento
oculto.

**Estructura mobile:**

```
<section @container/table>
  Fila 1: [buscador h-11 w-full, text-base]
  Fila 2: [Filtros (n)] [Ordenar: Fecha ↓] ··· [toolbarActions] [⋯]
  [chips de filtros activos: scroll horizontal con scroll-fade-x, h-9] (solo si hay alguno)
  <ul> tarjetas </ul>
  [‹ 1–50 de 387 ›]
  [Barra de selección sticky bottom-0] (si hay selección)
</section>
```

- Los chips de filtros activos también se ven en mobile: son la única forma de saber que la lista está filtrada
  sin abrir el sheet. La ✕ de cada chip tiene 44px de hit area con `pointer: coarse`.
- **⋯ (`DataTableMoreMenu`)**: `DropdownMenu` con `aria-label="Más opciones de la tabla"`. Opciones:
  - "Columnas…": abre un `ResponsiveDialog` con la lista de visibilidad, o con las flechas de `ColumnOrderOptions`
    si la tabla tiene `enableColumnReorder`.
  - "Exportar a Excel": mismo handler, mismo toast.
  - "Filas por página": submenú de radio con las `pageSizeOptions`.
  - "Mostrar filtros…": solo si existe `DataTableFilterOptions`.

  Lo que hoy no existe en una tabla tampoco aparece acá (por ejemplo, sin `exportConfig` no hay "Exportar").

### 3.5 Componentes mobile

#### 3.5.1 `DataTableCards` + `DataTableCard`

- **Lista y tarjeta.** `<ul role="list" class="divide-y divide-border">`, un `<li>` por fila.
  - Clases de la tarjeta: `relative grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 px-4 py-3
    [content-visibility:auto] [contain-intrinsic-size:auto_120px]`.
  - Seleccionada: `bg-primary-soft shadow-[inset_2px_0_0_var(--primary)]`. También aplica `rowClassName` del
    consumidor.
  - `data-testid="table-card-<rowId>"` es **nuevo**: no reusa `table-row-*`, para no duplicar testids.
- **Fila 1**: checkbox (si corresponde, §3.5.2) · título · botón de detalle.
  - Título: las celdas `title` con `flexRender`, en línea (`flex min-w-0 items-baseline gap-2`), con `line-clamp-2`
    en el bloque y `break-words`. Como se reusa la celda, un código mono del consumidor sigue en mono.
  - Botón de detalle: `ghost icon`, 44×44 con `pointer-coarse`, ícono `ChevronRight`,
    `aria-label="Ver detalle de «<texto del título>»"` y `aria-haspopup="dialog"`. **Es el disparador accesible de
    la tarjeta** (`jakubkrehel/better-accessibility`: nada de interactivos anidados) (P-4).
- **Fila 2** (`col-start-2`): celda `status` y `subtitle` en caption muted, truncado.
- **Fila 3** (`col-start-2 col-span-2`): `<dl class="grid grid-cols-2 gap-x-4 gap-y-1">` con hasta 3 pares.
  - Cada par: `<div class="min-w-0"><dt class="text-caption text-muted-foreground truncate">Label</dt><dd
    class="text-cell min-w-0 break-words">celda</dd></div>`. Con `hideLabel`, el `dt` va `sr-only`.
  - Las celdas se renderizan **tal cual**: si la celda del consumidor muestra "Sin asignar" o "—" para un nulo,
    eso es lo que se ve. Los pares nulos no se omiten, porque una cantidad de pares distinta en cada tarjeta rompe
    la lectura vertical.
- **Clic en la tarjeta**: un `onClick` en el `<li>` abre el detalle, **salvo** que el clic venga de un elemento
  interactivo (`target.closest('a,button,input,label,[role="checkbox"],[role="menuitem"]')`).
  - Es una comodidad para el puntero; el equivalente accesible es el botón de detalle (patrón de fila clickeable
    con botón explícito).
  - Así los links de una celda siguen funcionando con un toque: el nombre del empleado enlaza a la ficha
    (`inventario/empleados.md:43`).
  - `touch-action: manipulation` y `active:bg-accent` (100ms).
- **Paradas de Tab por tarjeta**: checkbox → controles propios de las celdas del consumidor (si los hay, igual que
  hoy en la fila) → botón de detalle.
- **Render**: `memo(DataTableCard)`, definido a nivel de módulo (`rerender-no-inline-components`). Props:
  - `row`, `isSelected` (booleano) y `canSelect`.
  - `layout`: el resultado de `resolveMobileLayout`, memoizado por la lista de columnas visibles.
  - `onOpenDetail`: estable, con `useCallback` + setState funcional.
- **Skeleton de tarjetas**: 6 tarjetas con la geometría real (línea de título de 16px al 60%, badge de 20×64,
  2 pares). Aparece en el mismo caso que el skeleton de filas (§3.3, carga inicial).

#### 3.5.2 Selección en tarjetas

- La tarjeta muestra su checkbox cuando la tabla tiene selección **visible**, es decir, cuando existe la columna
  `select` y está visible. Así se respeta a los consumidores que hoy habilitan selección sin dibujarla.
- **El checkbox es propio de la tarjeta.** No reusa la celda `select` del consumidor, que dice "Seleccionar fila"
  sin nombre.
  - Se conecta a `row.getIsSelected()`, `row.toggleSelected()` y `row.getCanSelect()`, así respeta la selección
    condicional de Preparte (`row.original.status`).
  - `aria-label="Seleccionar «<título>»"`; 16px visibles y 44px de hit area por pseudo-elemento.
- **Siempre visible** cuando la tabla tiene selección, sin long-press ni modo "Seleccionar" (P-5).
- La lista de tarjetas no tiene "seleccionar todos". La barra de selección trae "Seleccionar página"
  (`table.toggleAllPageRowsSelected`), que hace lo mismo que el checkbox del header hoy.

#### 3.5.3 `DataTableDetailSheet`

- **Estado**: `detailRowId: string | null` en `DataTable`. La fila se **deriva** en el render:
  `open = detailRowId !== null && rowsById.has(detailRowId)`. Si la fila desaparece (una acción del sheet la borró
  o la sacó del filtro), el sheet se cierra solo, sin `useEffect`.
- **Superficie**: `ResponsiveDialog layout="sheet" size="md"`, que es un sheet derecho de 480px con viewport
  desktop y un bottom sheet en mobile (`DISENO.md` §4.7, "Detalle de registro"). Se reusa el primitivo de la
  Fase 2 sin tocarlo.
  - `title`: texto del título de la tarjeta (los `title` como string). En el header se renderizan además las celdas
    `title` y `status`, para conservar el mono y el badge.
  - Cuerpo: un `<dl>` con **todas** las columnas visibles no estructurales, en el orden de la tabla y en 1 columna.
    Label `text-caption muted` arriba, valor `text-cell break-words` abajo, `gap-3`. Los nulos se renderizan tal
    cual. Las celdas interactivas (links, la foto que abre un dialog) funcionan acá.
  - Footer (el de `ResponsiveDialog`, que ya trae safe-area): la celda `actions` con `flexRender`, tal cual. Sin
    columna `actions` no hay footer.
- **Dentro de un dialog** (el DataTable está dentro de `[role="dialog"]`): no se abre un sheet, porque sería un
  modal sobre otro modal (regla "nunca encadenar modales").
  - El botón de detalle pasa a ser un disclosure (`aria-expanded`) que expande el mismo `dl` y las acciones
    **dentro de la tarjeta**.
  - La detección se hace en el evento, no en el render (`event.currentTarget.closest('[role="dialog"]')`), así que
    no hay salto de hidratación.
  - Hoy esos dialogs no usan `ResponsiveDialog`, por eso no alcanza con leer su contexto (P-10).
- **Acciones del consumidor dentro del sheet.** Los dialogs que abre una celda (en Preparte: confirmar con nombre,
  eliminar) quedan **anidados en el sheet**.
  - Radix y vaul anidan bien si el dialog es hijo del sheet en el árbol de React, y lo es, porque la celda se
    renderiza dentro del sheet.
  - El mismo caso se resolvió en la Fase 2 con `SearchSelect` dentro de un drawer.
  - Se verifica en el Checkpoint 3 con Preparte (R-6).
- **Celda duplicada.** En un celular, mientras el sheet está abierto, la celda `actions` existe dos veces: en la
  fila oculta de la tabla y en el sheet. Solo una es visible, y solo pasa a 375px. Cypress corre a 1920px y nunca
  abre el sheet.

#### 3.5.4 `DataTableSelectionBar`

- **Prop nueva, opt-in** (regla aprendida: "el mecanismo va al shared, la activación es opt-in"):
  `selectionActions?: (ctx: { selectedIds: string[]; selectedRows: TData[]; clear: () => void }) => React.ReactNode`.
  - `selectedRows`: las filas seleccionadas de la página actual, igual que el `onRowSelectionChange` de hoy
    (`DataTable.tsx:347-364`).
  - `selectedIds`: incluye las de otras páginas.
- **Desktop.** Con selección > 0 **y** `selectionActions`, la barra reemplaza a la toolbar en el mismo lugar y con
  el mismo alto, sin salto.
  - Estilo: `bg-primary-soft border-b h-12 px-3`.
  - Contenido: "**3** seleccionados" (`tabular-nums`) · "Seleccionar página" · acciones del consumidor · "Limpiar
    selección" (`ghost`).
  - Foco: al aparecer la barra **no se mueve** (sigue en el checkbox que se tildó). Si el elemento enfocado era de
    la toolbar y desaparece, el foco pasa a "Limpiar selección".
  - **Sin `selectionActions`, la toolbar no se reemplaza** (P-8): si se reemplazara, los `toolbarActions` como
    "Agregar empleado" desaparecerían al tildar una fila. En ese caso el conteo sigue en el pie, como hoy.
- **Mobile.** `sticky bottom-0 z-30 bg-card border-t px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]`,
  dentro de la raíz del DataTable.
  - Con `selectionActions`: "3 seleccionados", hasta 2 acciones visibles del consumidor y "Limpiar".
  - Sin `selectionActions`: "3 seleccionados" y "Limpiar".
  - Va **sticky, no `fixed`** (P-6): así funciona igual dentro de un dialog y en páginas con varias tablas, donde
    varias barras fijas se pisarían.
  - El toast ya está en `top-center` en mobile (`sonner.tsx:72-75`), así que no se superponen.
- **"Seleccionar los 387"** (`DISENO.md` §4.6) **no se implementa**: hoy no existe y obliga a traer todos los ids
  del servidor, o sea que es funcionalidad nueva (P-7).
- `clearSelectionTrigger`, `onRowSelectionChange` y `onRowSelectionIdsChange` no cambian. "Limpiar selección" llama
  al mismo `setRowSelection({})` y dispara los callbacks igual que destildar a mano.

#### 3.5.5 `DataTableMobileFilters` (con "Ordenar por")

- **Disparadores**, en la fila 2 de la toolbar mobile: "Filtros (n)" y "Ordenar: <columna> ↑" ("Ordenar" si no
  hay orden).
  - Los dos abren el mismo `ResponsiveDialog`: bottom sheet `max-h-[85dvh]` con título "Filtros". En desktop no se
    usa.
  - "Ordenar" abre el sheet con scroll a su sección.
- **Cuerpo, sección 1: Ordenar por.**
  - `RadioGroup` con las columnas que tienen `getCanSort()` (label según §3.1) y segmented "Ascendente /
    Descendente" (`ToggleGroup type="single"`, existe en `ui/toggle-group.tsx`).
  - Elegir hace `table.setSorting([{ id, desc }])`, lo mismo que un clic normal en el header.
  - Si hay un multi-sort activo, la sección lo lista ("1. Fecha ↓ · 2. Cliente ↑") con "Quitar orden"
    (`table.resetSorting()`). Desde mobile no se **arma** un multi-sort nuevo; sigue disponible en desktop (P-17).
- **Cuerpo, sección 2: Filtros.**
  - `Accordion type="multiple"` con **todos** los filtros configurados, incluidos los que el usuario ocultó en
    desktop: en el sheet sobra espacio y ocultarlos sería perder funcionalidad.
  - Los que tienen valor van primero y abiertos.
  - Cada ítem usa el **mismo cuerpo** que el popover desktop (`FacetOptionsList`, `TextFilterBody`,
    `DateRangeFilterBody`), a ancho completo, con ítems de 44px e input a 16px.
  - Las facetas lazy se piden **al abrir el acordeón**, con el mismo `queryKey` que el popover, así que comparten
    caché.
- **Aplicación inmediata** (P-9). Cada cambio escribe la URL al instante, como en desktop, y la lista de fondo se
  actualiza.
  - Footer fijo (el de `ResponsiveDialog`): "Limpiar" (`secondary`, `resetFilters`) y "Ver 120 resultados"
    (`primary`, cierra el sheet).
  - El número sale del `tableTotalRows`/`displayedTotalRows` que ya existe, sin una consulta nueva de
    "previsualización".
  - Durante un refetch el botón dice "Ver resultados", sin número, con `aria-busy`.
- El filtro de texto mantiene su "Aplicar"/Enter. No se aplica mientras se tipea (hoy tampoco).

#### 3.5.6 Paginación compacta

- "‹ **1–50** de **387** ›" centrado.
- Botones `ghost` de 44×44 con `aria-label` "Página anterior" y "Página siguiente". Son el mismo DOM que en
  desktop, así que conservan los mismos `data-testid`.
- Rango en `tabular-nums` dentro de un `aria-live="polite"`.
- Sin números de página ni select (el select pasa al ⋯).

### 3.6 `meta.mobile` de las 9 tablas anchas

Criterio:
- **Título**: cómo identifica el usuario el registro (legajo, dominio/interno, número de pedido o de comprobante;
  `employee-file-number.md`).
- **Estado**: el badge que decide qué hacer.
- **Subtítulo**: el dato que distingue dos registros parecidos.
- **3 campos**: lo que se mira para decidir sin abrir el detalle.

El resto de las columnas queda `hidden` y se ve en el detalle. En cada `columns.tsx` se agrega **solo**
`meta.mobile`. Un "—" en `label` significa que se usa el label por defecto (entre paréntesis, cuál es).

**1. Empleados** — `Employees/Empleados/EmployeeList/columns.tsx` (activos e inactivos usan el mismo archivo)

| columnId | role | priority | label |
|---|---|---|---|
| `file` | title | 1 | — (Legajo) |
| `fullName` | title | 2 | `Nombre completo` (no tiene `meta.title`, P-14) |
| `status` | status | — | — |
| `company_positions` | subtitle | — | — (Puesto) |
| `termination_date` (si existe; solo inactivos) | field | 0 | `Baja` |
| `hierarchy` | field | 1 | — (Sector) |
| `contractor_employee` | field | 2 | `Afectaciones` (hoy sin `meta.title`) |
| `date_of_admission` | field | 3 | `Ingreso` |

**2. Vehículos** — `Equipos/Equipos/VehicleList/columns.tsx`

| columnId | role | priority | label |
|---|---|---|---|
| `domain` | title | 1 | — |
| `intern_number` | title | 2 | — |
| `status` | status | — | — |
| `type` | subtitle | — | — |
| `condition` | field | 1 | — |
| `contractor_equipment` | field | 2 | — (Afectaciones) |
| `kilometer` | field | 3 | `Km` |

**3. Equipamiento (otros equipos)** — `Equipos/OtherEquipment/list/columns.tsx`

| columnId | role | priority | label |
|---|---|---|---|
| `intern_number` | title | 1 | — |
| `serial_number` | title | 2 | — |
| `status` | status | — | — |
| `type` | subtitle | — | — |
| `condition` | field | 1 | — |
| `contractor_other_equipment` | field | 2 | — (Afectaciones) |
| `linked_vehicle` | field | 3 | — (Vinculado a) |

**4. Vehículos dados de baja** — `Equipos/Equipos/DadosDeBaja/Vehiculos/components/columns.tsx`

| columnId | role | priority | label |
|---|---|---|---|
| `domain` | title | 1 | — |
| `intern_number` | title | 2 | — |
| `status` | status | — | — |
| `type` | subtitle | — | — |
| `termination_date` | field | 1 | `Baja` |
| `reason_for_termination` | field | 2 | `Motivo` |
| `condition` | field | 3 | — |

**5. Equipamiento dado de baja** — `Equipos/Equipos/DadosDeBaja/OtrosEquipos/components/columns.tsx`

| columnId | role | priority | label |
|---|---|---|---|
| `intern_number` | title | 1 | — |
| `serial_number` | title | 2 | — |
| `status` | status | — | — |
| `type` | subtitle | — | — |
| `termination_date` | field | 1 | `Baja` |
| `reason_for_termination` | field | 2 | `Motivo` |
| `linked_vehicle` | field | 3 | — |

**6. Gestor de Pedidos (Preparte)** — `Operaciones/Preparte/list/columns.tsx`

| columnId | role | priority | label |
|---|---|---|---|
| `numero_pedido` | title | 1 | — (N° pedido) |
| `customer` | title | 2 | — (Cliente) |
| `status` | status | — | — (la celda tiene `data-testid="status-badge-*"`; queda duplicada y la copia oculta va **después** en el DOM, R-4) |
| `service` | subtitle | — | — (Contrato) |
| `executionDate` | field | 1 | `Ejecución` |
| `serviceItem` | field | 2 | — (Ítem) |
| `quantity` | field | 3 | — (Cantidad) |

`preparteImage` es una columna de UI y va solo al detalle.

**7. Documentos de equipos · Permanentes** — `Documentacion/DocumentosEquipos/Permanentes/columns.tsx` (también se
monta en Equipos → Documentos y en la ficha del equipo, `inventario/README.md`)

| columnId | role | priority | label |
|---|---|---|---|
| `vehicle` | title | 1 | — (Equipo) |
| `state` | status | — | — |
| `document_type` | subtitle | — | — (Documento) |
| `validity` | field | 1 | — (Vencimiento) |
| `contractor` | field | 2 | — (Afectado a) |
| `created_at` | field | 3 | — (Subido el) |

**8. Tipos de documentos · Personas** — `Documentacion/TiposDocumentos/PersonasList/columns.tsx` (si `EquiposList`
tiene un archivo propio, mismo criterio con `equipment_type` como subtítulo)

| columnId | role | priority | label |
|---|---|---|---|
| `name` | title | 1 | — |
| `is_active` | status | — | — (Estado) |
| `mandatory` | field | 1 | — |
| `explired` | field | 2 | — (Con vencimiento) |
| `special` | field | 3 | — (Condicional) |

**9. Facturación** — `Comercial/Facturacion/list/columns.tsx`

| columnId | role | priority | label |
|---|---|---|---|
| `cbte_type` | title | 1 | — (Tipo) |
| `voucher_number` | title | 2 | — (Número) |
| `status` | status | — | — |
| `customer` | subtitle | — | — |
| `total` | field | 1 | — (en la tarjeta el importe va en mono y `tabular-nums`) |
| `issue_date` | field | 2 | `Emisión` |
| `cae` | field | 3 | — |

Si al anotar `table-expert` encuentra un `columnId` con otro nombre, usa el real y lo deja en el progreso. Si la
columna no existe en el archivo, no la anota ni la crea.

### 3.7 Prop de escape `mobileLayout="table"`

- **Prop**: `mobileLayout?: 'cards' | 'table'`, default `'cards'`.
- **Efecto**: con `'table'` no se renderiza `DataTableCards` y `DataTableDesktop` no lleva `hidden`, así que la tabla
  queda con scroll horizontal dentro del panel en cualquier ancho. La toolbar y el pie **siguen reacomodándose**
  por container query: el escape cambia el cuerpo, no el desborde, que ya quedó resuelto para todas en §3.2.
- **Para qué**: grillas donde comparar por columna **es** la tarea. Por ejemplo, una matriz de días, o una tabla de
  selección dentro de un dialog donde se tilda en la misma fila.
- **Deuda**: cada uso se anota en `PLAN.md` §9 con archivo y motivo. **En la Fase 3 ninguna tabla lo usa.**

### 3.8 `DOCS.md`

Secciones nuevas o reescritas (las escribe `table-expert` en la ola 2):
1. **Modo mobile (tarjetas)**: cómo se decide (`@container/table`, 768px de contenedor) y qué muestran la tarjeta,
   el panel de detalle, los filtros, ordenar, el ⋯ y la selección. Incluye la regla "lo que hoy existe en desktop
   tiene lugar en mobile".
2. **`meta.mobile`**: tipo, roles, heurística por defecto y ejemplo con Empleados. Incluye la regla: si falta
   `meta.title` y agregarlo cambiaría la cabecera del Excel, usar `mobile.label`.
3. **`mobileLayout`**: cuándo usarlo y la obligación de anotarlo en `PLAN.md` §9.
4. **`selectionActions`**: firma, opt-in, y por qué sin ella la toolbar no se reemplaza.
5. **Estados**: carga inicial, refetch, vacío, filtrado y error. `emptyMessage` sigue siendo el título del vacío.
6. **"Card wrapper obligatorio"** (`DOCS.md:823`) pasa a "El DataTable trae su propio borde. Dentro de un `Panel`,
   `p-0`". La regla `.claude/rules/datatable.md` **no** se toca: se actualiza en la Fase 9 con aprobación
   (`PLAN.md` §4). Mientras tanto, el `Card` de los consumidores sigue siendo válido (§3.3, borde omitido).
7. **Tablas de props y de componentes**: `mobileLayout`, `selectionActions`, `emptyDescription` y los componentes
   nuevos.
8. **Testids**: la lista completa de §5.2, con la nota "las tarjetas usan `table-card-*`, nunca los testids de fila".

### 3.9 Accesibilidad, criterio por criterio

| Criterio | Cómo se cumple |
|---|---|
| 1.4.10 Reflow | §3.2: el documento no scrollea en horizontal a 320px ni con zoom de 200%. La tabla de datos puede scrollear **dentro** del panel (excepción admitida); toolbar, chips, pie, sheets y tarjetas no. |
| 2.5.8 Target size | Desktop: piso de 24px (checkbox de 16px con hit area de 24px, ✕ de chip de 24px). Con `pointer: coarse`, 44px: checkbox, ✕, ⋯, ‹ ›, botón de detalle e ítems del acordeón. |
| 2.4.11 Focus not obscured | `scroll-pt-8` en el scroller por el header sticky. En mobile, mientras la barra sticky de selección está visible, la lista lleva un `pb` igual a su alto. |
| 1.4.11 Non-text contrast | Bordes de buscador, chips y checkboxes con `--input` (3.1–3.4, medido en `DISENO.md`). Barra de acento y foco con `--primary`. Hay que verificar el foco sobre `bg-primary-soft` en claro y oscuro (combinación nueva). |
| 4.1.3 Status messages | `role="status"` siempre montado (total y seleccionados). Errores con `role="alert"`. |
| 1.3.1 Semántica | Desktop: `<table>` real con `<th scope="col">` y `aria-sort`. Tarjetas y detalle: `<ul>/<li>` y `<dl>`. Drawer y Sheet con título (`ResponsiveDialog` lo exige). |
| 2.1.1 Teclado | Todo por Radix: menús, popovers, acordeón, sheet con foco atrapado y devuelto al botón de detalle. Las tarjetas no manejan foco con JS propio. |
| 1.4.1 Uso del color | Fila seleccionada = barra de 2px + fondo + checkbox tildado + `data-state`. |

---

## 4. Reorganización del código

### 4.0 Instrucciones para `table-expert` (modo "rediseño")

`table-expert` tiene modos AUDIT/FIX/CREATE pensados para completar tablas: agregar filtros faltantes, formatters,
facets lazy y migrar del sistema viejo. **En esta fase no se aplica nada de eso**, porque cambiaría el funcionamiento
(`PLAN.md` §1):
- No se agregan filtros, columnas, formatters, `meta.title` ni facetas, y no se migra el bulk a lazy, aunque su
  checklist lo marque. Lo que encuentre va a una lista "hallazgos para la Fase 6" en el archivo de progreso.
- En los `columns.tsx` de §3.6 se toca **solo** `meta.mobile`. En `_PreparteDataTable.tsx`, **solo** el traslado
  de "Cambiar estado" a `selectionActions`.
- Server actions, `useDataTable.ts`, `helpers.ts`, `in-memory.ts`, `DataTablePendingContext.tsx` y la lógica de
  URL: **no se tocan**.
- Cada ola deja `npm run check-types` en verde. No se corre `lint` ni `prettier` (`no-format-commands.md`).
- Sin commits.
- Progreso en `docs/rediseno-ui/features/fase-3-progreso.md`, igual que en las fases 1 y 2.

### 4.1 Componentes a partir

| Hoy | Después | Server/client |
|---|---|---|
| `DataTable.tsx` (561) | `DataTable.tsx` (~300: estado, `useDataTable`, React Query, persistencia, `detailRowId`, armado de contexto) + `DataTableDesktop.tsx` + `DataTableCards.tsx` / `DataTableCard.tsx` + `DataTableDetailSheet.tsx` + `DataTableSelectionBar.tsx` + `DataTableStates.tsx` | Todo client (ya lo era). |
| `DataTableFacetedFilter.tsx` (229) | `filters/use-facet-filter.ts` (el `useQuery` lazy, `hasOpened`, `visibleOptions` y `prevVisibleOptionsRef`, **movidos sin cambios**) + `filters/FacetOptionsList.tsx` (cuerpo `Command`) + `DataTableFacetedFilter.tsx` (trigger/chip + popover, con la misma API pública) | client |
| `DataTableTextFilter.tsx` (130) | `filters/use-url-text-filter.ts` (lectura de URL, `applyFilter`, `clearFilter`; mismas keys y mismo `pageKey`) + `filters/TextFilterBody.tsx` + el componente con la misma API | client |
| `DataTableDateRangeFilter.tsx` (143) | `filters/use-url-date-range.ts` + `filters/DateRangeFilterBody.tsx` + el componente con la misma API | client |
| — | `mobile-columns.ts` (puro, sin directiva) | Importable desde cualquier lado. |

Las APIs públicas de `index.ts` no cambian de firma: los 72 consumidores no se tocan, salvo los 10 de §1.1.

**El `useEffect` de `DataTableTextFilter.tsx:42-44`** (sincronizar el input cuando la URL cambia desde afuera) se
mueve tal cual al hook. Es sincronización con un sistema externo (la URL de `window.location`), así que entra en las
excepciones de `no-useeffect.md`. No se aprovecha para reescribirlo.

### 4.2 Duplicados a unificar

- Vacío: celda propia de `DataTable.tsx:541-545` → `EmptyState` de la Fase 2 (`shared/components/feedback/EmptyState.tsx`).
- Acciones del ⋯ mobile y del menú de columnas: `DropdownMenu` de shadcn, igual que hoy. `RowActions` **no** se usa
  en la tarjeta en esta fase (P-4): está pensado para acciones como datos, y las celdas de hoy son JSX arbitrario.
- Sheet de detalle y sheet de filtros: `ResponsiveDialog` (Fase 2). No se crea otro Drawer a mano.
- Fechas del chip y del filtro: el mismo formato `moment(...).format('DD/MM')` de hoy. Se extrae a una función del
  hook de fechas para no repetirla en chip y trigger.
- `getColumnTitle` (`DataTableViewOptions.tsx:23`) pasa a `mobile-columns.ts` como `getColumnLabel` y la usan el
  menú de columnas, la tarjeta, el detalle y "Ordenar por". Así hay un solo lugar que decide el texto de una columna.
- `TooltipProvider` por botón (`_DataTableExportButton.tsx:77`) y por fila en `RowActions` (pendiente A-14 de la
  Fase 2): el sidebar ya monta uno global (`sidebar.tsx:131`, `delayDuration={0}`). Se quita el del botón de
  exportar. El de `RowActions` queda para su propio archivo, que en esta fase **no se toca**: se anota.

### 4.3 Límite server/client y serialización

- `server-serialization`: `meta.mobile` es configuración de columnas que vive en el cliente (`columns.tsx` ya es
  client). **No agrega ni un campo a las queries**: la tarjeta usa los mismos `cell` sobre las mismas filas.
- `server-dedup-props`: las dos vistas (tabla y tarjetas) comparten `table.getRowModel().rows`. No se pasa el array
  dos veces ni se transforma por vista.
- Ningún `*List.tsx` server cambia en esta fase.

### 4.4 Fetching

- No cambia nada de React Query: misma `queryKey` (`[...queryKey, stateSearchParams]`), mismo `staleTime` de 30s,
  mismo `initialData` sembrado con `initialQueryStateKeyRef` (`DataTable.tsx:264-293`) y mismo `keepPreviousData`.
- **Se agrega solo lectura** de `isError`, `isFetching` y `refetch` del mismo `useQuery`, para los estados de §3.3.
  No hay query nueva.
- Facetas: el sheet mobile y el popover desktop usan el mismo hook con la misma key
  (`['datatable-facet', facetScope, columnId, facetParams]`), así que se comparte la caché. **Una sola** carga por
  faceta aunque se abran las dos superficies.
- "Ver N resultados" sale del total que ya está en memoria: no hay consulta de previsualización (P-9).
- `async-*` y `server-parallel-*`: N/A en esta fase (no cambia ningún server component). Anotado así en la
  auditoría.

### 4.5 Bundle

- **`bundle-conditional` (CRÍTICO, se corrige).** `_DataTableExportButton.tsx` deja de importar `exportToExcel` y
  `tanstackColumnsToExcelColumns` de forma estática y los carga en el handler:
  `const { exportToExcel, tanstackColumnsToExcelColumns } = await import('@/shared/lib/excel-export')`. Así `exceljs`
  y `file-saver` salen del chunk de cada página con DataTable. Antes y después se mide con el build (`npm run build`
  contra el compose; el tamaño del chunk de `/dashboard/employee`). El resultado del archivo no cambia. Además:
  `bundle-preload`, con `onPointerEnter`/`onFocus` del botón dispara el mismo `import()` para que el primer clic
  no espere.
- **`bundle-barrel-imports`.** `index.ts` reexporta `exportToExcel` desde `@/shared/lib/excel-export`. Si el
  barrido del build muestra `exceljs` en chunks de páginas que solo importan `DataTable` del barrel, se saca ese
  reexport del barrel. Antes hay que contar los consumidores que lo importan desde ahí (LSP `findReferences`): si
  hay alguno, se cambia su import al archivo directo, que es un cambio de una línea por archivo y sin cambio de
  comportamiento. Si no aparece en el build, no se toca (no se reescriben 146 imports a ciegas).
- `ResponsiveDialog`, `Accordion`, `RadioGroup` y `ToggleGroup` son livianos (Radix ya está en el bundle). No hacen
  falta `next/dynamic` para el sheet de detalle ni para el de filtros. Si el build muestra lo contrario, el sheet de
  filtros pasa a `next/dynamic` con precarga en el `pointerenter` de "Filtros (n)".
- `bundle-analyzable-paths`: sin `import()` con rutas armadas.

### 4.6 Re-renders y render

- `rerender-no-inline-components`: `DataTableCard`, las filas y los cuerpos de filtro, todos a nivel de módulo.
  Ningún `renderX = () => <…/>` dentro de `DataTable`.
- `rerender-memo`: `DataTableCard` con `memo`. Tildar una fila re-renderiza esa tarjeta y la barra, no las 50
  (`isSelected` booleano como prop, `rerender-derived-state`).
- `rerender-memo-with-default-value`: los `= []` / `= {}` de las props de `DataTable` (`facetedFilters = []`,
  `searchParams = {}`, `initialColumnVisibility = {}`, `initialFilterVisibility = {}`, `DataTable.tsx:90-115`) se
  hoistean a constantes de módulo (`EMPTY_FILTERS`, `EMPTY_PARAMS`). Hoy cada render crea un array nuevo y `filterableColumns` se recalcula
  (`:171`).
- `rerender-dependencies`: `resolveMobileLayout` se memoiza con una key primitiva (los ids de columnas visibles
  unidos), no con el array de columnas.
- `rerender-functional-setstate`: `setDetailRowId` y los toggles de selección con setter funcional, para callbacks
  estables.
- `rendering-content-visibility`: en tarjetas y filas (§3.4).
- `rendering-hydration-no-flicker`: tabla ↔ tarjetas por CSS. La detección "dentro de un dialog" es en el evento.
- `rendering-conditional-render`: contadores con ternario (`n > 0 ? … : null`), nunca `n && …` (pintaría "0").
- `rendering-hoist-jsx`: las filas del skeleton y los íconos de estado vacío se hoistean como constantes.
- `client-event-listeners`: ningún listener nuevo por fila o tarjeta. El clic de la tarjeta es un `onClick` de React
  (delegado por React en la raíz). Los listeners de URL de `useDataTable` no se tocan.
- `rerender-use-deferred-value`: N/A. La búsqueda escribe la URL en cada tecla, como hoy (`onGlobalFilterChange`).
  Agregar debounce cambiaría cuándo se dispara la consulta, así que no se hace en esta fase (se anota como mejora
  para preguntar en la Fase 6; ver §5).
- `js-index-maps`: `rowsById` (para el detalle) se arma una vez por cambio de datos con `Map`, igual que el de
  `DataTable.tsx:350-356`, que se reusa.

### 4.7 Orden de implementación y reparto

**Reglas del reparto** (`PLAN.md` §5): un archivo lo edita un solo agente a la vez, `globals.css` y `shared/**` de a
uno, y nadie commitea.

| Ola | Agente | Archivos exclusivos | Qué entrega | Verificable por separado |
|---|---|---|---|---|
| **0 — Base** (secuencial, 1 agente) | `table-expert` (A0) | `types.ts`, `mobile-columns.ts` (nuevo), `DataTable.tsx` (solo la raíz `@container/table` + `w-full min-w-0 overflow-x-clip` + el borde condicional), `src/app/globals.css` (`scroll-fade-start/end`), `SimpleTable.tsx:325` (la clase del fade) | `ColumnMeta` tipado, resolución de roles, contención del desborde (capas 1 y 2 de §3.2) | `check-types` en verde. A 375px, en 5 páginas con tabla, `scrollWidth <= innerWidth` aunque toolbar y pie todavía no se reacomoden (quedan recortados, no desbordan). Repaso de excesos de propiedad que marque el tipado (R-3). |
| **1 — Piezas** (en paralelo, 4 agentes) | B1 | `DataTableToolbar.tsx`, `DataTableFilterOptions.tsx`, `DataTableViewOptions.tsx`, `_DataTableExportButton.tsx`, `DataTableActiveFilterChip.tsx` (nuevo), `DataTableMoreMenu.tsx` (nuevo) | Toolbar desktop + fila mobile del mismo DOM (§3.3, §3.4), export con `import()` | Con la ola 0 montada, la toolbar ya se ve nueva en todas las tablas. |
|  | B2 | `DataTableFacetedFilter.tsx`, `DataTableTextFilter.tsx`, `DataTableDateRangeFilter.tsx`, `filters/**` (nuevo) | Hooks + cuerpos + triggers/chips. **Contrato para B1**: los tres componentes mantienen sus props actuales y suman `variant?: 'trigger' \| 'chip'`. B1 los consume sin conocer su interior. | Mismos testids. Cada filtro escribe exactamente la misma URL que antes (comparar `location.search` antes/después). |
|  | B3 | `DataTableColumnHeader.tsx`, `DataTablePagination.tsx`, `DataTableDesktop.tsx` (nuevo), `DataTableStates.tsx` (nuevo), `shared/components/skeletons/TableSkeleton.tsx` | Header, filas, columna `actions` sticky, pie completo y compacto, estados | `DataTableDesktop` recibe `table` y props; todavía no lo monta nadie (lo integra la ola 2). |
|  | B4 | `DataTableCards.tsx`, `DataTableCard.tsx`, `DataTableDetailSheet.tsx`, `DataTableSelectionBar.tsx` (nuevos) | Tarjetas, detalle (sheet e inline en dialog), barra de selección desktop y mobile | Igual: componentes sueltos, con props tipadas desde `types.ts` de la ola 0. |
| **2 — Integración** (secuencial) | `table-expert` (A2) | `DataTable.tsx` (resto), `index.ts`, `DOCS.md`, `DataTableMobileFilters.tsx` (nuevo; usa los cuerpos de B2) | Monta las piezas, `detailRowId`, `selectionActions`, estados, live region | Checkpoint parcial: las 3 tablas del checkpoint a 1440 y 375px. |
| **2b — Anotaciones** (en paralelo con A2 desde que la ola 0 cerró: solo dependen del tipo) | C1 (Equipos: 4 `columns.tsx`) · C2 (Empleados, Preparte + `_PreparteDataTable.tsx`, Facturación) · C3 (Documentación: 2 `columns.tsx`) | Solo `meta.mobile` (§3.6) y `selectionActions` en Preparte | `check-types` en verde. Se ven bien recién con la ola 2 montada. |
| **3 — Checkpoint 3** | Hilo principal (navegador) + `ui-skills` (auditoría) | — | §8 completo | Ver §8. |

El contrato entre agentes de la ola 1 se fija en la ola 0, dentro de `types.ts`:
- `DataTableDesktopProps`, `DataTableCardsProps`, `DataTableDetailSheetProps` y `DataTableSelectionBarProps`.
- El tipo `MobileLayout` (salida de `resolveMobileLayout`).
- La prop `variant` de los filtros.

Así nadie espera a nadie para tipar.

---

## 5. Qué NO se toca

### 5.1 Comportamiento (y cómo se verifica que sigue igual)

| Qué | Dónde vive | Por qué no cambia | Cómo se verifica |
|---|---|---|---|
| URL (claves, prefijo `ns__`, `page` 1-indexed, `sort` compacto, `_from/_to`, omisión de defaults guardados, `sort=` vacío explícito) | `useDataTable.ts`, `helpers.ts`, hooks de filtro (movidos, no reescritos) | No se edita `useDataTable.ts` ni `helpers.ts`; los hooks extraídos son copia literal | Para cada acción (filtrar facetado, texto, fecha, ordenar, paginar, cambiar filas, limpiar), `location.search` antes y después de la fase en la misma tabla: idéntico. |
| Filtros (qué filtra, cross-filter, `NULL_FILTER_VALUE`, "Sin asignar") | Server actions + facet hooks | La UI solo dibuja `options`/`counts` que ya llegan | Mismos conteos en el popover desktop y en el acordeón mobile. Misma cantidad de filas con el mismo filtro antes/después. |
| Orden (multi-sort con Shift, "Agregar al ordenamiento", default guardado) | `DataTableColumnHeader` (menú intacto), `useDataTable` | Solo cambia el trigger visual | Shift+clic arma 2 criterios; URL `sort=a.asc,b.desc` igual. Mobile: elegir orden escribe el mismo `sort`. |
| Paginación (`pageSizeOptions`, `manualPagination`, reset a página 1 al filtrar) | `useDataTable` | Mismos handlers `setPageIndex`/`setPageSize` | "1–50 de 387" coincide con el total de antes; última página correcta; el select y el submenú del ⋯ escriben el mismo `pageSize`. |
| Export (Excel: columnas, formatters, filtros activos con `currentParams`, in-memory exporta las filas filtradas) | `_DataTableExportButton`, `excel-export.ts`, `effectiveExportConfig` | Solo cambia **cuándo se carga** el módulo | Exportar en las 3 tablas antes/después, con filtros: mismas columnas, cabeceras, filas y formatos (comparar los dos `.xlsx`). Desde el ⋯ mobile, igual. |
| Preferencias guardadas (columnas visibles, filtros visibles, filas/orden con `persistViewPreferences`, orden de columnas) | `table-preferences` actions, efectos con debounce de `DataTable.tsx:410-455` | Los efectos se quedan en el orquestador sin cambios | Ocultar una columna desde mobile → recargar en desktop: sigue oculta (y viceversa). En Equipamiento: cambiar filas/orden y reordenar desde el ⋯ → recargar → se respeta. |
| Selección (cross-page por `getRowId`, condicional por fila, `clearSelectionTrigger`, ambos callbacks) | `useReactTable` en el orquestador | Mismo `rowSelection` y mismo handler | Empleados: tildar en página 1 y 2, volver a la 1, siguen tildadas; el conteo suma. Preparte: solo se tildan pendientes/reprogramados; al filtrar se limpia (lógica del consumidor). |
| Client-side mode (`replaceState`, `DATA_TABLE_URL_CHANGE_EVENT`, `initialData` sembrado, sin re-pedir al montar) | `DataTable.tsx:236-293`, `useDataTable` | No se edita ese bloque | Network: al montar una tabla con SSR no sale una server action de datos (igual que hoy). Los KPIs de Preparte siguen filtrando la tabla por el evento. |
| Facets lazy (se piden al abrir; eager si hay valor en la URL; `facetScope`) | Hook extraído | Copia literal de la lógica | Network: abrir el popover dispara 1 llamada; abrir después el acordeón mobile, 0 más. |
| Modo in-memory (filtros/orden/paginación en el cliente, URL con `replaceState`) | `DataTable.tsx:126-130, 306-408` | Sin cambios | Ausencias: filtrar, buscar, ordenar y exportar dan lo mismo que antes. |
| `data-testid` existentes | Ver §5.2 | Se conservan en el mismo elemento lógico | `git diff` filtrado por `data-testid`: sin borrados (solo altas `table-card-*`). Cypress `preparte.cy.ts` a 1920. |
| Server actions, schemas, permisos, `toolbarActions`, `rowClassName`, `emptyMessage` | Consumidores | No se tocan (salvo Preparte, §1.1) | Diff de los consumidores = solo `meta.mobile` + Preparte. |

**Cambios visibles que no son de funcionamiento** (se listan para que nadie los confunda con regresiones):
- La carga inicial de las tablas con `data={[]}` muestra skeleton en vez de "No se encontraron resultados".
- Si falla la consulta, se ve un error con "Reintentar". Hoy no se ve nada.
- "Columnas" se ve también entre 768 y 1023px. Hoy está `hidden lg:flex`.
- Los primeros/últimos de la paginación pasan a `«`/`»`. Desde `@5xl/table` se ven siempre; hoy solo desde `lg`.
- En el pie, "387 registros" pasa a "1–50 de 387".
- Con `selectionActions` (solo Preparte en esta fase), "Cambiar estado" aparece con la selección y no deshabilitado
  en la toolbar.

### 5.2 `data-testid` que se conservan

`data-table` (o el que pase el consumidor) en la raíz · `search-input` · `clear-sorting` · `clear-filters` ·
`filter-<columnId>` · `filter-option-<value>` · `filter-clear-<columnId>` · `column-toggle` · `toggle-column-<id>` ·
`move-column-up-<id>` / `move-column-down-<id>` · `page-size-select` · `pagination-first` / `-prev` / `-next` /
`-last` · `table-row-<rowId>` · `column-header-<id>` · `sort-asc-<id>` / `sort-desc-<id>` / `sort-multi-<id>` /
`sort-clear-<id>` · `hide-column-<id>`. Nuevos: `table-card-<rowId>`, `table-detail-sheet`,
`table-mobile-filters`, `table-more-menu`, `table-selection-bar`.

Regla para no duplicar: **los controles de toolbar y pie son un solo DOM** (se reacomodan por container query), así
que sus testids existen una vez. Solo filas↔tarjetas son DOM doble, y las tarjetas no usan testids de fila. Los
testids que vienen **dentro de las celdas** del consumidor (`status-badge-*` de Preparte) sí quedan duplicados
cuando la celda se usa en la tarjeta: la copia de la tarjeta está después en el DOM y oculta a 1920 (R-4).

### 5.3 Tentaciones que se dejan

- Migrar las facetas bulk de Preparte y Seguimiento a lazy: es deprecado pero funciona, y el inventario dice "no se
  toca".
- Agregar debounce a la búsqueda global (`pbakaus/harden` lo recomienda): cambia cuándo se consulta. Para preguntar
  en la Fase 6.
- Arreglar el ocultar-filtro sin namespace (§2.5): es un bug de funcionamiento, se pregunta (P-15).
- Hacer clickeable la fila completa en desktop: no existe hoy; el detalle por tarjeta es solo de mobile.
- Reemplazar las celdas de acciones por `RowActions` y los badges por `StatusBadge`: es la Fase 6, por módulo.
- `pointer-events-none` del refetch: se mantiene (P-16).

---

## 6. Riesgos

| ID | Riesgo | Dónde | Cómo se cubre |
|---|---|---|---|
| R-1 | `container-type: inline-size` colapsa la tabla a 0 donde el padre no le da ancho (flex en fila, `w-fit`, `inline-block`, `PopoverContent` o `DialogContent` con ancho automático) | Raíz del DataTable × 72 usos | `w-full min-w-0` en la raíz. Barrido de los 72 usos con un script que, por cada `<DataTable`, abre el archivo y su padre inmediato (`*List.tsx`) buscando `flex` sin `flex-col`, `w-fit`, `inline-` y `w-auto` alrededor. Revisión a mano de los que aparezcan y prueba en navegador de los dialogs con tabla (Ausentismo, selectores de partes diarios, `AvailableEmployeesDialog`). |
| R-2 | Doble borde (Card del consumidor + borde del DataTable) o ningún borde | Todos los consumidores hasta la Fase 6 | Selector `in-data-[slot=…]` verificado contra el `data-slot` real de `card.tsx`/`panel.tsx`. Capturas de 5 módulos. |
| R-3 | Tipar `ColumnMeta` hace fallar `check-types` donde hay claves de `meta` mal escritas o no declaradas | 72 `columns.tsx` | El inventario de claves dio solo `title`, `excludeFromExport` (y `exportFormatter`, que lee `excel-export`). Si aparece otra, se **declara** (no se borra del consumidor) y se anota. Un typo real (`tittle`) es un bug previo: se corrige solo si el label en pantalla no cambia; si cambia, va a §9. |
| R-4 | Testids de celdas del consumidor duplicados (tabla + tarjeta) | `Preparte` (`status-badge-*`), cualquier celda `title`/`status`/`field` con testid | Tarjetas después de la tabla en el DOM; Cypress a 1920 (tarjetas `display:none`). `cy.get(...).click()` sobre un testid duplicado fallaría ("multiple elements"): hoy ninguna celda de rol title/status/field tiene testid clickeable (las de acción están en `actions`, que no va a la tarjeta). Se corre `preparte.cy.ts` en el checkpoint. Si un test futuro lo necesita, `{ multiple: false }` con `:visible`. |
| R-5 | Costo del DOM doble con 100 filas × 39 columnas | Empleados, Preparte | `content-visibility` en filas y tarjetas. Medición: tiempo de render del cambio de página (Performance de DevTools, INP de "siguiente página") antes/después con 100 filas; criterio: no más de +20% sobre la línea base. Si se pasa, P-12 (podar la vista oculta tras hidratar). |
| R-6 | Dialogs de las celdas (confirmaciones, foto) abiertos desde el sheet de detalle: foco atrapado peleado entre vaul y Radix, `pointer-events` del body | Preparte (confirmar/eliminar), Empleados (foto) | Prueba en el checkpoint a 375px: abrir, escribir en el input del confirm, confirmar, ver que el sheet se cierra solo si la fila desaparece y que el foco vuelve. Mismo patrón que `SearchSelect` en drawer (Fase 2). |
| R-7 | `overflow-x-clip` recorta un popover o tooltip no portaleado | Contenido de celdas de consumidores | Los overlays de shadcn usan portal. Barrido de `position: absolute` en celdas con un grep de `absolute` en `columns.tsx`; los que haya, se prueban. |
| R-8 | La heurística elige un título malo en tablas sin anotar (p. ej. una fecha) | 63 tablas | No rompe nada (todo está en el detalle). Lista de las tablas cuya primera columna no es identificador, generada en la ola 0 con `resolveMobileLayout` sobre cada `columns.tsx` y anotada para la Fase 6. |
| R-9 | Tablas que pasan a tarjetas **en desktop** por estar dentro de un dialog de < 768px | `_EmployeeAbsenceDataTable` en los dialogs de RRHH, selectores de partes diarios | Es el comportamiento buscado (container query). El detalle va en línea (sin modal encadenado). Si una de esas tablas necesita la grilla para su tarea, `mobileLayout="table"` + §9 (P-11 cubre el criterio). Revisión de los selectores de partes diarios con selección en el checkpoint. |
| R-10 | `_ValidationOrdersDataTable` dibuja todas las filas en una página (`totalRows={data.length}` sin `inMemory`, `crecimiento.md:115`) → DOM doble sin tope | Mantenimiento → Validar | Es deuda D7 previa (Fase 6.6). En la Fase 3: `logger.warn` en desarrollo cuando `table.getRowModel().rows.length > 100`, para que aparezca en la consola de quien lo mire; no se cambia la tabla. |
| R-11 | Toolbar con muchos chips activos (12 filtros en Empleados) desborda o empuja el contenido | Empleados | Desktop: los chips hacen wrap (la toolbar crece a 2 líneas, `min-h-12`). Mobile: tira de chips con scroll horizontal y fade. Prueba de peor caso (§8.3). |
| R-12 | El `hidden` por container query no aplica si falta el contenedor nombrado (la variante "nunca aplica" en silencio) | `DataTableDesktop`, `DataTableCards` | Usar siempre `@3xl/table` (con nombre) y que la raíz sea el único `@container/table`. Verificación: en una página, `getComputedStyle` del `<table>` a 375 = `display: none`. |

---

## 7. Preguntas para el usuario

Todas tienen una recomendación. Si el usuario no dice otra cosa, se implementa la recomendación (mismo criterio que
en las fases 1 y 2). Las que tocan funcionamiento (P-7, P-15) **no** se implementan sin respuesta.

| # | Tema | Opciones | Recomendación |
|---|---|---|---|
| P-1 | Filtros en la toolbar desktop | (a) Los filtros visibles como botones (sin dashed) y, al activarse, como chips; "Filtros (n)" abre el menú "Mostrar filtros". (b) Solo chips activos; para agregar uno, "Filtros (n)" abre una lista de todos los filtros. | **(a)**. Conserva el 1 clic de hoy y la preferencia "filtros visibles" sigue teniendo sentido. (b) es más limpio pero agrega un clic a cada filtro nuevo. |
| P-2 | Densidad 32/36 en la toolbar (`DISENO.md` §4.6) | Agregarla (preferencia nueva guardada en la BD) / no | **No** en esta fase: 36px fijo. Es una funcionalidad nueva con persistencia nueva. |
| P-3 | Hint `Ctrl K` del buscador de la tabla | Agregar el atajo / sin atajo | **Sin atajo**. `Ctrl K` es la búsqueda global del header (`DISENO.md` §5), y con varias tablas por página no queda claro a cuál va. |
| P-4 | ⋯ de la tarjeta | (a) Botón de detalle (chevron) y las acciones de la fila en el pie del detalle. (b) ⋯ con las acciones en un menú en la propia tarjeta. | **(a)** en la Fase 3. Las celdas de acciones de hoy son JSX arbitrario (con dialogs adentro) y no entran en un menú sin perder sus dialogs. Cuando un módulo migre su columna a `RowActions` (Fase 6), la tarjeta puede mostrar el ⋯ real con `RowActions layout="menu"` usando el mismo array, mediante una extensión opt-in de `meta.mobile`. |
| P-5 | Selección en tarjetas | Checkbox siempre visible / long-press / botón "Seleccionar" | **Siempre visible**. Se descubre sola, es accesible y no choca con el scroll ni con la selección de texto. |
| P-6 | Barra de selección mobile | `fixed` abajo de la pantalla / `sticky` al pie de la tabla | **Sticky**. Funciona dentro de dialogs y en páginas con varias tablas, y no tapa contenido de otras secciones. |
| P-7 | "Seleccionar los 387" | Implementar / no | **No** (es funcionalidad nueva). Queda "Seleccionar página", que ya existe hoy en el header. |
| P-8 | Barra de selección desktop sin `selectionActions` | Reemplazar la toolbar igual / no reemplazarla | **No reemplazarla**. Si no, "Agregar empleado" y otros `toolbarActions` desaparecen al tildar. |
| P-9 | Filtros mobile | Aplicación inmediata / borrador + "Aplicar" con conteo previo | **Inmediata**. Es la semántica de desktop y "Ver N resultados" sale del total que ya existe. El borrador necesita una consulta de previsualización nueva. |
| P-10 | Detalle de una tarjeta dentro de un dialog | Sheet encima del dialog / expansión dentro de la tarjeta | **Expansión dentro de la tarjeta** (regla "nunca encadenar modales"). |
| P-11 | Tablas en dialogs de < 768px en desktop (Ausentismo, selectores) | Tarjetas también en desktop / forzar tabla | **Tarjetas** (es lo que dice el container query). Si un dialog de selección necesita la grilla, se le pone `mobileLayout="table"` en su fase y se anota en §9. |
| P-17 | Multi-sort en mobile | Permitir armarlo en "Ordenar por" / solo ver y quitar el existente | **Solo ver y quitar**: en mobile se elige un criterio (igual que un clic normal en el header); el multi-sort sigue disponible en desktop. |
| P-12 | DOM doble tabla + tarjetas | (a) Las dos vistas siempre montadas (solo CSS). (b) CSS en el primer render y, después de hidratar, se desmonta la vista oculta (`ResizeObserver` sobre la raíz). | **(a)**, y medir (R-5). (b) solo si la medición con 100 filas supera el criterio. Agrega un observer por tabla y remonta las celdas al cruzar el corte. |
| P-13 | Fade del scroll horizontal (DataTable y `SimpleTable`, pendiente A-15) | Máscara en los dos lados / fade solo del lado sin columna fija | **Un solo lado**: `scroll-fade-start` en DataTable (la de acciones está fija a la derecha) y `scroll-fade-end` en `SimpleTable` (la fija está a la izquierda). |
| P-14 | Columnas sin `meta.title` (`fullName`, `contractor_employee`, …) | Agregar `meta.title` / usar `meta.mobile.label` | **`meta.mobile.label`**. Agregar `meta.title` cambia la cabecera del Excel exportado (`excel-export.ts:393`). Si el usuario quiere el Excel con "Nombre completo" en vez de `fullName`, es un cambio aparte que se decide por tabla. |
| P-15 | Bug previo: ocultar un filtro desde "Mostrar filtros" no lo quita de la URL en tablas con namespace y navega con `router.replace` en client-side mode (`DataTableFilterOptions.tsx:39-48`) | Arreglarlo en esta fase / anotarlo en §9 y ticket aparte | **Anotarlo en §9**. Pedir el arreglo explícitamente si se quiere ahora; es un cambio de una función, aislado y fácil de probar. |
| P-16 | Durante el refetch, el cuerpo sigue con `pointer-events-none` | Mantener / permitir clics sobre los datos viejos | **Mantener** (es el comportamiento actual). |

---

## 8. Checklist de verificación funcional

Protocolo `PLAN.md` §3. Cada fila se prueba **antes** (en `main` o con un `git stash` de la rama) y **después**.
Anchos: 1440 · 768 · 375 · 320, claro y oscuro. Chrome de la PC gamer (`CLAUDE.md` global),
`npx next dev --webpack`.

### 8.1 Comportamiento genérico (en las 3 tablas del checkpoint salvo indicación)

| Ítem | Tabla | Antes | Después 1440 | Después 375 |
|---|---|---|---|---|
| Búsqueda global escribe `ns__search` y filtra | Preparte, Empleados | [ ] | [ ] | [ ] |
| Búsqueda en memoria (`globalFilter`) | Ausencias | [ ] | [ ] | [ ] |
| Filtro facetado: opciones lazy, counts, multi-valor, "Sin asignar", limpiar | las 3 | [ ] | [ ] popover | [ ] acordeón |
| Filtro de texto: Enter/"Aplicar", Escape restaura, limpiar | Empleados (Legajo, CUIL), Ausencias (Observaciones) | [ ] | [ ] | [ ] |
| Filtro de fechas: desde, hasta, ambos, limpiar; chip "12/08–30/09" | Empleados (Ingreso), Preparte (Ejecución) | [ ] | [ ] | [ ] |
| Filtro activo llegado por URL de una columna con filtro oculto → se muestra (chip) | Empleados | [ ] | [ ] | [ ] |
| "Mostrar filtros": ocultar/mostrar, persiste al recargar | Empleados | [ ] | [ ] | [ ] (⋯) |
| "Limpiar filtros" limpia también fechas y filtros ocultos | Empleados | [ ] | [ ] | [ ] (sheet) |
| Orden simple, multi (Shift), "Agregar al ordenamiento", "Sin ordenar", chip "Orden ×" | Preparte | [ ] | [ ] | [ ] ("Ordenar por") |
| Paginación: siguiente/anterior/primera/última, cambio de filas por página, reset a pág. 1 al filtrar | las 3 | [ ] | [ ] | [ ] (compacta + ⋯) |
| Total correcto ("1–50 de 387" vs "387 registros") | las 3 | [ ] | [ ] | [ ] |
| Columnas: ocultar/mostrar, persiste; ocultas también en tarjeta y detalle (D2) | Empleados | [ ] | [ ] | [ ] |
| Reordenar columnas + filas/orden guardados (`persistViewPreferences`) | Equipamiento | [ ] | [ ] | [ ] |
| Export con filtros activos: mismas columnas, cabeceras, filas y formatos | las 3 | [ ] | [ ] | [ ] (⋯) |
| Selección: tildar, "seleccionar página", conteo en pie/barra, limpiar | Preparte, Empleados | [ ] | [ ] | [ ] |
| Selección entre páginas (pág. 1 + pág. 2 → vuelve a la 1 tildada) | Empleados | [ ] | [ ] | [ ] |
| Selección condicional (solo pendiente/reprogramado; sin permiso `update` no hay selección) | Preparte | [ ] | [ ] | [ ] |
| Acción masiva "Cambiar estado" con las filas seleccionadas | Preparte | [ ] (toolbar) | [ ] (barra) | [ ] (barra inferior) |
| La selección se limpia al filtrar o cambiar de página (lógica del consumidor) | Preparte | [ ] | [ ] | [ ] |
| KPIs de estado filtran la tabla (`DATA_TABLE_URL_CHANGE_EVENT`) | Preparte | [ ] | [ ] | [ ] |
| Acciones de fila (ver, confirmar con nombre, eliminar) | Preparte | [ ] | [ ] fila | [ ] sheet de detalle |
| Link del nombre y foto del empleado | Empleados | [ ] | [ ] | [ ] tarjeta y detalle |
| "Agregar empleado" (`toolbarActions`) visible con y sin selección | Empleados | [ ] | [ ] | [ ] |
| Tabla dentro de dialog (Tabs Bajas/Ausentes/Altas): filtros, export, detalle **en línea** | Ausencias | [ ] | [ ] | [ ] |
| Vacío sin datos (título = `emptyMessage`) / filtrado a cero con "Limpiar filtros" | las 3 | [ ] | [ ] | [ ] |
| Carga inicial de una tabla con `data={[]}` (selector de partes diarios): skeleton, no "sin resultados" | `_EmployeeSelectorDataTable` | [ ] | [ ] | [ ] |
| Error de consulta (cortar la red en DevTools y filtrar): callout + "Reintentar" | Preparte | [ ] | [ ] | [ ] |
| No hay re-fetch de datos al montar con SSR (Network) | Preparte | [ ] | [ ] | [ ] |
| Una sola llamada por faceta aunque se abra popover y acordeón | Empleados | — | [ ] | [ ] |
| `preparte.cy.ts` en verde (1920) | Preparte | [ ] | [ ] | — |

### 8.2 Mobile (375) — lo nuevo

- [ ] Tarjeta: título (legajo mono + nombre), estado + subtítulo, 3 pares según §3.6, en las 3 tablas y en las 9 anchas.
- [ ] Tabla sin anotar (cualquiera de las 63): la heurística da una tarjeta legible y todo está en el detalle.
- [ ] Toque en la tarjeta abre el detalle; toque en un link de la celda navega (no abre el detalle).
- [ ] Detalle: todos los campos visibles, en orden; acciones al pie con safe-area; Esc / arrastre / ✕ cierran y el
  foco vuelve al botón de detalle; se cierra solo si la acción hace desaparecer la fila.
- [ ] Sheet de filtros: "Ordenar por", acordeones con todos los filtros, "Limpiar", "Ver N resultados"; `85dvh`, scroll
  propio (`overscroll-contain`), inputs a 16px (sin zoom en iOS).
- [ ] ⋯: Columnas, Exportar, Filas por página, Mostrar filtros.
- [ ] Barra de selección sticky con conteo, acciones y "Limpiar"; no tapa la última tarjeta enfocada.
- [ ] Paginación compacta con botones de 44px.
- [ ] Teclado (con teclado físico a 375): Tab por tarjeta = checkbox → controles de celda → detalle.
- [ ] Lector de pantalla (NVDA o VoiceOver): anuncia "N resultados" al filtrar y "N seleccionados" al tildar.
- [ ] Probado también en un celular real (el emulador no reproduce safe-area, zoom de inputs ni teclado:
  `emilkowalski/mobile-native`). Si no se pudo, se dice en el informe.

### 8.3 Barridos automatizables

1. **Desborde** (C2): con Chrome DevTools, a 375 y 320 y zoom 200%, en las páginas de las 72 tablas (lista desde
   `inventario/`), `document.documentElement.scrollWidth <= innerWidth`. Se anota cada URL con OK / NO.
2. **Container query efectiva**: en cada página, a 375, `getComputedStyle(table).display === 'none'` y a 1440 la
   lista de tarjetas `display: none`.
3. **Peor caso** (`emilkowalski/break-ui`): un fixture en la `queryFn` de la página `dev-primitivos` (local, excluida
   del repo) con un DataTable de ejemplo: fila 1 con nombre de 80 caracteres ("Aleksandra Wiśniewska-Kowalczyk de
   la Santísima Trinidad"), fila 2 con email largo sin cortes, fila 3 con nulos en todas las columnas, fila 4 con
   importes de 10 dígitos; 0 / 1 / 100 filas; 12 filtros activos; 39 columnas. Capturas a 1440 y 375, claro y oscuro.
4. **Testids**: `git diff main -- src/shared/components/common/DataTable | grep data-testid` sin líneas `-` que no
   reaparezcan con `+`.
5. **Conteo de hardcodeados**: la carpeta sigue en 0 y el global no sube de 2707.
6. **`rounded`/`border-dashed`/`shadow`** en la carpeta: 0 (salvo `rounded-full` en checkbox/punto si aplica y
   `shadow-[inset…]` de la barra de acento y la hairline de la columna fija).

### 8.4 Prueba anti-GH (`DISENO.md` §7)

En las 3 tablas a 1440: header en mayúsculas sobre muted · cifras tabulares en el pie · barra de acento de 2px en la
fila seleccionada · esquinas rectas sin sombra · sin botones dashed · sin "Filas por página". A 375: tarjetas y sheet
en vez de scroll horizontal.

---

## 9. Auditorías

(Se agregan acá los informes de `ui-skills` después de implementar, según `AUDITORIA-UI.md` §3.)

Para el hilo principal, al cerrar la fase, en `PLAN.md` §9:
- Bug previo P-15 (`DataTableFilterOptions` sin namespace) y el vacío con `colSpan={columns.length}`.
- Tablas que quedaron con `mobileLayout="table"` (ninguna, según este plan).
- Lista de tablas con heurística pobre (R-8) para la Fase 6.
- `TooltipProvider` por fila de `RowActions` (A-14 de la Fase 2) sigue abierto: se cierra en la Fase 6 o cuando se
  toque `RowActions`.
- Mejoras para preguntar en la Fase 6: debounce de la búsqueda, `meta.mobile` con `rowActions` (P-4).

---

## Anexo D7 — Crecimiento de datos

| Superficie | Clasificación | Estado | Qué hace la Fase 3 |
|---|---|---|---|
| DataTable compartido (72 usos) | — | 64 paginan en servidor, 2 `slice` en memoria, 6 reciben todo (`crecimiento.md:55,107`) | **No cambia cómo se consulta.** El modo mobile usa la misma paginación del servidor: no hay scroll infinito ni "cargar todo" en tarjetas. La paginación compacta es la misma página. |
| Facetas lazy | crece (por tabla) | consultas agregadas por columna | Sin cambios; se comparte la caché entre popover y acordeón (menos consultas, no más). |
| Export | crece | trae todo con filtros (es su función) | Sin cambios de datos; solo carga diferida del módulo de Excel. |
| Detalle de fila | acotado (1 registro) | usa la fila ya cargada | No hace consultas. |
| "Ver N resultados" | — | total ya en memoria | Sin consulta nueva. |
| "Seleccionar los 387" | crece | — | No se implementa (P-7): requeriría traer todos los ids. |
| `_ValidationOrdersDataTable` (todas las filas en una página) | crece | carga todo (`crecimiento.md:115`) | Fuera de alcance (Fase 6.6); con el DOM doble el costo sube, así que se agrega el `logger.warn` de R-10 para que no pase desapercibido. |
| `EquiposConDesvios`, `Formularios` (slice en memoria) | crece | `crecimiento.md:113-114` | Fuera de alcance (Fase 6). |
| Ausencias (`inMemory`) | acotado (un día / la plantilla) | `crecimiento.md:120` | Sin cambios; `inMemory` correcto según el inventario. |

Ninguna lista que crece pasa a `SimpleTable`, a `inMemory` ni a "traer todo" por esta fase.

<!-- estado: completo -->
