# Fase 3 — DataTable: progreso

## Ola 0

- [x] 1. `types.ts`: `ColumnMeta` tipado (`title`, `excludeFromExport`, `exportFormatter`, `mobile`) + contratos de la ola 1
  (`MobileLayout`, `MobileColumnEntry`, `DataTableDesktopProps`, `DataTableCardsProps`, `DataTableDetailSheetProps`,
  `DataTableSelectionBarProps`, `DataTableFilterVariant`, `DataTableViewStateProps`) y props opcionales `mobileLayout`
  y `selectionActions` en `DataTableProps` (sin consumir todavía).
  - Archivos: `src/shared/components/common/DataTable/types.ts`
  - check-types: verde. Ningún `columns.tsx` falló al tipar (R-3: sin typos ni claves de `meta` no declaradas).
- [x] 2. `mobile-columns.ts` (puro, sin directiva): `resolveMobileLayout`, `getColumnLabel`.
  - Archivos: `src/shared/components/common/DataTable/mobile-columns.ts` (nuevo)
  - check-types: verde.
- [x] 3. `DataTable.tsx`: raíz `@container/table w-full min-w-0 overflow-x-clip [overflow-clip-margin:2px]`.
  Reacomodo mínimo de §3.2.3: toolbar (fila con `flex-wrap`, grupo derecho sin `shrink-0` y con `flex-wrap`,
  buscador con `max-w-full`) y pie (`flex-wrap` con `gap`, sin `space-x`).
  - Archivos: `DataTable.tsx`, `DataTableToolbar.tsx`, `DataTablePagination.tsx`
  - check-types: verde.
- [x] 4. `globals.css`: utilidades `scroll-fade-start` y `scroll-fade-end` (keyframes propios, mismo `@property`
  y mismo `@supports` que `scroll-fade-x`). `SimpleTable`: `scroll-fade-end` en el `containerClassName`.
  - Archivos: `src/app/globals.css`, `src/shared/components/data-display/SimpleTable.tsx`
  - check-types: verde.
- [x] 5. `npm run check-types`: verde al cierre.

### Desvíos

- **Borde condicional de la raíz: no se agregó.** Hoy la raíz no tiene borde (la caja con borde es el scroller de la
  tabla), así que `in-data-[slot=card-content]:border-0` no tiene qué anular. Pasa a la ola 2, cuando la raíz traiga
  su propio panel (`data-slot="card-content"` verificado en `card.tsx:100`; `Panel` aún sin slot propio).
- La raíz mantiene `space-y-4` (la geometría de panel es de las olas 1-3).
- El tipo `ColumnMeta` declara `exportFormatter` con la firma `(value: unknown, row: TData) => string | number | null`;
  `excel-export.ts` sigue con su tipo local (no se tocó).
- `index.ts` no se tocó (es de la ola 2): los tipos nuevos se importan de `./types`.
- `scroll-fade-start` queda definida pero sin aplicar al scroller del DataTable (se aplica con `DataTableDesktop`, ola 1-B3).

### Hallazgos para la Fase 6

- (ninguno nuevo en esta ola)

<!-- ola 0: completa -->

## Ola 2 (integración)

- [x] 1. `DataTable.tsx`: raíz = panel (`border border-border bg-card @container/table w-full min-w-0 overflow-x-clip`, `data-slot="data-table"`). Borde omitido dentro de `card-content` / `panel-body` (`in-data-[slot=...]:border-0`). Sin `space-y-4` ni el `rounded-md border overflow-auto` viejo. `<p role="status" class="sr-only">` siempre montado ("N resultados" + "N seleccionados"). Defaults hoisteados (`EMPTY_FILTERS`, `EMPTY_PARAMS`, `EMPTY_VISIBILITY`) y `filterableColumns` memoizado. El bloque client-side (query, `initialData`, `isInitialQueryState`) y los efectos de preferencias no se tocaron; solo se leen `isError`, `isFetching` y `refetch` del mismo `useQuery`.
- [x] 2. `DataTableDesktop` montado: `isInitialLoading = isRemoteQuery && !queryResult && isFetching && !hasRealInitialData`; `isRefetching = isPending` (= `isPlaceholderData` en remote; navegación pendiente en server mode; reemplaza el `opacity-50`); `isError`/`onRetry` (`refetch`); `hasActiveFilters` (filtros o búsqueda) / `onClearFilters` (`resetFilters`); `emptyMessage`/`emptyDescription` (prop nueva). `scroll-fade-start` ya venía en el scroller.
- [x] 3. Tarjetas: `DataTableCards` después de la grilla en el DOM; `layout` memoizado con `resolveMobileLayout`; `detailRowId` en estado con `onOpenDetail` estable; `DataTableDetailSheet` fuera de la lista; mismos estados que el desktop; barra de refetch también arriba de las tarjetas.
- [x] 4. `DataTableSelectionBar`: `placement="toolbar"` (reemplaza la toolbar en desktop solo con `selectionActions` y selección > 0) y `placement="sticky-bottom"` (mobile, siempre que haya selección). Firma final: `selectionActions(selectedRows: Row<TData>[], clear: () => void)`; `clear` es 2º parámetro opcional, compatible con Preparte.
- [x] 5. Toolbar: `moreMenu` (`DataTableMoreMenu` con `useDataTableExport`, `pageSizeOptions` o el default, `filterOptions`), `mobileFiltersTrigger` y `mobileSort`.
- [x] 6. Filtros: `variant` en `DataTableFacetedFilterProps`; quitados la intersección local y los casts de la toolbar. `DataTableMobileFilters.tsx` (nuevo): disparadores `DataTableMobileFiltersTrigger` / `DataTableMobileSortTrigger`, sheet con "Ordenar por" (RadioGroup + ToggleGroup, multi-sort visible con "Quitar orden") y acordeón con TODOS los filtros (los activos primero y abiertos, orden fijado al abrir), cuerpos de `filters/` con `autoFocus={false}` y `markOpened()` al expandir, footer "Limpiar" / "Ver N resultados".
- [x] 7. `_PreparteDataTable.tsx`: quitados `toolbarActions` ("Cambiar estado" duplicado) y, por quedar sin lectores, el estado `selectedRows` y `onRowSelectionChange`. Permisos y lógica de `onBulkStatus` intactos.
- [x] 8. `index.ts`: exporta `DataTableMoreMenu`, `DataTableActiveFilterChip`, `DataTableColumnsPanel`, `DataTableFilterVisibilityList`, `useDataTableExport`, `DataTableDesktop`, `DataTableCards`, `DataTableCard`, `DataTableDetailSheet`, `DataTableSelectionBar`, `DataTableMobileFilters*`, `getColumnLabel`, `resolveMobileLayout` y los tipos nuevos.
- [x] 9. `mobileLayout="table"`: sin tarjetas, sin ⋯, sin sheet de filtros; la grilla no se oculta. Ninguna tabla lo usa.
- [x] 10. `DOCS.md`: secciones "Modo mobile (tarjetas)" (`meta.mobile`, heurística, `mobileLayout`, `selectionActions`, estados, testids), tabla de props y componentes; "Card wrapper obligatorio" pasa a "Panel del DataTable".
- [x] 11. `npm run check-types`: verde.

### Ajustes de integración en archivos de la ola 1 (mínimos)

- `DataTablePagination.tsx`: `DEFAULT_PAGE_SIZE_OPTIONS` exportado (el ⋯ necesita la lista por defecto).
- `DataTableToolbar.tsx`: `useActiveFilterIds` exportado (lo usan el disparador y el sheet de filtros).
- `DataTableDesktop.tsx`: prop `hideWhenNarrow` (`hidden @3xl/table:block`); `types.ts` la declara.
- `DataTableCards.tsx`: con error y filas previas, las filas siguen visibles bajo el callout (paridad con la grilla); el vacío usa `DataTableEmptyContent` (sin la descripción genérica inventada).
- `DataTableSelectionBar.tsx`: se quitó `role="status"` del conteo (lo anuncia la live region de la raíz, siempre montada); el testid de la barra sticky es `table-selection-bar-mobile` para no duplicar `table-selection-bar`; recibe `clear`.
- `filters/TextFilterBody.tsx`: prop `inputClassName` (input de 44px / 16px en el sheet mobile).

### Desvíos

- `DataTableDetailSheet` se monta sin `inline`: la tarjeta ya decide en el evento (`closest('[role="dialog"]')`) y dentro de un dialog expande en línea sin llamar a `onOpenDetail`, así que el sheet nunca se abre ahí.
- Los overlays mobile (sheet de detalle, sheet de filtros) se montan recién al abrirlos por primera vez, para no sumar un `ResponsiveDialog` con media query por tabla (la página de Mantenimiento monta ~25 tablas).
- `selectionActions` en desktop con la toolbar oculta por CSS: el foco no se mueve a "Limpiar selección" si estaba dentro de la toolbar (la barra lo toma solo cuando `document.activeElement` es `body`).
- Se agregó `logger.warn` (una vez por tabla) cuando una página tiene más de 100 filas (R-10).
- El export de la toolbar desktop sigue pasando por `exportActions` (su propio hook); el ⋯ mobile usa otra instancia de `useDataTableExport`. Solo uno es visible por vez.

### Hallazgos para la Fase 6

- Preparte sigue con facetas bulk (`getPreparteFacets`, `options`/`externalCounts`, `isFetchingFacets`): no se migró.
- `index.ts` sigue reexportando `exportToExcel` estáticamente desde el barrel (bundle-barrel-imports): medir con `npm run build` antes de tocarlo.
- `.claude/rules/datatable.md` todavía dice "Card wrapper obligatorio" (se actualiza en la Fase 9 con aprobación).

<!-- estado: completo -->
