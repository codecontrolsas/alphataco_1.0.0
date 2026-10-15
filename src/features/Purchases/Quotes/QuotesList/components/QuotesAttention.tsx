'use client';

import { Button } from '@/components/ui/button';
import { AttentionBanner } from '@/features/Mantenimiento/shared/components/AttentionBanner';
import { useDataTableFilter } from '@/shared/components/common/DataTable';
import { useQuery } from '@tanstack/react-query';
import { getPurchaseQuotesAttention } from '../actions.server';
import { AWAITING_RESPONSE_FILTER, QUOTES_ATTENTION_QUERY_KEY, QUOTES_TABLE_ID } from '../constants';

type AttentionData = Awaited<ReturnType<typeof getPurchaseQuotesAttention>>;

/**
 * Banda "cotizaciones enviadas sin respuesta". El numero llega del servidor (mismo WHERE que la lista con
 * Estado = Enviada) y se refresca al invalidar las claves de cotizaciones. El boton escribe el filtro de
 * Estado de la tabla; si ya esta aplicado, no se ofrece.
 */
export function QuotesAttention({
  initialData,
  serverStatus = null,
}: {
  /** `null` cuando el conteo del servidor fallo: no se muestra nada. */
  initialData: AttentionData;
  /** Filtro de estado con el que se renderizo el servidor (evita el parpadeo antes de leer la URL). */
  serverStatus?: string | null;
}) {
  const [status, setStatus] = useDataTableFilter(QUOTES_TABLE_ID, 'status', serverStatus);

  const { data } = useQuery({
    queryKey: QUOTES_ATTENTION_QUERY_KEY,
    queryFn: getPurchaseQuotesAttention,
    initialData,
    staleTime: 30 * 1000,
  });

  const awaiting = data?.awaitingResponse ?? 0;
  if (awaiting === 0) return null;

  return (
    <AttentionBanner
      live
      tone="info"
      title={`${awaiting} ${awaiting === 1 ? 'cotización enviada' : 'cotizaciones enviadas'} sin respuesta`}
      description="Esperan la respuesta del proveedor: cargala o marcá que no cotiza."
      actions={
        status === AWAITING_RESPONSE_FILTER ? null : (
          <Button type="button" size="sm" variant="outline" onClick={() => setStatus(AWAITING_RESPONSE_FILTER)}>
            Ver {awaiting === 1 ? 'la enviada' : `las ${awaiting}`}
          </Button>
        )
      }
    />
  );
}
