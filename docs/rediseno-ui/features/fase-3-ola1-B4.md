# Fase 3 · Ola 1 · B4 — componentes mobile del DataTable

Archivos nuevos (src/shared/components/common/DataTable/): DataTableCards.tsx, DataTableCard.tsx,
DataTableDetailSheet.tsx, DataTableSelectionBar.tsx. check-types en verde.

Desvíos:
- `selectionActions` sigue la firma de `types.ts` (`(selectedRows: Row<TData>[]) => ReactNode`), no el `ctx` del plan.
- Mobile: no se limita a 2 acciones visibles (el ReactNode es opaco); se envuelven.
- Título/estado del sheet van dentro del cuerpo (el `title` de ResponsiveDialog es string).
- DataTableDetailSheet exporta helpers compartidos con la tarjeta (renderRowCell, getRowTitleText, DataTableDetailBody).

Pendientes ola 2: montar en DataTable (detailRowId, layout memoizado, `inline` según contexto), prop `selectionActions`,
tarjetas después de la tabla.

<!-- estado: completo -->
