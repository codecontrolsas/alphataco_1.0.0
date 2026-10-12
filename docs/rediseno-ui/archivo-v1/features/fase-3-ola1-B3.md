# Fase 3 — Ola 1, agente B3: progreso

- [x] `DataTableColumnHeader.tsx`: botón ghost de alto completo (`-mx-3`), `text-overline`; flecha de 12px solo en la columna ordenada, `ChevronsUpDown` en hover/foco; índice multi-sort en cuadrado mono. Menú y testids intactos.
- [x] `DataTablePagination.tsx`: pie `1–50 de 387` (0 -> "0 resultados"; "N seleccionado(s)" con plural), select "50 / pág.", `‹ 1 2 … 8 ›` con ventana de 5 y `aria-current`, `«`/`»` desde `@5xl/table`. Un solo DOM: bajo `@3xl/table` queda "‹ rango ›" centrado con botones de 44x44, sin select ni números. `flex-wrap` conservado. Testids `pagination-*` y `page-size-select` conservados; nuevo `pagination-page-N`.
- [x] `DataTableStates.tsx` (nuevo): `DataTableEmptyContent`, `DataTableEmptyRow`, `DataTableSkeletonRows`, `DataTableErrorCallout`, `DataTableRefetchBar` (reutilizables por las tarjetas de B4).
- [x] `DataTableDesktop.tsx` (nuevo): header sticky h-8 con `aria-sort`, filas h-9, seleccionada con `primary-soft` + inset 2px, columna `actions` sticky, `scroll-pt-8`, `scroll-fade-start`, estados. Sin montar (lo integra la ola 2).
- [x] `TableSkeleton.tsx`: geometría nueva (toolbar 48, header 32, filas 36, pie 44, borde 1px, sin radio).
- [x] `npm run check-types`: verde.

## Desvíos
- `EmptyState` exige `description`: se pasa `''` (o `emptyDescription`) y se oculta el `<p>` vacío con `[&_p:empty]:hidden`.
- Barra de refetch: sin keyframe de "indeterminada" disponible, usa `animate-pulse` (estática con `motion-reduce`).
- Con `isError` y sin filas no se dibuja el vacío (afirmaría "no hay datos" cuando falló la carga); solo el callout.
- El pie trae su propio `border-t bg-panel-2 px-3 min-h-11`; hasta la ola 2 se ve suelto bajo el `space-y-4` actual.

## Pendientes para la ola 2
- Montar `DataTableDesktop` pasando `isInitialLoading`, `isRefetching` (isPlaceholderData), `isError`/`onRetry` (refetch), `hasActiveFilters`, `onClearFilters`, `emptyMessage`/`emptyDescription`; el `isPending` actual (`opacity-50`) pasa a `isRefetching`.
- La raíz debe aportar borde/`bg-card`, el `<p role="status" class="sr-only">` y el padre `@container/table` (el pie depende de `@3xl/table`/`@5xl/table`; verificar que Tailwind genere esos breakpoints de container con nombre).
- Pie sin `space-y-4` alrededor; quitar el `rounded-md border overflow-auto` viejo de `DataTable.tsx`.

<!-- estado: completo -->
