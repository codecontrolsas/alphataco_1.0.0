import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  type parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import { toFacetMap } from '@/shared/lib/table-facets';
import type { SingleFacetResult } from '@/shared/lib/table-list-query';

/**
 * Piezas que repiten las consultas de las listas del catálogo de ropa (marcas, artículos, talles):
 * el `where` por empresa con búsqueda, texto y fechas, y la faceta del estado activo.
 *
 * Sin `'use server'`: son helpers que importan las server actions de cada lista.
 */

/** Columnas que una lista de catálogo filtra como texto, como rango de fechas y en la búsqueda global. */
interface CatalogWhereColumns {
  searchColumns: string[];
  textColumns: string[];
  dateColumns: string[];
}

/** `where` de una lista del catálogo: empresa activa, búsqueda global y filtros de la tabla. */
export function buildClothingCatalogWhere(
  companyId: string,
  state: ReturnType<typeof parseSearchParams>,
  { searchColumns, textColumns, dateColumns }: CatalogWhereColumns
) {
  const searchWhere = buildSearchWhere(state.search, searchColumns);

  // Las columnas de texto y fecha las resuelven sus propios helpers: el filtro genérico las ignora.
  const manuallyHandled = [...textColumns, ...dateColumns.flatMap((c) => [`${c}_from`, `${c}_to`])];
  const filtersWhere = buildFiltersWhere(state.filters, {}, { exclude: manuallyHandled });

  const textFiltersWhere = buildTextFiltersWhere(state.filters, textColumns);

  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, dateColumns);

  return {
    company_id: companyId,
    ...searchWhere,
    ...filtersWhere,
    ...textFiltersWhere,
    ...dateFiltersWhere,
  };
}

/** Faceta "Estado" (`is_active`): cuántos registros hay activos e inactivos. */
export function isActiveFacet(rows: ReadonlyArray<{ is_active: boolean; _count: number }>): SingleFacetResult {
  return { counts: toFacetMap(rows.map((r) => ({ key: String(r.is_active), count: r._count }))) };
}
