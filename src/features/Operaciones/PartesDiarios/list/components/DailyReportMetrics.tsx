'use client';

import { useDataTableFilter } from '@/shared/components/common/DataTable';
import { MetricCard } from '@/shared/components/common/MetricCard';

interface DailyReportMetricsProps {
  /** Namespace de params de la tabla (de ahí sale el prefijo de sus params en la URL). */
  paramNamespace: string;
  /** Filtro `status` con el que se renderizó el servidor (evita que la tarjeta parpadee antes de leer la URL). */
  serverStatus: string | null;
  /** Partes abiertos; `null` si no se pudo calcular. */
  open: number | null;
  /** Partes cerrados (suma de todos los estados `cerrado*`). */
  closed: number | null;
  /** Partes con al menos una línea pendiente. */
  withPending: number | null;
  /** Partes con al menos una línea sin recursos. */
  withoutResources: number | null;
}

function display(value: number | null) {
  return value ?? '—';
}

/** Cuatro tarjetas. "Abiertos" aplica su estado como filtro de la columna `status`; el resto informa. */
export function DailyReportMetrics({ paramNamespace, serverStatus, open, closed, withPending, withoutResources }: DailyReportMetricsProps) {
  const [statusFilter, setStatusFilter] = useDataTableFilter(paramNamespace, 'status', serverStatus);

  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4" role="group" aria-label="Partes diarios">
      <MetricCard
        label="Abiertos"
        value={display(open)}
        hint="Todavía se pueden editar"
        tone="brand"
        pressed={statusFilter === 'abierto'}
        onSelect={() => setStatusFilter(statusFilter === 'abierto' ? null : 'abierto')}
      />
      <MetricCard label="Cerrados" value={display(closed)} hint="Ya no se editan" tone="ok" />
      <MetricCard
        label="Con pendientes"
        value={display(withPending)}
        hint="Tienen líneas por ejecutar"
        tone={withPending ? 'warn' : 'default'}
      />
      <MetricCard
        label="Sin recursos"
        value={display(withoutResources)}
        hint="Tienen líneas sin personal ni equipos"
        tone={withoutResources ? 'danger' : 'default'}
      />
    </div>
  );
}
