'use client';

import type { DataTableFacetedFilterConfig, DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { useCallback, useMemo, useState } from 'react';

interface UseServerTableViewOptions {
  searchParams: DataTableSearchParams;
  /** Id de la tabla: también es el namespace de sus params de URL. */
  tableId: string;
  /** Columnas ocultas hasta que el usuario las active. */
  hiddenColumnsByDefault: readonly string[];
  /** Filtros visibles hasta que el usuario elija otros. */
  defaultVisibleFilters: readonly string[];
  facetedFilters: DataTableFacetedFilterConfig[];
  /** Preferencia guardada de columnas visibles (pisa los valores por defecto). */
  initialColumnVisibility?: Record<string, boolean>;
  /** Preferencia guardada de filtros visibles. Solo se respeta si se pasa. */
  savedFilterVisibility?: Record<string, boolean>;
}

/**
 * Estado de vista de una tabla con paginación en el servidor: los params actuales (para exportar con los
 * mismos filtros), la visibilidad inicial de columnas y filtros, y las props de `DataTable` que se repetían
 * en cada cliente `_XDataTable`.
 */
export function useServerTableView({
  searchParams,
  tableId,
  hiddenColumnsByDefault,
  defaultVisibleFilters,
  facetedFilters,
  initialColumnVisibility,
  savedFilterVisibility,
}: UseServerTableViewOptions) {
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);
  const handleStateChange = useCallback((params: DataTableSearchParams) => setCurrentParams(params), []);

  const columnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(hiddenColumnsByDefault.map((c) => [c, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [hiddenColumnsByDefault, initialColumnVisibility]);

  const filterVisibility = useMemo(() => {
    if (savedFilterVisibility && Object.keys(savedFilterVisibility).length > 0) return savedFilterVisibility;
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, defaultVisibleFilters.includes(f.columnId)]));
  }, [savedFilterVisibility, facetedFilters, defaultVisibleFilters]);

  return {
    currentParams,
    /** Props comunes para `<DataTable {...tableProps} />`. */
    tableProps: {
      searchParams,
      tableId,
      paramNamespace: tableId,
      facetedFilters,
      initialColumnVisibility: columnVisibility,
      initialFilterVisibility: filterVisibility,
      showFilterToggle: true,
      onStateChange: handleStateChange,
    },
  };
}
