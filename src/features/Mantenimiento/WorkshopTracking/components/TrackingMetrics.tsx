'use client';

import { Button } from '@/components/ui/button';
import { useDataTableFilter } from '@/shared/components/common/DataTable/useDataTableFilter';
import { MetricCard, type MetricTone } from '@/shared/components/common/MetricCard';
import { useQuery } from '@tanstack/react-query';
import { Suspense, use } from 'react';
import { ATTENTION_THRESHOLDS } from '../../lib/attention-thresholds';
import { getStatusLabel } from '../../lib/status-presentation';
import { AttentionBanner } from '../../shared/components/AttentionBanner';
import { getWorkshopTrackingMetrics } from '../actions/metrics.server';
import type { TrackingAttentionKey } from '../attention-conditions';
import { WORKSHOP_TRACKING_PARAM_NAMESPACE } from '../constants';
import { TrackingMetricsSkeleton } from '../fallback/WorkshopTrackingSkeleton';

type TrackingMetricsData = NonNullable<Awaited<ReturnType<typeof getWorkshopTrackingMetrics>>>;

/** Valor que se muestra cuando no se pudo contar (la tarjeta sigue funcionando como filtro). */
const UNKNOWN_COUNT = '—';

const METRICS_QUERY_KEY = ['maintenance', 'metrics', 'seguimiento'] as const;

interface StatusCardConfig {
  status: string;
  hint: string;
  tone: MetricTone;
  /** Se muestra solo cuando hay órdenes en ese estado (no aporta una tarjeta en cero). */
  onlyWhenPresent?: boolean;
}

const STATUS_CARDS: StatusCardConfig[] = [
  { status: 'pending_scheduling', hint: 'Esperan fecha del taller', tone: 'warn' },
  { status: 'date_confirmed', hint: 'Esperan el ingreso', tone: 'default' },
  { status: 'in_workshop', hint: 'Trabajando en taller', tone: 'brand' },
  { status: 'pending_workshop_validation', hint: 'Esperan el cierre del taller', tone: 'warn' },
  { status: 'workshop_rejected', hint: 'Todos los ítems rechazados', tone: 'danger' },
  { status: 'operations_rejected', hint: 'Rechazadas al validar', tone: 'danger', onlyWhenPresent: true },
];

interface AttentionCardConfig {
  key: TrackingAttentionKey;
  label: string;
  hint: string;
  tone: MetricTone;
  value: (metrics: TrackingMetricsData) => number;
}

const ATTENTION_CARDS: AttentionCardConfig[] = [
  {
    key: 'overdue',
    label: `Más de ${ATTENTION_THRESHOLDS.inWorkshopDays} días`,
    hint: 'En taller sin cerrarse',
    tone: 'warn',
    value: (metrics) => metrics.overdue,
  },
  {
    key: 'past_date',
    label: 'Fecha pasada',
    hint: 'Pasó la fecha sin ingreso',
    tone: 'danger',
    value: (metrics) => metrics.pastDate,
  },
];

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

interface TrackingMetricsProps {
  /** Promesa que arrancó el servidor junto con la tabla. Nunca rechaza: `null` si no pudo contar. */
  metricsPromise: Promise<TrackingMetricsData | null>;
  /** Abre el panel de detalle de la orden. */
  onViewOrder: (orderId: string) => void;
}

/** Tarjetas por estado y por antigüedad, más la banda de Atención de Seguimiento. */
export function TrackingMetrics(props: TrackingMetricsProps) {
  return (
    <Suspense fallback={<TrackingMetricsSkeleton />}>
      <TrackingMetricsContent {...props} />
    </Suspense>
  );
}

function TrackingMetricsContent({ metricsPromise, onViewOrder }: TrackingMetricsProps) {
  const initialMetrics = use(metricsPromise);

  // Si el servidor no pudo contar, el cliente reintenta al montar. Después de cada mutación
  // `invalidateAllMaintenanceQueries` invalida el prefijo ['maintenance'] y esto se refresca solo.
  const { data: metrics } = useQuery({
    queryKey: METRICS_QUERY_KEY,
    queryFn: () => getWorkshopTrackingMetrics(),
    initialData: initialMetrics ?? undefined,
    staleTime: 30 * 1000,
  });

  const [statusFilter, , setFilters] = useDataTableFilter(WORKSHOP_TRACKING_PARAM_NAMESPACE, 'status');
  const [attentionFilter] = useDataTableFilter(WORKSHOP_TRACKING_PARAM_NAMESPACE, 'attention');

  // Las tarjetas son filtros excluyentes: elegir una quita la otra, así el total de la tabla coincide con el número.
  const toggleStatus = (status: string) => {
    const active = statusFilter === status && !attentionFilter;
    setFilters({ status: active ? null : status, attention: null });
  };
  const toggleAttention = (key: TrackingAttentionKey) => {
    setFilters({ attention: attentionFilter === key ? null : key, status: null });
  };

  const statusCards = STATUS_CARDS.filter(
    (card) => !card.onlyWhenPresent || (metrics?.byStatus[card.status] ?? 0) > 0
  );

  const rejectedByWorkshop = metrics?.byStatus.workshop_rejected ?? 0;
  const previewedOrders = metrics?.workshopRejected ?? [];
  const hiddenRejected = Math.max(rejectedByWorkshop - previewedOrders.length, 0);
  const recentRejected = metrics?.recentRejected ?? 0;

  return (
    <div className="space-y-4">
      {rejectedByWorkshop > 0 ? (
        <AttentionBanner
          tone="danger"
          live
          title={`${rejectedByWorkshop} ${plural(rejectedByWorkshop, 'orden con todos sus ítems rechazados', 'órdenes con todos sus ítems rechazados')} en el taller`}
          description={
            <>
              {previewedOrders.map((order) => (
                <span key={order.id} className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono tabular-nums">{order.orderNumber ?? 'Sin N° de orden'}</span>
                  <span>{order.resource}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onViewOrder(order.id)}
                    aria-label={`Ver pedido ${order.orderNumber ?? order.resource}`}
                  >
                    Ver pedido
                  </Button>
                </span>
              ))}
              {hiddenRejected > 0 ? (
                <span className="mt-1 block">
                  y {hiddenRejected} más: filtrá por Estado = {getStatusLabel('order', 'workshop_rejected')}.
                </span>
              ) : null}
            </>
          }
        />
      ) : null}

      {recentRejected > 0 ? (
        <AttentionBanner
          tone="warn"
          live
          title={`${recentRejected} ${plural(recentRejected, 'pedido rechazado', 'pedidos rechazados')} por el taller en los últimos ${ATTENTION_THRESHOLDS.recentRejectionDays} días`}
          description="Salieron del listado inicial porque el taller los rechazó antes de programarlos."
          actions={
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setFilters({ status: 'rejected', attention: null })}
            >
              Ver rechazados
            </Button>
          }
        />
      ) : null}

      <div
        className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6"
        role="group"
        aria-label="Órdenes por estado"
      >
        {statusCards.map((card) => (
          <MetricCard
            key={card.status}
            label={getStatusLabel('order', card.status)}
            value={metrics ? (metrics.byStatus[card.status] ?? 0) : UNKNOWN_COUNT}
            hint={card.hint}
            tone={card.tone}
            pressed={statusFilter === card.status && !attentionFilter}
            onSelect={() => toggleStatus(card.status)}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6" role="group" aria-label="Órdenes por antigüedad">
        {ATTENTION_CARDS.map((card) => (
          <MetricCard
            key={card.key}
            label={card.label}
            value={metrics ? card.value(metrics) : UNKNOWN_COUNT}
            hint={card.hint}
            tone={card.tone}
            pressed={attentionFilter === card.key}
            onSelect={() => toggleAttention(card.key)}
          />
        ))}
      </div>
    </div>
  );
}
