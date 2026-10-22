'use client';

import { useDataTableFilter } from '@/shared/components/common/DataTable/useDataTableFilter';
import { MetricCard } from '@/shared/components/common/MetricCard';
import { useQuery } from '@tanstack/react-query';
import { getInvoicingMetrics, type InvoicingMetrics as InvoicingMetricsData } from '../list/actions.server';
import {
  INVOICES_TABLE_ID,
  REJECTED_WINDOW_DAYS,
  isInvoiceAttentionKey,
  type InvoiceAttentionKey,
} from '../list/invoice-attention';

/** Los conteos se consideran frescos 30 s. */
const METRICS_STALE_TIME_MS = 30_000;
export const INVOICING_METRICS_QUERY_KEY = ['invoicing', 'metrics'] as const;

/** Valor de la tarjeta cuando no se pudo contar: la tarjeta sigue funcionando como filtro. */
const UNKNOWN_COUNT = '—';

interface InvoicingMetricsProps {
  /** Lo que calculó el servidor; `null` si falló (el cliente lo reintenta al montar). */
  initialMetrics: InvoicingMetricsData | null;
  /** Valor de `attention` con el que se renderizó el servidor (evita el parpadeo antes de leer la URL). */
  serverAttention?: string | null;
}

/**
 * Tablero de Facturación: borradores, pendientes ante ARCA, rechazadas recientes y autorizadas del mes.
 * Cada tarjeta escribe el filtro virtual `attention` de la tabla; tocar la activa la limpia.
 */
export function InvoicingMetrics({ initialMetrics, serverAttention = null }: InvoicingMetricsProps) {
  const { data: metrics, isFetching } = useQuery({
    queryKey: INVOICING_METRICS_QUERY_KEY,
    // Arrow: React Query le pasa un contexto (con un AbortSignal) que no se puede serializar hacia la server action.
    queryFn: () => getInvoicingMetrics(),
    initialData: initialMetrics ?? undefined,
    staleTime: METRICS_STALE_TIME_MS,
  });

  const [attentionValue, setAttention] = useDataTableFilter(INVOICES_TABLE_ID, 'attention', serverAttention);
  const attention: InvoiceAttentionKey | null = isInvoiceAttentionKey(attentionValue) ? attentionValue : null;

  const toggle = (key: InvoiceAttentionKey) => setAttention(attention === key ? null : key);
  const show = (key: InvoiceAttentionKey) => (metrics ? metrics[key] : UNKNOWN_COUNT);

  return (
    <div className="space-y-2">
      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        role="group"
        aria-label="Resumen de comprobantes"
      >
        <MetricCard
          label="Borradores"
          value={show('drafts')}
          hint="Sin emitir"
          pressed={attention === 'drafts'}
          onSelect={() => toggle('drafts')}
        />
        <MetricCard
          label="Pendientes ante ARCA"
          value={show('pending')}
          hint="Consultar el estado"
          tone="warn"
          pressed={attention === 'pending'}
          onSelect={() => toggle('pending')}
        />
        <MetricCard
          label="Rechazadas"
          value={show('rejected')}
          hint={`Últimos ${REJECTED_WINDOW_DAYS} días`}
          tone="danger"
          pressed={attention === 'rejected'}
          onSelect={() => toggle('rejected')}
        />
        <MetricCard
          label="Autorizadas"
          value={show('authorized')}
          hint="Este mes"
          tone="ok"
          pressed={attention === 'authorized'}
          onSelect={() => toggle('authorized')}
        />
      </div>

      {!metrics && !isFetching ? (
        <p role="status" className="text-muted-foreground text-sm">
          No se pudieron calcular los conteos. La tabla de abajo sigue mostrando todos los comprobantes.
        </p>
      ) : null}
    </div>
  );
}
