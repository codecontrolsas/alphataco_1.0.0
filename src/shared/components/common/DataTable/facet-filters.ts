import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type {
  DataTableFacetedFilterConfig,
  DataTableFilterOption,
  DataTableSearchParams,
  FacetResult,
} from '@/shared/components/common/DataTable/types';
import type { SingleFacetResult } from '@/shared/lib/table-list-query';
import { CircleOff, type LucideIcon } from 'lucide-react';

/** Faceta vacía: lo que se muestra mientras la acción no devuelve datos (sin permiso o con error). */
export const EMPTY_FACET: FacetResult = { options: [], counts: new Map() };

/** Acción de servidor que devuelve los conteos de UNA columna (`get…SingleFacet`). */
type SingleFacetFetcher = (columnId: string, params: DataTableSearchParams) => Promise<SingleFacetResult>;

type NullOption = { label: string; icon?: LucideIcon };

const nullOptionIfCounted = (counts: Map<string, number>, nullOption?: NullOption): DataTableFilterOption[] =>
  nullOption && counts.has(NULL_FILTER_VALUE)
    ? [{ value: NULL_FILTER_VALUE, label: nullOption.label, icon: nullOption.icon ?? CircleOff }]
    : [];

/** Opciones de un enum con la etiqueta (y el ícono, si lo tiene) de cada valor. */
export function enumFilterOptions(
  values: readonly string[],
  labels: Record<string, string>,
  icons?: Record<string, LucideIcon | undefined>
): DataTableFilterOption[] {
  return values.map((value) => ({
    value,
    label: labels[value] ?? value,
    ...(icons?.[value] ? { icon: icons[value] } : {}),
  }));
}

/** Filtro de texto libre de una columna. */
export function textFilter(columnId: string, title: string, placeholder: string): DataTableFacetedFilterConfig {
  return { columnId, title, type: 'text', placeholder };
}

/** Filtro por rango de fechas de una columna. */
export function dateRangeFilter(columnId: string, title: string): DataTableFacetedFilterConfig {
  return { columnId, title, type: 'dateRange' };
}

/**
 * Fábrica de filtros facetados cargados por demanda desde una acción `get…SingleFacet`. Evita repetir en
 * cada tabla el `fetchFacet` (pedir conteos, caer a `EMPTY_FACET` y armar las opciones).
 */
export function createFacetFilters(fetchSingleFacet: SingleFacetFetcher) {
  return {
    /** Columna con opciones conocidas de antemano (estados, tipos): el servidor solo aporta los conteos. */
    fixed(
      columnId: string,
      title: string,
      options: DataTableFilterOption[],
      nullOption?: NullOption
    ): DataTableFacetedFilterConfig {
      return {
        columnId,
        title,
        fetchFacet: async (params) => {
          const result = await fetchSingleFacet(columnId, params);
          if (!result) return EMPTY_FACET;
          return { options: [...options, ...nullOptionIfCounted(result.counts, nullOption)], counts: result.counts };
        },
      };
    },
    /** Columna cuyas opciones (proveedor, creador, solicitud…) las resuelve el servidor junto con los conteos. */
    lookup(columnId: string, title: string, icon?: LucideIcon, nullOption?: NullOption): DataTableFacetedFilterConfig {
      return {
        columnId,
        title,
        fetchFacet: async (params) => {
          const result = await fetchSingleFacet(columnId, params);
          if (!result) return EMPTY_FACET;
          return {
            options: [
              ...(result.resolvedOptions ?? []).map((o) => ({ value: o.id, label: o.name ?? '', icon })),
              ...nullOptionIfCounted(result.counts, nullOption),
            ],
            counts: result.counts,
          };
        },
      };
    },
  };
}
