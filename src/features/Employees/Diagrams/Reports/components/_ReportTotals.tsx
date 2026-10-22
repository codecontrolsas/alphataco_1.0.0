'use client';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getContrastTextColor } from '../../lib/color-contrast';
import { getDiagramReportTotals } from '../actions.server';

/** Params que no cambian los totales: pasar de página u ordenar no debe volver a pedirlos. */
const NON_FILTER_KEYS = new Set(['page', 'pageSize', 'sort', 'sortBy', 'sortOrder']);

interface ReportTotalsProps {
  /** Estado actual de la tabla (filtros, búsqueda, período). */
  params: DataTableSearchParams;
}

const numberFormat = new Intl.NumberFormat('es-AR');

/** Cantidad de novedades por tipo con los filtros que tiene la tabla: se actualiza al filtrar, no al paginar. */
export function ReportTotals({ params }: ReportTotalsProps) {
  const filterParams = useMemo(() => {
    const entries = Object.entries(params).filter(([key]) => !NON_FILTER_KEYS.has(key));
    return Object.fromEntries(entries) as DataTableSearchParams;
  }, [params]);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['diagram-report-totals', JSON.stringify(filterParams)],
    queryFn: () => getDiagramReportTotals(filterParams),
    staleTime: 30 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex flex-wrap gap-2" aria-busy="true" aria-label="Cargando totales por novedad">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-32 rounded-md" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div role="alert" className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
        <span>No se pudieron calcular los totales por novedad.</span>
        <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (data.items.length === 0) return null;

  return (
    <section aria-label="Totales de novedades con los filtros actuales" className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">
        <span className="text-foreground font-medium tabular-nums">{numberFormat.format(data.total)}</span>{' '}
        {data.total === 1 ? 'novedad' : 'novedades'} con los filtros actuales
      </p>
      <ul className="flex flex-wrap gap-2">
        {data.items.map((item) => (
          <li
            key={item.id}
            className="bg-card flex min-w-0 items-center gap-2 rounded-md border py-1 pr-3 pl-1 text-sm"
          >
            <span
              className="inline-flex h-6 min-w-8 shrink-0 items-center justify-center rounded px-1 text-xs font-medium"
              style={{ background: item.color, color: getContrastTextColor(item.color) }}
              aria-hidden="true"
            >
              {item.shortDescription}
            </span>
            <span className="truncate">{item.name}</span>
            <span className="font-medium tabular-nums">{numberFormat.format(item.count)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
