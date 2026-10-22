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
