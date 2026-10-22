'use client';

import { Button } from '@/components/ui/button';
import { ATTENTION_THRESHOLDS } from '@/features/Mantenimiento/lib/attention-thresholds';
import { AttentionBanner } from '@/features/Mantenimiento/shared/components/AttentionBanner';
import { useDataTableFilter } from '@/shared/components/common/DataTable/useDataTableFilter';
import { MetricCard } from '@/shared/components/common/MetricCard';
import { useQuery } from '@tanstack/react-query';
import { getPendingOrderMetrics } from '../actions/metrics.server';
import {
  PENDING_METRICS_QUERY_KEY,
  PENDING_PARAM_NAMESPACE,
  isPendingAttentionKey,
  type PendingAttentionKey,
} from '../constants';

export type PendingOrderMetricsData = Awaited<ReturnType<typeof getPendingOrderMetrics>>;

/** Los contadores se consideran frescos 30 s; `invalidateAllMaintenanceQueries` (prefijo `['maintenance']`) los fuerza. */
const METRICS_STALE_TIME_MS = 30_000;

/** Valor de la tarjeta cuando no se pudo contar: la tarjeta sigue funcionando como filtro. */
const UNKNOWN_COUNT = '—';

interface PendingOrderMetricsProps {
  /** Lo que calculó el servidor; `null` si falló (el cliente lo reintenta al montar). */
  initialMetrics: PendingOrderMetricsData;
  /** Valor de `attention` con el que se renderizó el servidor (evita el parpadeo antes de leer la URL). */
  serverAttention?: string | null;
}

/**
 * Banda de atención (pedidos que esperan fecha hace más de 7 días) y tarjetas de métricas de "Por Programar".
 * Cada tarjeta escribe el filtro virtual `attention` de la tabla; tocar la activa la limpia.
 */
export function PendingOrderMetrics({ initialMetrics, serverAttention = null }: PendingOrderMetricsProps) {
  const { data: metrics, isFetching } = useQuery({
    queryKey: PENDING_METRICS_QUERY_KEY,
    queryFn: () => getPendingOrderMetrics(),
    initialData: initialMetrics ?? undefined,
    staleTime: METRICS_STALE_TIME_MS,
  });

  const [attentionValue, setAttention] = useDataTableFilter(PENDING_PARAM_NAMESPACE, 'attention', serverAttention);
  const attention: PendingAttentionKey | null = isPendingAttentionKey(attentionValue) ? attentionValue : null;

  const toggle = (key: PendingAttentionKey) => setAttention(attention === key ? null : key);
  const show = (value: number | undefined) => (value === undefined ? UNKNOWN_COUNT : value);

  const days = ATTENTION_THRESHOLDS.schedulingPendingDays;
  const overdue = metrics?.overdue ?? 0;

  return (
    <div className="space-y-4">
      {overdue > 0 ? (
        <AttentionBanner
          live
          tone="warn"
          title={
            overdue === 1
              ? `1 pedido espera fecha hace más de ${days} días.`
              : `${overdue} pedidos esperan fecha hace más de ${days} días.`
          }
          description="Desde la aprobación de Operaciones. El supervisor los ve como “Pend. de programación” en Seguimiento."
          actions={
            <Button type="button" variant="outline" onClick={() => toggle('overdue')}>
              {attention === 'overdue' ? 'Ver todos los pendientes' : 'Ver solo esos'}
            </Button>
          }
        />
      ) : null}

      <div
        className="grid grid-cols-2 gap-4 xl:grid-cols-4"
        role="group"
        aria-label="Métricas de pedidos por programar"
      >
        <MetricCard
          label="Por programar"
          value={show(metrics?.total)}
          hint="Aprobados sin fecha"
          tone="warn"
          pressed={attention === null}
          onSelect={() => setAttention(null)}
        />
        <MetricCard
          label={`Más de ${days} días`}
          value={show(metrics?.overdue)}
          hint="Desde la aprobación"
          tone="danger"
          pressed={attention === 'overdue'}
          onSelect={() => toggle('overdue')}
        />
        <MetricCard
          label="Fecha rechazada"
          value={show(metrics?.dateRejected)}
          hint="Volvieron a programar"
          pressed={attention === 'date_rejected'}
          onSelect={() => toggle('date_rejected')}
        />
        <MetricCard
          label="Preventivos"
          value={show(metrics?.preventive)}
          hint="Programa de mantenimiento"
          tone="brand"
          pressed={attention === 'preventive'}
          onSelect={() => toggle('preventive')}
        />
      </div>

      {!metrics && !isFetching ? (
        <p role="status" className="text-muted-foreground text-sm">
          No se pudieron calcular las métricas. La tabla de abajo sigue mostrando todos los pedidos por programar.
        </p>
      ) : null}
    </div>
  );
}
