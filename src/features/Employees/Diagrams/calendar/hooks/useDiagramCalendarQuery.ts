'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  searchDiagramCalendar,
  type DiagramCalendarRow,
  type DiagramCalendarType,
} from '../../actions/diagram-search-actions';
import type { DiagramCalendarFilters } from '../utils/calendar-filters';

const PAGE_SIZE = 50;
/** Consultas frescas por 30 s: volver a la vista no repite el viaje, y el polling mantiene el resto al día. */
const STALE_TIME_MS = 30_000;
/** La grilla se mantiene al día por polling (antes: suscripción realtime de Supabase). */
const REFETCH_INTERVAL_MS = 60_000;

/** Raíz de la clave: las cargas de otras vistas invalidan `['diagram-search']` y también refrescan el calendario. */
const KEY_ROOT = ['diagram-search', 'calendar'] as const;

/** Clave solo con primitivos: la identidad de los arrays de filtros no cambia la caché. */
function buildKey(filters: DiagramCalendarFilters) {
  return [
    ...KEY_ROOT,
    filters.from,
    filters.to,
    filters.search,
    filters.position.join(','),
    filters.workflow.join(','),
    filters.costCenter.join(','),
    filters.covenant.join(','),
    filters.guild.join(','),
    filters.category.join(','),
    filters.contractor.join(','),
    filters.diagramType.join(','),
  ] as const;
}

const FROM_INDEX = KEY_ROOT.length;
const TO_INDEX = KEY_ROOT.length + 1;

/**
 * Páginas del calendario con "cargar más". El refetch periódico vuelve a pedir todas las páginas cargadas.
 * Al cambiar un filtro se conserva la grilla anterior mientras llega la nueva; si cambia la ventana de fechas no,
 * porque las columnas ya no coincidirían con los datos.
 */
export function useDiagramCalendarQuery(filters: DiagramCalendarFilters) {
  const query = useInfiniteQuery({
    queryKey: buildKey(filters),
    queryFn: ({ pageParam }) =>
      searchDiagramCalendar({
        search: filters.search,
        positions: filters.position,
        workflows: filters.workflow,
        costCenters: filters.costCenter,
        covenants: filters.covenant,
        guilds: filters.guild,
        categories: filters.category,
        contractors: filters.contractor,
        diagramTypes: filters.diagramType,
        page: pageParam,
        pageSize: PAGE_SIZE,
        dateFrom: filters.from,
        dateTo: filters.to,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) => (lastPage.hasMore ? pages.length + 1 : undefined),
    staleTime: STALE_TIME_MS,
    refetchInterval: REFETCH_INTERVAL_MS,
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[FROM_INDEX] === filters.from && previousQuery?.queryKey[TO_INDEX] === filters.to
        ? previousData
        : undefined,
  });

  const pages = query.data?.pages;
  const grid = useMemo(() => {
    const rows = new Map<string, DiagramCalendarRow>();
    const types = new Map<string, DiagramCalendarType>();
    for (const page of pages ?? []) {
      for (const row of page.rows) rows.set(row.id, row);
      for (const type of page.types) types.set(type.id, type);
    }
    return { rows: [...rows.values()], rowsById: rows, typesById: types, total: pages?.[0]?.total ?? 0 };
  }, [pages]);

  return { ...query, grid };
}
