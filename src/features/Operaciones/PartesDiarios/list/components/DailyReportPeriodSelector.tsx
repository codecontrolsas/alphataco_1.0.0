'use client';

import { Button } from '@/components/ui/button';
import { argentinaDate } from '@/features/Jobs/lib/dates';
import { useDataTableFilter } from '@/shared/components/common/DataTable';
import moment from 'moment';

type PeriodId = 'last15' | 'month' | 'all';

interface Period {
  id: PeriodId;
  label: string;
}

const PERIODS: Period[] = [
  { id: 'last15', label: 'Últimos 15 días' },
  { id: 'month', label: 'Este mes' },
  { id: 'all', label: 'Todos' },
];

interface DailyReportPeriodSelectorProps {
  /** Namespace de params de la tabla. */
  paramNamespace: string;
  /** Valores con los que se renderizó el servidor (evita el salto de hidratación). */
  serverFrom: string | null;
  serverTo: string | null;
}

/** Rango `YYYY-MM-DD` de cada período, calculado sobre el "hoy" argentino. `null` = sin rango. */
function getRange(id: PeriodId): { from: string; to: string } | null {
  if (id === 'all') return null;
  const today = moment.utc(argentinaDate());
  if (id === 'last15') {
    return { from: today.clone().subtract(14, 'days').format('YYYY-MM-DD'), to: today.format('YYYY-MM-DD') };
  }
  return { from: today.clone().startOf('month').format('YYYY-MM-DD'), to: today.clone().endOf('month').format('YYYY-MM-DD') };
}

/**
 * Atajos de período para la columna `date`. Escriben `date_from` / `date_to` en la URL de la
 * tabla (los mismos params del filtro de rango), así que la tabla y el filtro quedan sincronizados.
 */
export function DailyReportPeriodSelector({ paramNamespace, serverFrom, serverTo }: DailyReportPeriodSelectorProps) {
  const [from, , setFilters] = useDataTableFilter(paramNamespace, 'date_from', serverFrom);
  const [to] = useDataTableFilter(paramNamespace, 'date_to', serverTo);

  const isActive = (id: PeriodId) => {
    const range = getRange(id);
    if (!range) return !from && !to;
    return from === range.from && to === range.to;
  };

  const select = (id: PeriodId) => {
    const range = getRange(id);
    // Un solo cambio de URL: dos escrituras seguidas harían dos refetch de la tabla.
    setFilters({ date_from: range?.from ?? null, date_to: range?.to ?? null });
  };

  return (
    <div role="group" aria-label="Período" className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-sm">Período</span>
      {PERIODS.map((period) => (
        <Button
          key={period.id}
          type="button"
          size="sm"
          variant={isActive(period.id) ? 'default' : 'outline'}
          aria-pressed={isActive(period.id)}
          onClick={() => select(period.id)}
        >
          {period.label}
        </Button>
      ))}
    </div>
  );
}
