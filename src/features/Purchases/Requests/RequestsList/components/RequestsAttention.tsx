'use client';

import { Button } from '@/components/ui/button';
import { AttentionBanner } from '@/features/Mantenimiento/shared/components/AttentionBanner';
import { useDataTableFilter } from '@/shared/components/common/DataTable';
import { useQuery } from '@tanstack/react-query';
import { getPurchaseRequestsAttention } from '../actions.server';
import { REQUESTS_ATTENTION_QUERY_KEY, REQUESTS_TABLE_ID } from '../constants';

type AttentionData = Awaited<ReturnType<typeof getPurchaseRequestsAttention>>;

/**
 * Banda "solicitudes pendientes de aprobación". El número llega del servidor (con el alcance de la lista, y
 * solo si el usuario puede aprobar) y se refresca tras cada decisión (la clave cuelga de la de la tabla, así
 * `invalidatePurchases` la invalida). El botón escribe el filtro de Estado; si ya está aplicado, no se ofrece.
 */
export function RequestsAttention({
  initialData,
  serverStatus = null,
}: {
  /** `null` cuando no corresponde o el conteo del servidor falló: no se muestra nada. */
  initialData: AttentionData;
  /** Filtro de estado con el que se renderizó el servidor (evita el parpadeo antes de leer la URL). */
  serverStatus?: string | null;
}) {
  const [status, setStatus] = useDataTableFilter(REQUESTS_TABLE_ID, 'status', serverStatus);

  const { data } = useQuery({
    queryKey: REQUESTS_ATTENTION_QUERY_KEY,
    queryFn: getPurchaseRequestsAttention,
    initialData,
    staleTime: 30 * 1000,
  });

  const pendingApproval = data?.pendingApproval ?? 0;
  if (pendingApproval === 0) return null;

  return (
    <AttentionBanner
      live
      tone="warn"
      title={`${pendingApproval} ${pendingApproval === 1 ? 'solicitud pendiente' : 'solicitudes pendientes'} de aprobación`}
      description="Esperan que las apruebes o las rechaces."
      actions={
        status === 'PENDING_APPROVAL' ? null : (
          <Button type="button" size="sm" variant="outline" onClick={() => setStatus('PENDING_APPROVAL')}>
            Ver {pendingApproval === 1 ? 'la pendiente' : `las ${pendingApproval}`}
          </Button>
        )
      }
    />
  );
}
