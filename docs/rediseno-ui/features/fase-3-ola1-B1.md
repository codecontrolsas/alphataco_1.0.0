# Fase 3 — Ola 1 — B1 (toolbar y menús)

## Hecho
- `DataTableToolbar.tsx`: un solo DOM que se reacomoda por `@3xl/table`. Buscador con ícono (`type="search"`, `h-11` mobile / `h-8` desktop, sin hint Ctrl K), grupo de filtros con base `flex-[1_1_16rem]` (protección conservada), chip de orden (`clear-sorting` en la ✕), "Limpiar filtros" (`clear-filters`), "Filtros (n)", "Columnas", "Exportar", `toolbarActions`. Cuenta de filtros activos leída de la URL (mismas claves que los filtros; incluye fechas y columnas ocultas).
- Slots opcionales nuevos (props extra, tipo local `DataTableToolbarSlots`): `mobileFiltersTrigger`, `mobileSort`, `moreMenu`. Sin ellos la toolbar degrada a desktop también en angosto (nada se oculta).
- `DataTableFilterOptions.tsx`: botón "Filtros (n)" secondary + "Limpiar filtros" al pie; lógica de ocultar/guardar (P-15 intacto) extraída a `useFilterVisibilityToggle`; `DataTableFilterVisibilityList` para el ⋯.
- `DataTableViewOptions.tsx`: botón secondary sin `hidden lg:flex`, ícono `Columns3`, `getColumnLabel` de `mobile-columns`; cuerpo del panel de orden extraído (`ColumnOrderPanel`) y `DataTableColumnsPanel` exportado.
- `_DataTableExportButton.tsx`: `import()` de `excel-export` al hacer clic, hook `useDataTableExport`, sin `TooltipProvider`, "Exportando…" con `aria-busy`.
- `DataTableActiveFilterChip.tsx` (nuevo): chip presentacional (Título: valor +n ✕, ✕ de 44px en coarse).
- `DataTableMoreMenu.tsx` (nuevo): ⋯ con Columnas…, Mostrar filtros…, Exportar a Excel, Filas por página (radio). Lo que no existe no aparece.
- check-types: verde.

## Desvíos
- Los filtros de B2 aún no declaran `variant`: la toolbar los castea localmente (`WithVariant`) y les pasa `variant` ('chip' si el filtro tiene valor en la URL). Quitar el cast cuando B2 tipé la prop.
- Se quitó la fila secundaria con `Separator`: texto y fecha van en el mismo grupo con wrap (spec §3.3).
- Fecha del chip de orden: label de la columna con `getColumnLabel`.

## Pendientes para la ola 2 (A2)
- `DataTable.tsx`: construir `<DataTableMoreMenu table enableColumnReorder pageSizeOptions onExport={handleExport} isExporting showColumnToggle filterOptions={{filters, filterVisibility, onFilterVisibilityChange, tableId}} />` y pasarlo como `moreMenu`; usar `useDataTableExport` (exportado de `_DataTableExportButton.tsx`) para `onExport`. Pasar `mobileFiltersTrigger` y `mobileSort`.
- El botón de export de desktop sigue pasándose por `exportActions` (se oculta bajo `@3xl/table` solo si `moreMenu` está presente).
- `index.ts`: exportar `DataTableMoreMenu`, `DataTableActiveFilterChip`, `DataTableColumnsPanel`, `DataTableFilterVisibilityList`, `useDataTableExport`.
- `Tooltip` del export ya no trae `TooltipProvider`: depende del global del sidebar (`sidebar.tsx:131`).
- La toolbar trae `border-b px-3 py-2`: asume el panel de la raíz (borde, `bg-card`) que monta A2; la raíz aún usa `space-y-4`.
- El chip de filtro lo dibuja cada filtro de B2 con `variant="chip"`; el chip de orden usa `DataTableActiveFilterChip`.

<!-- estado: completo -->
