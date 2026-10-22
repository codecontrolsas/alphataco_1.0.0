'use client';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useDataTableFilter } from '@/shared/components/common/DataTable/useDataTableFilter';
import { IsoFigure } from '@/shared/components/iso/IsoFigure';
import { useIsoSelect } from '@/shared/components/iso/use-iso-select';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { getTireRackData } from '../../actions/tire-list.server';
import {
  RACK_STATUS_ORDER,
  RACK_STATUS_TEXT,
  RACK_STATUS_TONE,
  buildTireRackSvg,
  parseRackGroupId,
  rackGroupId,
  type RackStatus,
  type RackTone,
} from './tire-rack-geometry';

/** Máximo de repisas dibujadas; si hay más medidas se muestran las de más cubiertas y el resto queda en la tabla. */
const MAX_SHELVES = 12;

/** Cuelga de `['tires-catalog']`: las mutaciones del catálogo ya invalidan ese prefijo. */
const TIRE_RACK_QUERY_KEY = ['tires-catalog', 'rack'] as const;

/** Variable de tema de cada tono: nunca colores fijos. */
const TONE_VAR: Record<RackTone, string> = {
  green: 'var(--status-ok)',
  blue: 'var(--status-info)',
  amber: 'var(--status-warn)',
  red: 'var(--status-danger)',
  none: 'var(--muted-foreground)',
};

function Swatch({ tone, dashed = false, struck = false }: { tone: RackTone; dashed?: boolean; struck?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block size-3 shrink-0 rounded-full border-2',
        dashed && 'border-dotted',
        struck && 'opacity-60'
      )}
      style={{ borderColor: TONE_VAR[tone] }}
    />
  );
}

interface TireRackProps {
  /** Namespace de params de la tabla del catálogo: el filtro se escribe en su URL. */
  paramNamespace: string;
}

/**
 * Estantería isométrica: una repisa por medida y, encima, las cubiertas agrupadas por estado. Tocar un grupo
 * filtra la tabla del catálogo por esa medida y ese estado (los mismos filtros `size` y `status` de la tabla).
 */
export default function TireRack({ paramNamespace }: TireRackProps) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: TIRE_RACK_QUERY_KEY,
    queryFn: () => getTireRackData(),
    staleTime: 30_000,
  });
  const [statusFilter, , setFilters] = useDataTableFilter(paramNamespace, 'status');
  const [sizeFilter] = useDataTableFilter(paramNamespace, 'size');

  const shelves = useMemo(() => {
    const all = data ?? [];
    if (all.length <= MAX_SHELVES) return all;
    const total = (shelf: (typeof all)[number]) => Object.values(shelf.counts).reduce((acc, n) => acc + (n ?? 0), 0);
    return [...all]
      .sort((a, b) => total(b) - total(a))
      .slice(0, MAX_SHELVES)
      .sort((a, b) => a.size.localeCompare(b.size, 'es', { numeric: true }));
  }, [data]);
  const hidden = (data?.length ?? 0) - shelves.length;

  const selected = sizeFilter && statusFilter ? rackGroupId(sizeFilter, statusFilter as RackStatus) : null;

  const totals = useMemo(() => {
    const sum: Record<RackStatus, number> = { AVAILABLE: 0, INSTALLED: 0, IN_REPAIR: 0, MISSING: 0, DISCARDED: 0 };
    for (const shelf of data ?? []) for (const status of RACK_STATUS_ORDER) sum[status] += shelf.counts[status] ?? 0;
    return sum;
  }, [data]);
  const shortage = useMemo(() => (data ?? []).reduce((acc, shelf) => acc + (shelf.shortage ?? 0), 0), [data]);

  const figure = useMemo(() => buildTireRackSvg({ shelves, selected }), [shelves, selected]);

  const handleSelect = useCallback(
    (id: string | null) => {
      if (id === null) return;
      const group = parseRackGroupId(id);
      if (!group) return;
      if (id === selected) setFilters({ size: null, status: null });
      else setFilters({ size: group.size, status: group.status });
    },
    [selected, setFilters]
  );
  const { onClick, onKeyDown } = useIsoSelect(handleSelect);

  if (isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label="Cargando la estantería de cubiertas">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-5 w-2/3" />
      </div>
    );
  }

  if (isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-dashed p-4 text-sm">
        <span className="text-muted-foreground">No se pudo cargar la estantería de cubiertas.</span>
        <Button type="button" size="sm" variant="outline" disabled={isFetching} onClick={() => void refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (shelves.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">
        Todavía no hay cubiertas cargadas, así que la estantería está vacía. Cargá cubiertas desde la tabla.
      </p>
    );
  }

  const selectedGroup = selected ? parseRackGroupId(selected) : null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-3">
      <div
        onClick={onClick}
        onKeyDown={onKeyDown}
        // La figura es angosta en celular: se puede deslizar sin romper la página.
        className="max-w-full overflow-x-auto"
      >
        <div className="min-w-[520px]">
          <IsoFigure svg={figure.svg} />
        </div>
      </div>

      <ul
        className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
        aria-label="Leyenda de estados"
      >
        {RACK_STATUS_ORDER.filter((status) => totals[status] > 0 || status === 'AVAILABLE').map((status) => (
          <li key={status} className="flex items-center gap-1.5">
            <Swatch tone={RACK_STATUS_TONE[status]} dashed={status === 'MISSING'} struck={status === 'DISCARDED'} />
            <span className="tabular-nums">{totals[status]}</span> {RACK_STATUS_TEXT[status].plural}
          </li>
        ))}
        {shortage > 0 && (
          <li className="flex items-center gap-1.5">
            <Swatch tone="none" dashed />
            <span className="tabular-nums">{shortage}</span> por debajo del mínimo
          </li>
        )}
        <li>«+N»: cubiertas que no entran en el dibujo</li>
      </ul>

      <p className="text-xs" aria-live="polite">
        {selectedGroup ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">
              Tabla filtrada: medida {selectedGroup.size}, {RACK_STATUS_TEXT[selectedGroup.status].plural}.
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => setFilters({ size: null, status: null })}
            >
              Quitar filtro
            </Button>
          </span>
        ) : (
          <span className="text-muted-foreground">
            Tocá un grupo de la estantería para filtrar la tabla por medida y estado.
          </span>
        )}
        {hidden > 0 && (
          <span className="text-muted-foreground">
            {' '}
            Se muestran las {MAX_SHELVES} medidas con más cubiertas; {hidden} más están en la tabla.
          </span>
        )}
      </p>
    </div>
  );
}
