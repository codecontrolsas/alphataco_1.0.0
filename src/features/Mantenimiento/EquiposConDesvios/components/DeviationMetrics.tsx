'use client';

import { Button } from '@/components/ui/button';
import { ATTENTION_THRESHOLDS } from '@/features/Mantenimiento/lib/attention-thresholds';
import { AttentionBanner } from '@/features/Mantenimiento/shared/components/AttentionBanner';
import { useDataTableFilter } from '@/shared/components/common/DataTable';
import { MetricCard } from '@/shared/components/common/MetricCard';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { useQuery } from '@tanstack/react-query';
import { getEquipmentsWithDeviationsMetrics } from '../actions.server';
import { DEVIATIONS_METRICS_QUERY_KEY, DEVIATIONS_PARAM_NAMESPACE } from '../constants';
import { isDeviationAttentionKey, type DeviationAttentionKey } from '../deviation-attention';

export type DeviationMetricsData = Awaited<ReturnType<typeof getEquipmentsWithDeviationsMetrics>>;

/** Los contadores se consideran frescos 30 s; `invalidateAllMaintenanceQueries` (prefijo `['maintenance']`) los fuerza. */
const METRICS_STALE_TIME_MS = 30_000;

/** Valor de la tarjeta cuando no se pudo contar: la tarjeta sigue funcionando como filtro. */
const UNKNOWN_COUNT = '—';

interface DeviationMetricsProps {
  /** Lo que calculó el servidor; `null` si falló (el cliente lo reintenta al montar). */
  initialMetrics: DeviationMetricsData;
  /** Valor de `attention` con el que se renderizó el servidor (evita el parpadeo antes de leer la URL). */
  serverAttention?: string | null;
}

/**
 * Banda de atención (desvíos sin pedido hace más de 30 días) y tarjetas de métricas de "Equipos con Desvíos".
 * Cada tarjeta escribe el filtro virtual `attention` de la tabla; tocar la activa la limpia.
 */
export function DeviationMetrics({ initialMetrics, serverAttention = null }: DeviationMetricsProps) {
  const { data: metrics, isFetching } = useQuery({
    queryKey: DEVIATIONS_METRICS_QUERY_KEY,
    // Arrow: React Query le pasa un contexto (con un AbortSignal) que no se puede serializar hacia la server action.
    queryFn: () => getEquipmentsWithDeviationsMetrics(),
    initialData: initialMetrics ?? undefined,
    staleTime: METRICS_STALE_TIME_MS,
  });

  const [attentionValue, setAttention] = useDataTableFilter(DEVIATIONS_PARAM_NAMESPACE, 'attention', serverAttention);
  const attention: DeviationAttentionKey | null = isDeviationAttentionKey(attentionValue) ? attentionValue : null;

  const toggle = (key: DeviationAttentionKey) => setAttention(attention === key ? null : key);
  const show = (value: number | undefined) => (value === undefined ? UNKNOWN_COUNT : value);

  const stale = metrics?.stale ?? 0;
  const oldest = metrics?.staleSamples[0];
  const days = ATTENTION_THRESHOLDS.deviationsWithoutRequestDays;

  return (
    <div className="space-y-4">
      {stale > 0 ? (
        <AttentionBanner
          live
          tone="warn"
          title={
            stale === 1
              ? `1 equipo tiene desvíos sin pedido hace más de ${days} días.`
              : `${stale} equipos tienen desvíos sin pedido hace más de ${days} días.`
          }
          description={
            oldest
              ? [
                  oldest.domain ?? 'Sin dominio',
                  oldest.typeName,
                  `desvío más antiguo ${formatArgentinaDay(oldest.firstDeviationDate)}`,
                ]
                  .filter(Boolean)
                  .join(' · ') + (stale > 1 ? ` · y ${stale - 1} más` : '')
              : undefined
          }
          actions={
            <Button type="button" variant="outline" onClick={() => toggle('stale')}>
              {attention === 'stale' ? 'Ver todos los equipos' : 'Ver solo esos'}
            </Button>
          }
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" role="group" aria-label="Métricas de equipos con desvíos">
        <MetricCard
          label="Equipos con desvíos"
          value={show(metrics?.total)}
          hint="Sin pedido de mantenimiento"
          pressed={attention === null}
          onSelect={() => setAttention(null)}
        />
        <MetricCard
          label={`Más de ${days} días`}
          value={show(metrics?.stale)}
          hint="Desde el desvío más antiguo"
          tone="warn"
          pressed={attention === 'stale'}
          onSelect={() => toggle('stale')}
        />
        <MetricCard
          label="Con desvíos críticos"
          value={show(metrics?.critical)}
          hint="Atención inmediata"
          tone="danger"
          pressed={attention === 'critical'}
          onSelect={() => toggle('critical')}
        />
      </div>

      {!metrics && !isFetching ? (
        <p role="status" className="text-muted-foreground text-sm">
          No se pudieron calcular las métricas. La tabla de abajo sigue mostrando todos los equipos con desvíos.
        </p>
      ) : null}
    </div>
  );
}
