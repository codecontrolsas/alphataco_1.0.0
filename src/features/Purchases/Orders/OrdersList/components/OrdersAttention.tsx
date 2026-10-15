'use client';

import { Button } from '@/components/ui/button';
import { AttentionBanner } from '@/features/Mantenimiento/shared/components/AttentionBanner';
import { useDataTableFilter } from '@/shared/components/common/DataTable';
import { useQuery } from '@tanstack/react-query';
import { getPurchaseOrdersAttention } from '../actions.server';
import { ORDERS_ATTENTION_QUERY_KEY, ORDERS_TABLE_ID } from '../constants';

type AttentionData = Awaited<ReturnType<typeof getPurchaseOrdersAttention>>;

/**
 * Bandas "órdenes por aprobar" (si el usuario puede aprobar) y "órdenes por enviar" (si puede enviarlas). Los
 * números llegan del servidor con el mismo `where` que la lista filtrada por estado y se refrescan tras cada
 * decisión (la clave cuelga de la de la tabla). El botón escribe el filtro de Estado; si ya está aplicado, no se ofrece.
 */
export function OrdersAttention({
  initialData,
  serverStatus = null,
}: {
  /** `null` cuando no corresponde o el conteo del servidor falló: no se muestra nada. */
  initialData: AttentionData;
  /** Filtro de estado con el que se renderizó el servidor (evita el parpadeo antes de leer la URL). */
  serverStatus?: string | null;
}) {
  const [status, setStatus] = useDataTableFilter(ORDERS_TABLE_ID, 'status', serverStatus);

  const { data } = useQuery({
    queryKey: ORDERS_ATTENTION_QUERY_KEY,
    queryFn: getPurchaseOrdersAttention,
    initialData,
    staleTime: 30 * 1000,
  });

  const pendingApproval = data?.pendingApproval ?? 0;
  const toSend = data?.toSend ?? 0;
  if (pendingApproval === 0 && toSend === 0) return null;

  return (
    <div className="space-y-3">
      {pendingApproval > 0 ? (
        <AttentionBanner
          live
          tone="warn"
          title={`${pendingApproval} ${pendingApproval === 1 ? 'orden pendiente' : 'órdenes pendientes'} de aprobación`}
          description="Esperan que las apruebes o las rechaces."
          actions={
            status === 'PENDING_APPROVAL' ? null : (
              <Button type="button" size="sm" variant="outline" onClick={() => setStatus('PENDING_APPROVAL')}>
                Ver {pendingApproval === 1 ? 'la pendiente' : `las ${pendingApproval}`}
              </Button>
            )
          }
        />
      ) : null}
      {toSend > 0 ? (
        <AttentionBanner
          live
          tone="info"
          title={`${toSend} ${toSend === 1 ? 'orden aprobada' : 'órdenes aprobadas'} por enviar al proveedor`}
          description="Ya están aprobadas y todavía no se enviaron."
          actions={
            status === 'APPROVED' ? null : (
              <Button type="button" size="sm" variant="outline" onClick={() => setStatus('APPROVED')}>
                Ver {toSend === 1 ? 'la aprobada' : `las ${toSend}`}
              </Button>
            )
          }
        />
      ) : null}
    </div>
  );
}
