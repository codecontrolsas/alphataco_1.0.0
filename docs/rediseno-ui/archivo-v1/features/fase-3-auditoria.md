# Fase 3 — DataTable: auditoría

### Auditoría 1 — 2026-10-08

**Alcance:** `60fb9147` vs. su padre en:
- `src/shared/components/common/DataTable/**`
- `TableSkeleton.tsx`
- `globals.css` (`scroll-fade-start` y `scroll-fade-end`)
- `SimpleTable.tsx`
- `checkbox.tsx`
- `meta.mobile` de las 9 tablas
- `_PreparteDataTable.tsx`

Se incluyen los 4 fixes del usuario (checkbox en dark, `DataTableCard`, fila mobile de la toolbar y select de paginación), que ya están dentro de `60fb9147`.

También se revisó la compatibilidad de las 12 tablas que llegaron con el merge de `origin/main`:
- 6 en `Warehouses`;
- 3 en `Clothing`: `AllDeliveries`, `ClothingReports` y `EmployeeDeliveries`;
- 2 en Gomería: `_TiresDataTable` y `_ServiceOrdersDataTable`;
- el resto son consumidores que ya existían.

**Evidencia:**
- `npm run check-types` en verde, antes y después de los fixes.
- `npm test`: 857 pasados, 159 omitidos.
- CSS compilado con `@tailwindcss/postcss` sobre `globals.css`. Las 26 variantes `@3xl/table:*` y `@5xl/table:*` que usa el código se generan todas, y también `@container/table`, `in-data-[slot=card-content]`, `pointer-coarse:h-11` y `z-1`.
- Contraste de los pares nuevos, calculado desde los tokens OKLCH: los 13 pares cumplen en claro y en oscuro (detalle en D6).
- Hardcodeados en la carpeta del DataTable: 0.
- Lo que **no** se pudo correr está listado al final: navegador, Cypress y medición de rendimiento.

**Skills cargadas:**
- `vercel-react-best-practices` (local);
- `ibelick/fixing-accessibility`;
- `flornkm/prefer-container-queries`.

**Barrido (MCP `ui-skills`):** búsquedas por `table`, `accessibility` y `responsive`. Se descartaron, por cubrir lo mismo que las anteriores o salirse del stack:
- `wshobson/wcag-audit-patterns` (no se vio en el navegador);
- `pbakaus/adapt`;
- `jakubkrehel/better-layout`.

| ID | Sev | Bloque | archivo:línea | Regla | Hallazgo | Fix | Estado |
|---|---|---|---|---|---|---|---|
| F3-01 | S1 | H / runtime | `DataTable/_DataTableExportButton.tsx:93` | Funcionamiento intacto | Al pasar a tokens se quitó el `TooltipProvider` propio del botón "Exportar". Radix (`@radix-ui/react-tooltip`) lanza un error si `Tooltip` no tiene provider. El único provider global está en `sidebar.tsx`, dentro de `/dashboard`. `/clothing/delivery`, que llegó con el merge, monta `AllDeliveriesList` con `exportConfig` fuera del dashboard, así que la página rompería al renderizar. El botón se renderiza también en mobile, porque solo se oculta por CSS. | Se volvió a envolver en `TooltipProvider`, como antes. | corregido |
| F3-02 | S2 | C2 / pedido | `DataTable/DataTableCard.tsx:85` | Nada recortado por `overflow-x-clip` | El fix del usuario puso `whitespace-nowrap` en el primer título de la tarjeta. En las tablas sin anotar, la heurística toma como título la primera columna. Si es un texto largo (nombre de material, depósito, cliente), no corta y desborda la tarjeta: tapa el chevron y lo recorta el `overflow-x-clip` de la raíz. | `max-w-full truncate`: el código sigue sin partirse y el texto largo termina en "…". El nombre completo está en el detalle y en el `aria-label`. | corregido |
| F3-03 | S2 | C2 / pedido | `DataTable/DataTableToolbar.tsx:301` | Ídem | El grupo `toolbarActions` + ⋯ era `flex` sin wrap en mobile: el wrap estaba solo en `@3xl`, al revés de lo necesario. Con dos botones con texto (Gomería → Catálogo: "Alta masiva" + "Agregar cubierta") el ⋯ queda fuera a 320px y lo recorta la raíz. El fix del usuario (fila con `flex-wrap`) cubría el contenedor, pero no este grupo interno. | `flex-wrap justify-end min-w-0 max-w-full` en todos los anchos. | corregido |
| F3-04 | S2 | C3 | `filters/FilterChipShell.tsx:74,102` · `DataTableActiveFilterChip.tsx:138` | Área táctil ≥ 44px | El chip de filtro activo mide 28px de alto. Con `pointer: coarse`, la ✕ del `FilterChip` pasaba a 44px dentro de un chip de 28px, así que desbordaba hacia arriba y abajo. Como la tira mobile tiene `overflow-x-auto`, ese desborde generaba además un scroll vertical en la tira. El chip de orden se quedaba en 28px de alto. | `pointer-coarse:h-11` en los dos chips; la ✕ ahora entra en el chip. | corregido |
| F3-05 | S2 | A2 | `filters/FilterChipShell.tsx:74,83,102` · `DataTableViewOptions.tsx:217` · `filters/FacetOptionsList.tsx:53-55,76` · `DataTableFacetedFilter.tsx:56` | Sin `rounded-*` | `rounded-md`, `rounded-l-md` y `rounded-r-md` en el chip; `rounded-md` en la fila del panel de columnas; `rounded-sm` en la caja de opción y en los skeletons. | Quitados (las esquinas quedan rectas). | corregido |
| F3-06 | S2 | A8 | `DataTableViewOptions.tsx:273` | Solo variantes nuevas | `variant="outline"` (alias legacy) en "Mostrar todas". | `variant="secondary"` (mismo estilo: el alias apunta ahí). | corregido |
| F3-07 | S2 | §5.1 / plan §3.1 | `mobile-columns.ts:16` → `DataTableViewOptions.tsx:24` y `DataTableToolbar.tsx:147` | El funcionamiento visible en desktop no cambia | `getColumnLabel` (`mobile.label ?? title`) se usaba también en el menú **desktop** "Columnas" y en el chip de orden. Por eso los títulos cortos pensados para la tarjeta pasaban a desktop: "Fecha de emisión" se veía como "Emisión", "Fecha de baja" como "Baja", "Kilómetros" como "Km", "Fecha de ejecución" como "Ejecución", etc. El plan reserva `mobile.label` para la tarjeta y el detalle. | Nueva `getColumnTitle` (`meta.title \|\| getColumnLabel`) para el menú de columnas, el panel de columnas del ⋯ y el chip de orden. La tarjeta, el detalle y "Ordenar por" mobile siguen con `getColumnLabel`. Se exporta en `index.ts`. | corregido |
| F3-08 | S3 | D4 | `DataTablePagination.tsx:75` | Live region única | El rango del pie tenía `aria-live="polite"` y la raíz tiene `<p role="status">` siempre montado, así que el total y la selección se anunciaban dos veces. | Quitado el `aria-live` del pie. | corregido |
| F3-09 | S3 | D5 | `filters/TextFilterBody.tsx:30` | Labels asociados | El input del filtro de texto solo tenía placeholder (el "Filtrar por…" es un `<p>` sin asociar). Es un problema previo a la fase. | `aria-label="Filtrar por <título>"`. | corregido |
| F3-10 | S3 | D6 | `filters/FacetOptionsList.tsx:76` | Bordes ≥ 3:1 | La caja de la opción no seleccionada era `border-primary` con `opacity-50`: queda en ~2:1 sobre el popover. Es un problema previo a la fase. | Sin opacidad, `border-input` (3,36:1 en claro y 3,32:1 en oscuro, igual que el checkbox). | corregido |
| F3-11 | S3 | A4 | `DataTableViewOptions.tsx` (8 líneas) · `filters/TextFilterBody.tsx:28` · `filters/DateRangeFilterBody.tsx:167,172` | Tipografía por rol | Quedaban `text-sm` y `text-xs` sueltos. | `text-cell`, `text-caption` y `text-label`. Excepción: el input del filtro de texto conserva `text-sm`, para que `twMerge` lo reemplace por el `text-base` del sheet mobile (16px, sin zoom en iOS). | corregido |
| F3-12 | S3 | R-2 | `skeletons/TableSkeleton.tsx:23` | Sin borde doble | El skeleton dibuja borde siempre; dentro de un `CardContent` (fallbacks que envuelven en Card) queda doble borde, cosa que el DataTable ya evita. | `in-data-[slot=card-content]:border-0 in-data-[slot=panel-body]:border-0`, igual que la raíz del DataTable. | corregido |
| F3-13 | S4 | F4 `client-event-listeners` | `DataTableMoreMenu.tsx:229-247` | Montaje diferido | Los dos `ResponsiveDialog` del ⋯ (Columnas y Mostrar filtros) quedaban montados en cada tabla aunque nunca se abrieran. `useMediaQuery` usa un store compartido, así que el costo es bajo, pero contradice el criterio del desvío de la ola 2. | Se montan al abrirlos por primera vez y después quedan montados, para conservar la animación de cierre. | corregido |
| F3-14 | S4 | A12 | `DataTableDesktop.tsx:104` | Sin `z-[n]` | `z-[1]` en la celda sticky de acciones. | `z-1`; se verificó que la clase se genera. | corregido |
| F3-15 | S4 | D2 | `DataTableCard.tsx:15` | Comportamiento propio de los controles | `INTERACTIVE_SELECTOR` no incluía `select`, `textarea`, `[role=button\|link\|switch\|combobox]`. Un control así dentro de una celda abría el detalle además de su propia acción. | Agregados. | corregido |
| F3-16 | S4 | D1 | `DataTableToolbar.tsx:214` · `DataTableDesktop.tsx:54` | Foco visible | El outline global (2px + 2px de offset) se recorta en dos lugares: en la tira de chips mobile (`overflow-x-auto`) y en el botón de cabecera de la primera columna (`-mx-3`) contra el borde del scroller. Se sigue viendo un borde parcial. | Pendiente (Fase 6 o un pulido): `outline-offset:-2px` en esos dos lugares. | abierto |
| F3-17 | S4 | A4 | `DataTableColumnHeader.tsx:63` | Tamaños sueltos | `text-[10px]` en el índice de multi-sort. | No hay un rol de 10px. Queda abierto y anotado. | abierto |
| F3-18 | S3 | R-5 / F5 | `DataTable.tsx:680-702` | `rendering-content-visibility` / `rerender-memo` | DOM doble: las tarjetas se renderizan en React también en desktop, aunque estén ocultas por CSS. Ya lo mitigan tres cosas:<br>- `content-visibility:auto` en cada `li`;<br>- `memo` en la tarjeta, con props estables (al tildar solo se re-renderiza la tarjeta afectada);<br>- la tarjeta usa ≤ 7 celdas contra todas las de la fila.<br>La estimación es de +20 a +60% de trabajo de render según la tabla. Supera el criterio de +20% del plan en las tablas con pocas columnas visibles. | Medir en DevTools (cambio de página con 100 filas en Empleados y Preparte). Si supera el +20%, aplicar P-12 (b). | abierto (medición) |
| F3-19 | S3 | D2 / R-6 | `DataTableMoreMenu.tsx:188,194` | Foco en overlays | "Columnas…" y "Mostrar filtros…" abren un `ResponsiveDialog` desde `onSelect` de un `DropdownMenuItem`. Radix devuelve el foco al trigger al cerrar el menú mientras el dialog abre: es un patrón conocido de pelea de foco y de `pointer-events:none` que queda en el body, sobre todo con vaul en mobile. | Verificar en el navegador. Si falla, `onCloseAutoFocus={(e) => e.preventDefault()}` en `DropdownMenuContent`, o abrir el dialog en el próximo tick. | abierto (navegador) |
| F3-20 | S4 | P-10 | `DataTable.tsx:734` | Nunca encadenar modales | Dentro de un dialog (Ausencias), el detalle se expande en línea, pero el sheet de filtros y los dialogs del ⋯ abren **sobre** el dialog. Son paneles de configuración, no de flujo, así que se acepta. | Anotar en PLAN §9 si el usuario lo objeta. | abierto |

#### Verificaciones sin hallazgo

**Contrato §5.1:**
- **URL y filtros:** `use-url-text-filter.ts` y `use-url-date-range.ts` son copia literal del código anterior; se comparó línea a línea con `60fb9147^`: mismas claves, `pageKey`, `replaceState` y `router.replace`. Lo mismo vale para la lógica de `use-facet-filter.ts`: misma `queryKey` (`datatable-facet` + `facetScope`), `enabled` y `staleTime`.
- **Bloque client-side:** queryKey, `initialData` sembrado y `keepPreviousData`, sin cambios. Los efectos de preferencias tampoco cambiaron.
- **Selección:** `getRowId`, los dos callbacks y `clearSelectionTrigger` siguen igual. El conteo del pie usa `getFilteredSelectedRowModel()`, igual que antes; de ahí sale "1 seleccionado" con selección entre páginas.
- **Export:** mismos `exclude` y formatters. Solo se difiere el `import()` de `excel-export`.

**Testids (§5.2):** el diff no tiene ningún `-` que no reaparezca con `+`. Las altas son:
- `filter-<id>` en los filtros de texto y fecha (antes no tenían);
- `filter-chip-clear-*`;
- `table-*` nuevos;
- `pagination-page-*`.

`column-toggle` aparece dos veces en el código, en dos componentes que se renderizan de forma excluyente (con y sin reordenamiento).

**Cypress `preparte.cy.ts` (R-4), por código:** corre a 1920 y el riesgo es bajo.
- `confirmar-button-*` está en `actions`, que la tarjeta no renderiza (el detalle solo se monta al abrirlo), así que es único.
- `status-badge-*` queda duplicado, pero `should('exist').and('contain.text', …)` pasa igual con 2 elementos.
- `cy.contains(numero)` toma la fila de la grilla, que va primero en el DOM.
- "Confirmado por" no está en la tarjeta (no tiene rol `mobile`) y la columna está oculta por defecto, como antes.

**`_PreparteDataTable`:** `selectionActions` recibe `getSelectedRowModel().rows`. Son las filas de la página actual, igual que el `onRowSelectionChange` anterior. Como la selección se limpia al cambiar de estado, el payload de `onBulkStatus` es equivalente.

**Las 12 tablas del merge:**
- Ninguna usa props eliminadas: check-types en verde, y `ColumnMeta` tipado sin claves desconocidas.
- Todas van dentro de `<Card><CardContent>`, así que el borde se omite con `in-data-[slot=card-content]`.
- Ninguna celda usa `absolute` (R-7).
- Las de Clothing usan selección sin `selectionActions`: en desktop la toolbar se conserva y en mobile aparece la barra sticky con "Limpiar selección".
- Heurística pobre (R-8): en Clothing (3 tablas) el título de la tarjeta queda en `delivered_at`, una fecha. Va a la lista de la Fase 6, no se rediseña.

**Ausencias en dialog angosto (R-1/R-9):**
- `DialogContent` es `flex flex-col`; dentro, el contenedor `overflow-y-auto` es un bloque que se estira, y `Tabs` va con `w-full`. Por eso la raíz `@container` recibe el ancho del dialog y no colapsa a 0.
- Con viewport de 640 a ~816px, el dialog queda por debajo de 768px de contenedor y la tabla pasa a tarjetas. El detalle se expande en línea porque la tarjeta detecta `closest('[role=dialog]')`.

**Otras:**
- **E1:** todos los `<Button>` y `<button>` del alcance llevan `type`, verificado con un script sobre JSX. Los triggers de Radix lo ponen solos.
- **G4:** sin clases armadas en runtime; las variantes por modo están en `Record` literales.

#### Riesgos pendientes y lo que no se pudo verificar

- **Navegador:** no se levantó (regla del encargo). Todo lo de abajo queda para re-mirar:
  - F3-02 a F3-04 y F3-07;
  - F3-18 (medición);
  - F3-19 (foco del ⋯);
  - `/clothing/delivery` (F3-01).
- **Cypress:** no se corrió.
- **H5:** el conteo global de hardcodeados subió de 2707 a 2746. Viene de los módulos que llegaron con el merge: Warehouses 26, Clothing 35, Gomería 38 (en parte previos). La Fase 3 no suma: la carpeta del DataTable está en 0.

**Resumen:** S1 1 · S2 6 · S3 7 · S4 6. Corregidos: S1 1/1 · S2 6/6 · S3 5/7 · S4 3/6.

Quedan abiertos:
- S3: F3-18 (medir) y F3-19 (verificar en el navegador);
- S4: F3-16, F3-17 y F3-20.

**Veredicto:** S1 = 0 y S2 = 0 tras los fixes; `check-types` y `npm test` en verde. Antes de cerrar la fase faltan:
- verificar en el navegador lo listado arriba;
- que el usuario acepte o resuelva F3-18 y F3-19 (S3);
- anotar en PLAN §9 F3-16, F3-17 y F3-20 (S4).

<!-- estado: completo -->
