'use client';

import { useDataTableFilter } from '@/shared/components/common/DataTable';
import { MetricCard } from '@/shared/components/common/MetricCard';
import { PREPARTE_METRIC_ORDER, PREPARTE_STATUS_UI } from '../../lib/preparte-status-ui';
import type { getPreparteStatusMetrics } from '../metrics.server';

type Metrics = Awaited<ReturnType<typeof getPreparteStatusMetrics>>;

interface PreparteMetricsProps {
  /** Mismo `tableId` que la tabla: de ahí sale el prefijo de sus params en la URL. */
  tableId: string;
  metrics: Metrics;
}

/** Tarjetas del gestor de pedidos. "Todos" quita el filtro; cada estado lo aplica (y lo quita si ya estaba). */
export function PreparteMetrics({ tableId, metrics }: PreparteMetricsProps) {
  const [statusFilter, setStatusFilter] = useDataTableFilter(tableId, 'status');

  return (
    <div
      className="grid grid-cols-2 gap-4 md:grid-cols-4 2xl:grid-cols-7"
      role="group"
      aria-label="Pedidos por estado"
    >
      <MetricCard
        label="Todos"
        value={metrics.total}
        hint="Pedidos registrados"
        pressed={!statusFilter}
        onSelect={() => setStatusFilter(null)}
        data-testid="status-card-todos"
      />
      {PREPARTE_METRIC_ORDER.map((status) => {
        const ui = PREPARTE_STATUS_UI[status];
        return (
          <MetricCard
            key={status}
            label={ui.metricLabel}
            value={metrics.byStatus[status] ?? 0}
            hint={ui.hint}
            tone={ui.tone}
            pressed={statusFilter === status}
            onSelect={() => setStatusFilter(statusFilter === status ? null : status)}
            data-testid={`status-card-${status}`}
          />
        );
      })}
    </div>
  );
}
