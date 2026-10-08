# Fase 3 — Ola 1 — B2 (filtros)

- [x] `filters/use-facet-filter.ts`: `useFacetFilter({column, options, externalCounts, isFetching, fetchFacet, facetParams, facetScope})`. Copia literal del `useQuery` lazy (misma queryKey, eager con valor en URL, `keepPreviousData`, `staleTime` 5 min), `visibleOptions`/`prevVisibleOptionsRef`. Devuelve `markOpened`, `toggleValue`, `clear`, `selectedValues`, `selectedLabels`, `triggerShowsSkeleton`, etc.
- [x] `filters/FacetOptionsList.tsx` (cuerpo `Command`; `title`, `state`, `className`).
- [x] `filters/use-url-text-filter.ts` + `TextFilterBody.tsx` (`autoFocus` opcional).
- [x] `filters/use-url-date-range.ts` (`rangeLabel`, `setFrom`, `setTo`, `clearFilter`) + `DateRangeFilterBody.tsx`.
- [x] `filters/FilterChipShell.tsx`: `FilterTriggerButton` y `FilterChip` (ya dentro de un `<Popover>`).
- [x] `filters/index.ts`.
- [x] Los tres componentes con `variant?: 'trigger' | 'chip'` (chip sin valor se ve como trigger).
- [x] check-types: verde.

## Desvíos / pendientes
- `variant` no está en `DataTableFacetedFilterProps` (types.ts no es mío): se tipó con una intersección local. Pendiente: sumarlo en types.ts.
- Testids: `filter-<col>` también en texto y fechas; ✕ del chip: `filter-chip-clear-<col>`.
- Trigger ya no muestra badges con el valor (eso pasa al chip, §4.0 de B1).

<!-- estado: completo -->
