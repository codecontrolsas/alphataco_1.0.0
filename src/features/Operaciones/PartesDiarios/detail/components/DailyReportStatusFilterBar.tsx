'use client';

import { cn } from '@/lib/utils';
import { useDataTableFilter } from '@/shared/components/common/DataTable/useDataTableFilter';
import { DETAIL_PARAM_NAMESPACE } from '../constants';
import { useDailyReportStatusSummary } from '../hooks/useDailyReportStatusSummary';

interface Option {
  /** Valor del filtro `status`; `null` = sin filtro (Todas). */
  value: string | null;
  label: string;
  count: number | undefined;
}

/** Pestañas de estado: escriben el filtro `status` de la tabla (misma URL, sin navegar). */
export function DailyReportStatusFilterBar({
  dailyReportId,
  serverStatus,
}: {
  dailyReportId: string;
  /** Filtro `status` con el que se renderizó el servidor (evita que parpadee "Todas" antes de leer la URL). */
  serverStatus: string | null;
}) {
  const { data: summary } = useDailyReportStatusSummary(dailyReportId);
  const [statusFilter, setStatusFilter] = useDataTableFilter(DETAIL_PARAM_NAMESPACE, 'status', serverStatus);

  const options: Option[] = [
    { value: null, label: 'Todas', count: summary?.total },
    { value: 'pendiente', label: 'Pendientes', count: summary?.pending },
    { value: 'sin_recursos_asignados', label: 'Sin recursos', count: summary?.withoutResources },
    { value: 'ejecutado', label: 'Ejecutadas', count: summary?.executed },
  ];

  return (
    <div role="group" aria-label="Filtrar líneas por estado" className="flex flex-wrap gap-1 border-b pb-3">
      {options.map((option) => {
        const pressed = statusFilter === option.value;
        return (
          <button
            key={option.label}
            type="button"
            aria-pressed={pressed}
            onClick={() => setStatusFilter(option.value)}
            className={cn(
              'focus-visible:ring-ring/50 inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-[3px]',
              pressed
                ? 'bg-brand-subtle text-brand-subtle-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {option.label}
            {option.count != null ? (
              <span className="bg-background/70 rounded-full px-1.5 py-0.5 font-mono text-xs tabular-nums">
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
