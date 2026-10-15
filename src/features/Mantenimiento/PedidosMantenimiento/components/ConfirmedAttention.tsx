'use client';

import { Button } from '@/components/ui/button';
import { AttentionBanner } from '@/features/Mantenimiento/shared/components/AttentionBanner';
import { useDataTableFilter } from '@/shared/components/common/DataTable';
import { useQuery } from '@tanstack/react-query';
import { Loader2, LogIn } from 'lucide-react';
import moment from 'moment';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { getMaintenanceOrderById } from '../actions/actionsServer';
import { getConfirmedOrderAttention } from '../actions/metrics.server';
import {
  CONFIRMED_ATTENTION_QUERY_KEY,
  CONFIRMED_PARAM_NAMESPACE,
  isConfirmedAttentionKey,
} from '../constants';

// El diálogo se abre a demanda: no pesa en la carga inicial del paso.
const EntradaTallerDialog = dynamic(() => import('./EntradaTallerDialog').then((m) => m.EntradaTallerDialog));

export type ConfirmedAttentionData = Awaited<ReturnType<typeof getConfirmedOrderAttention>>;

/** Los datos se consideran frescos 30 s; `invalidateAllMaintenanceQueries` (prefijo `['maintenance']`) los fuerza. */
const ATTENTION_STALE_TIME_MS = 30_000;

interface ConfirmedAttentionProps {
  /** Lo que calculó el servidor; `null` si falló (el cliente lo reintenta al montar). */
  initialAttention: ConfirmedAttentionData;
  /** Valor de `attention` con el que se renderizó el servidor (evita el parpadeo antes de leer la URL). */
  serverAttention?: string | null;
  /** `pedidos_confirmados:update`, resuelto en el servidor: habilita "Registrar ingreso". */
  canRegisterEntry: boolean;
}

/**
 * Bandas de atención de "Por Ingresar": un aviso por cada pedido cuya fecha planificada ya pasó sin que el
 * equipo ingresara (los más atrasados; el resto se resume en "Y N más" y se ve filtrando la tabla). Sin pedidos
 * vencidos no se muestra nada: no existe la banda vacía.
 *
 * "Registrar ingreso" abre el mismo diálogo que la tabla; el pedido completo se pide al hacer clic.
 */
export function ConfirmedAttention({ initialAttention, serverAttention = null, canRegisterEntry }: ConfirmedAttentionProps) {
  const { data } = useQuery({
    queryKey: CONFIRMED_ATTENTION_QUERY_KEY,
    queryFn: () => getConfirmedOrderAttention(),
    initialData: initialAttention ?? undefined,
    staleTime: ATTENTION_STALE_TIME_MS,
  });

  const [attentionValue, setAttention] = useDataTableFilter(CONFIRMED_PARAM_NAMESPACE, 'attention', serverAttention);
  const filteringPastDate = isConfirmedAttentionKey(attentionValue);

  // Pedido que se está por ingresar: se carga completo (ítems, fotos, comentarios) para el diálogo.
  const [entryId, setEntryId] = useState<string | null>(null);
  const entryQuery = useQuery({
    queryKey: ['maintenance', 'order-for-entry', entryId],
    queryFn: () => (entryId ? getMaintenanceOrderById(entryId) : null),
    enabled: !!entryId,
    staleTime: 0,
  });

  if (!data || data.pastDateTotal === 0) return null;

  const remaining = data.pastDateTotal - data.rows.length;

  return (
    <div className="space-y-3">
      {data.rows.map((row) => {
        const isLoadingEntry = entryId === row.id && entryQuery.isFetching;
        const detail = [row.kindLabel, row.description].filter((part): part is string => !!part).join(' · ');
        return (
          <AttentionBanner
            key={row.id}
            live
            tone="danger"
            title={`${row.resource} tenía fecha el ${moment.utc(row.scheduledDay).format('DD/MM/YYYY')} y no ingresó.`}
            description={canRegisterEntry ? `${detail}. Registrá el ingreso al taller.` : detail}
            actions={
              canRegisterEntry ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isLoadingEntry}
                  onClick={() => setEntryId(row.id)}
                  aria-label={`Registrar ingreso de ${row.resource}`}
                >
                  {isLoadingEntry ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <LogIn aria-hidden="true" />
                  )}
                  Registrar ingreso
                </Button>
              ) : null
            }
          />
        );
      })}

      {remaining > 0 ? (
        <AttentionBanner
          live
          tone="danger"
          title={remaining === 1 ? 'Y 1 pedido más con la fecha vencida.' : `Y ${remaining} pedidos más con la fecha vencida.`}
          actions={
            <Button type="button" variant="outline" onClick={() => setAttention(filteringPastDate ? null : 'past_date')}>
              {filteringPastDate ? 'Ver todos los pedidos' : 'Ver solo los vencidos'}
            </Button>
          }
        />
      ) : null}

      {entryQuery.isError ? (
        <p role="alert" className="text-danger-subtle-foreground text-sm">
          No se pudo cargar el pedido para registrar el ingreso. Intentá de nuevo.
        </p>
      ) : null}

      {entryQuery.data ? <EntradaTallerDialog order={entryQuery.data} open onClose={() => setEntryId(null)} /> : null}
    </div>
  );
}
