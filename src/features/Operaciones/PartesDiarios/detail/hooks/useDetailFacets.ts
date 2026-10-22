'use client';

import type {
  DataTableFacetedFilterConfig,
  DataTableSearchParams,
  FacetResult,
} from '@/shared/components/common/DataTable/types';
import { dailyReportRowStatusLabels, dailyReportTypeServiceLabels } from '@/shared/utils/mappers';
import { useCallback, useMemo } from 'react';
import { buildRowFacetResult, rowStatusIcons, type RowFacetOptions } from '../../../lib/row-facet-options';
import { getDailyReportDetailSingleFacet } from '../queries.server';

/**
 * Filtros facetados del detalle (lazy-load) y la lista de ids de filtros. Las opciones salen de:
 * - FK / texto: `resolvedOptions` del servidor;
 * - enum: `labels` (y `icons`);
 * - booleano: Sí / No.
 */
export function useDetailFacets(dailyReportId: string) {
  /** Crea el `fetchFacet` de una columna; la forma de las opciones depende de `FetchFacetOptions`. */
  const makeFetchFacet = useCallback(
    (columnId: string, options: RowFacetOptions = {}) => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getDailyReportDetailSingleFacet(dailyReportId, columnId, params);
        if (!result) return { options: [], counts: new Map() };
        return buildRowFacetResult(result, options);
      };
    },
    [dailyReportId]
  );

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      {
        columnId: 'status',
        title: 'Estado',
        fetchFacet: makeFetchFacet('status', { labels: dailyReportRowStatusLabels, icons: rowStatusIcons }),
      },
      { columnId: 'customer', title: 'Cliente', fetchFacet: makeFetchFacet('customer') },
      { columnId: 'service', title: 'Servicio', fetchFacet: makeFetchFacet('service') },
      { columnId: 'item', title: 'Ítem', fetchFacet: makeFetchFacet('item') },
      { columnId: 'sector', title: 'Sector', fetchFacet: makeFetchFacet('sector') },
      { columnId: 'area', title: 'Área', fetchFacet: makeFetchFacet('area') },
      {
        columnId: 'type_service',
        title: 'Tipo Servicio',
        fetchFacet: makeFetchFacet('type_service', { labels: dailyReportTypeServiceLabels }),
      },
      {
        columnId: 'working_day',
        title: 'Jornada',
        fetchFacet: makeFetchFacet('working_day', { nullLabel: 'Sin jornada' }),
      },
      { columnId: 'description', title: 'Descripción', type: 'text' as const, placeholder: 'Buscar en descripción...' },
      { columnId: 'remit_number', title: 'Nro Remito', type: 'text' as const, placeholder: 'Buscar remito...' },
      {
        columnId: 'completed_day',
        title: 'Completado Día',
        fetchFacet: makeFetchFacet('completed_day', { bool: true }),
      },
      {
        columnId: 'completed_night',
        title: 'Completado Noche',
        fetchFacet: makeFetchFacet('completed_night', { bool: true }),
      },
      {
        columnId: 'employees',
        title: 'Empleados',
        fetchFacet: makeFetchFacet('employees', { nullLabel: 'Sin empleados' }),
      },
      {
        columnId: 'equipment',
        title: 'Equipos',
        fetchFacet: makeFetchFacet('equipment', { nullLabel: 'Sin equipos' }),
      },
      {
        columnId: 'customer_equipment',
        title: 'Equipo cliente',
        fetchFacet: makeFetchFacet('customer_equipment', { nullLabel: 'Sin equipo cliente' }),
      },
    ],
    [makeFetchFacet]
  );

  /** Ids de todos los filtros, derivados de la configuración (no una lista aparte que se desincronice). */
  const allFilterIds = useMemo(() => facetedFilters.map((filter) => filter.columnId), [facetedFilters]);

  return { facetedFilters, allFilterIds };
}
