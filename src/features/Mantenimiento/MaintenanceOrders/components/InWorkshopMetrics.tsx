'use client';

import { Button } from '@/components/ui/button';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { useDataTableFilter } from '@/shared/components/common/DataTable/useDataTableFilter';
import { MetricCard, type MetricTone } from '@/shared/components/common/MetricCard';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Settings2 } from 'lucide-react';
import { ATTENTION_THRESHOLDS } from '../../lib/attention-thresholds';
import { AttentionBanner } from '../../shared/components/AttentionBanner';
import { getInWorkshopMetrics } from '../table/actions/metrics.server';
import { MAINTENANCE_ORDERS_PARAM_NAMESPACE } from '../table/constants';
import type { InWorkshopAttentionKey } from '../table/lib/order-attention';
import { daysSinceArgentinaDay } from '../table/lib/workshop-days';
import { useInWorkshopActions } from './InWorkshopActionsContext';

type InWorkshopMetricsData = Awaited<ReturnType<typeof getInWorkshopMetrics>>;

/** Valor de una tarjeta cuando no se pudo contar (la tarjeta sigue funcionando como filtro). */
const UNKNOWN_COUNT = '—';

/** Clave de React Query bajo `['maintenance']`: las mutaciones del módulo ya la invalidan. */
const METRICS_QUERY_KEY = ['maintenance', 'metrics', 'in-workshop'] as const;

interface AttentionCard {
  key: InWorkshopAttentionKey;
  label: string;
  hint: string;
  /** Tono cuando hay casos; con cero la tarjeta queda neutra para no alarmar. */
  tone: Exclude<MetricTone, 'default' | 'ok' | 'brand'>;
  count: (data: NonNullable<InWorkshopMetricsData>) => number;
}

const ATTENTION_CARDS: AttentionCard[] = [
  { key: 'no_work_orders', label: 'Sin OTs generadas', hint: 'Falta gestionar la orden', tone: 'warn', count: (d) => d.noWorkOrders },
  { key: 'stuck', label: 'Con tareas trabadas', hint: 'Autorización o reasignación', tone: 'warn', count: (d) => d.stuck },
  {
    key: 'overdue',
    label: `Más de ${ATTENTION_THRESHOLDS.inWorkshopDays} días`,
    hint: 'Desde el ingreso',
    tone: 'danger',
    count: (d) => d.overdue,
  },
];

function describeEntry(entryDate: string | null): string {
  if (!entryDate) return '';
  const days = daysSinceArgentinaDay(entryDate);
  if (days <= 0) return ' ingresó hoy y';
  return ` ingresó hace ${days} ${days === 1 ? 'día' : 'días'} y`;
}

/**
 * Banda de atención y tarjetas del paso "En Taller". Los números llegan del servidor (`initialData`) y se
 * refrescan solos tras cualquier mutación del módulo. Cada tarjeta escribe el filtro virtual `attention` de
 * la tabla y tocar la activa lo limpia.
 */
export function InWorkshopMetrics({
  initialData,
  serverAttention = null,
}: {
  /** `null` cuando el conteo del servidor falló: las tarjetas muestran "—". */
  initialData: InWorkshopMetricsData;
  /** Filtro con el que se renderizó el servidor (evita el parpadeo antes de leer la URL). */
  serverAttention?: string | null;
}) {
  const [attention, setAttention] = useDataTableFilter(MAINTENANCE_ORDERS_PARAM_NAMESPACE, 'attention', serverAttention);
  const { manageOrder, isManageLoading } = useInWorkshopActions();

  const { data } = useQuery({
    queryKey: METRICS_QUERY_KEY,
    queryFn: () => getInWorkshopMetrics(),
    initialData,
    staleTime: 30 * 1000,
  });

  const waiting = data?.longestWaiting ?? null;

  return (
    <section aria-label="Atención del taller" className="space-y-4">
      {data && waiting ? (
        <AttentionBanner
          live
          tone="warn"
          title={`${waiting.resource}${describeEntry(waiting.entryDate)} todavía no tiene OTs.`}
          description={[
            waiting.orderNumber,
            waiting.description,
            data.noWorkOrders > 1 ? `Y ${data.noWorkOrders - 1} más esperan lo mismo.` : null,
            'Gestioná la orden para asignar sectores y generar las órdenes de trabajo.',
          ]
            .filter(Boolean)
            .join(' · ')}
          actions={
            <>
              {data.noWorkOrders > 1 && attention !== 'no_work_orders' ? (
                <Button type="button" size="sm" variant="outline" onClick={() => setAttention('no_work_orders')}>
                  Ver las {data.noWorkOrders}
                </Button>
              ) : null}
              <PermissionGuard module="mantenimiento" tab="gestion_ordenes" action="update">
                <Button type="button" size="sm" disabled={isManageLoading} onClick={() => manageOrder(waiting.id)}>
                  {isManageLoading ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Settings2 aria-hidden="true" />
                  )}
                  Gestionar orden
                </Button>
              </PermissionGuard>
            </>
          }
        />
      ) : null}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4" role="group" aria-label="Órdenes en taller">
        <MetricCard
          label="En taller"
          value={data ? data.total : UNKNOWN_COUNT}
          hint={data ? 'Equipos dentro del taller' : 'No se pudo contar'}
          tone="brand"
          // Quita el filtro de atención: vuelve a mostrar todas las órdenes del paso
          onSelect={() => setAttention(null)}
        />
        {ATTENTION_CARDS.map((card) => {
          const count = data ? card.count(data) : null;
          return (
            <MetricCard
              key={card.key}
              label={card.label}
              value={count ?? UNKNOWN_COUNT}
              hint={data ? card.hint : 'No se pudo contar'}
              tone={count ? card.tone : 'default'}
              pressed={attention === card.key}
              onSelect={() => setAttention(attention === card.key ? null : card.key)}
            />
          );
        })}
      </div>
    </section>
  );
}
