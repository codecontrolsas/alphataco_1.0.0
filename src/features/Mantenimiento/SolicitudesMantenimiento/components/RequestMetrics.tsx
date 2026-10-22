'use client';

import { Button } from '@/components/ui/button';
import { ATTENTION_THRESHOLDS } from '@/features/Mantenimiento/lib/attention-thresholds';
import { AttentionBanner } from '@/features/Mantenimiento/shared/components/AttentionBanner';
import { useDataTableFilter } from '@/shared/components/common/DataTable/useDataTableFilter';
import { MetricCard } from '@/shared/components/common/MetricCard';
import { useQuery } from '@tanstack/react-query';
import { REQUESTS_PARAM_NAMESPACE, REQUEST_METRICS_QUERY_KEY } from '../constants';
import { getMaintenanceRequestMetrics } from '../actions/metrics.server';
import { isRequestAttentionKey, type RequestAttentionKey } from '../actions/request-attention';

export type RequestMetricsData = Awaited<ReturnType<typeof getMaintenanceRequestMetrics>>;

/** Los contadores se consideran frescos 30 s; `invalidateAllMaintenanceQueries` (prefijo `['maintenance']`) los fuerza. */
const METRICS_STALE_TIME_MS = 30_000;

/** Valor de la tarjeta cuando no se pudo contar: la tarjeta sigue funcionando como filtro. */
const UNKNOWN_COUNT = '—';

interface RequestMetricsProps {
  /** Lo que calculó el servidor; `null` si falló (el cliente lo reintenta al montar). */
  initialMetrics: RequestMetricsData;
  /** Valor de `attention` con el que se renderizó el servidor (evita el parpadeo antes de leer la URL). */
  serverAttention?: string | null;
}

/**
 * Banda de atención (más de 48 h sin validar) y tarjetas de métricas de "Validar Solicitud".
 * Cada tarjeta escribe el filtro virtual `attention` de la tabla; tocar la activa la limpia.
 */
export function RequestMetrics({ initialMetrics, serverAttention = null }: RequestMetricsProps) {
  const { data: metrics, isFetching } = useQuery({
    queryKey: REQUEST_METRICS_QUERY_KEY,
    // Arrow: React Query le pasa un contexto (con un AbortSignal) que no se puede serializar hacia la server action.
    queryFn: () => getMaintenanceRequestMetrics(),
    initialData: initialMetrics ?? undefined,
    staleTime: METRICS_STALE_TIME_MS,
  });

  const [attentionValue, setAttention] = useDataTableFilter(REQUESTS_PARAM_NAMESPACE, 'attention', serverAttention);
  const attention: RequestAttentionKey | null = isRequestAttentionKey(attentionValue) ? attentionValue : null;

  const toggle = (key: RequestAttentionKey) => setAttention(attention === key ? null : key);
  const show = (value: number | undefined) => (value === undefined ? UNKNOWN_COUNT : value);

  const overdue = metrics?.overdue ?? 0;

  return (
    <div className="space-y-4">
      {overdue > 0 ? (
        <AttentionBanner
          live
          tone="danger"
          title={
            overdue === 1
              ? `1 solicitud espera hace más de ${ATTENTION_THRESHOLDS.requestPendingHours} h.`
              : `${overdue} solicitudes esperan hace más de ${ATTENTION_THRESHOLDS.requestPendingHours} h.`
          }
          description="El chofer sigue operando el equipo con los desvíos informados hasta que la solicitud se valide."
          actions={
            <Button type="button" variant="outline" onClick={() => toggle('overdue')}>
              {attention === 'overdue' ? 'Ver todas las pendientes' : 'Ver solo esas'}
            </Button>
          }
        />
      ) : null}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4" role="group" aria-label="Métricas de solicitudes por validar">
        <MetricCard
          label="Pendientes"
          value={show(metrics?.pending)}
          hint="Esperan tu validación"
          tone="warn"
          pressed={attention === null}
          onSelect={() => setAttention(null)}
        />
        <MetricCard
          label="Con desvíos críticos"
          value={show(metrics?.critical)}
          hint="Atención inmediata"
          tone="danger"
          pressed={attention === 'critical'}
          onSelect={() => toggle('critical')}
        />
        <MetricCard
          label={`Más de ${ATTENTION_THRESHOLDS.requestPendingHours} h`}
          value={show(metrics?.overdue)}
          hint="Desde la fecha de solicitud"
          pressed={attention === 'overdue'}
          onSelect={() => toggle('overdue')}
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
          No se pudieron calcular las métricas. La tabla de abajo sigue mostrando todas las solicitudes pendientes.
        </p>
      ) : null}
    </div>
  );
}
