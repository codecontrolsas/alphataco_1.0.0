'use client';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TimelineItem } from '@/features/Mantenimiento/components/ActivityHistory/TimelineItem';
import { GroupedActionItem } from '@/features/Mantenimiento/components/ActivityHistory/GroupedActionItem';
import { getPerformerName } from '@/features/Mantenimiento/components/ActivityHistory/activity-config';
import { getMaintenanceOrderFullActivityLog } from '@/features/Mantenimiento/Operaciones/actions/activity-log.server';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock } from 'lucide-react';
import { useId, useState } from 'react';

/** Cuántos eventos se ven sin expandir (los más recientes). */
const INLINE_LIMIT = 6;

interface OrderHistoryInlineProps {
  orderId: string;
  requestId: string | null;
  enabled: boolean;
}

/**
 * Historial de la orden dentro del mismo panel: los últimos eventos y "Ver todo" que expande acá mismo,
 * sin abrir un diálogo encima. Comparte la clave de consulta con `ActivityHistoryModal`, así que si el
 * historial completo ya se cargó desde otra pantalla no se vuelve a pedir.
 */
export function OrderHistoryInline({ orderId, requestId, enabled }: OrderHistoryInlineProps) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['maintenance-order-full-activity-log', orderId, requestId],
    queryFn: () => getMaintenanceOrderFullActivityLog(orderId, requestId || undefined),
    enabled,
  });

  const history = data?.history ?? [];
  // El log viene en orden cronológico: lo reciente está al final.
  const visible = expanded ? history : history.slice(-INLINE_LIMIT);
  const hiddenCount = history.length - visible.length;

  return (
    <section aria-labelledby={`${listId}-title`} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${listId}-title`} className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          Historial
          {history.length > 0 && <span className="ml-2 font-normal tabular-nums">({history.length})</span>}
        </h3>
        {history.length > INLINE_LIMIT && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Ver menos' : `Ver todo (${history.length})`}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div role="status" className="space-y-3">
          <span className="sr-only">Cargando historial…</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-start gap-3" aria-hidden="true">
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56 max-w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div role="alert" className="text-muted-foreground flex flex-wrap items-center gap-3 text-sm">
          <AlertTriangle aria-hidden="true" className="h-4 w-4" />
          No se pudo cargar el historial.
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            Reintentar
          </Button>
        </div>
      ) : history.length === 0 ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Clock aria-hidden="true" className="h-4 w-4" />
          Esta orden todavía no tiene eventos registrados.
        </p>
      ) : (
        <div id={listId}>
          {hiddenCount > 0 && (
            <p className="text-muted-foreground mb-2 text-xs">
              Se muestran los {visible.length} eventos más recientes; hay {hiddenCount} anteriores.
            </p>
          )}
          <div className="relative">
            {visible.map((entry, index) =>
              entry.action_type === 'order_items_updated' ? (
                <GroupedActionItem
                  key={entry.id}
                  performedAt={entry.performed_at}
                  performerName={getPerformerName(entry.performer ?? null)}
                  metadata={entry.metadata as Parameters<typeof GroupedActionItem>[0]['metadata']}
                  isLast={index === visible.length - 1}
                />
              ) : (
                <TimelineItem
                  key={entry.id}
                  entry={entry as Parameters<typeof TimelineItem>[0]['entry']}
                  isLast={index === visible.length - 1}
                />
              )
            )}
          </div>
        </div>
      )}
    </section>
  );
}
