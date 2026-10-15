'use client';

import { Button } from '@/components/ui/button';
import { AttentionBanner } from '@/features/Mantenimiento/shared/components/AttentionBanner';
import { useDataTableFilter } from '@/shared/components/common/DataTable';
import { useQuery } from '@tanstack/react-query';
import { WAREHOUSE_QUERY_KEYS } from '../../../../lib/query-keys';
import { getRequestsAttention } from '../actions.server';
import { AWAITING_DELIVERY_FILTER, REQUESTS_TABLE_ID } from '../constants';

type AttentionData = Awaited<ReturnType<typeof getRequestsAttention>>;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * Bandas "pedidos por aprobar" y "pedidos por entregar". Los numeros llegan del servidor (con el alcance de
 * la lista, y solo lo que el usuario puede hacer) y se refrescan tras cada decision o entrega (se invalida
 * la clave). Cada boton escribe el filtro de Estado de la tabla; si ya esta aplicado, no se ofrece.
 */
export function RequestsAttention({
  initialData,
  serverStatus = null,
}: {
  /** `null` cuando el conteo del servidor fallo: no se muestra nada. */
  initialData: AttentionData;
  /** Filtro de estado con el que se renderizo el servidor (evita el parpadeo antes de leer la URL). */
  serverStatus?: string | null;
}) {
  const [status, setStatus] = useDataTableFilter(REQUESTS_TABLE_ID, 'status', serverStatus);

  const { data } = useQuery({
    queryKey: WAREHOUSE_QUERY_KEYS.requestsAttention,
    queryFn: getRequestsAttention,
    initialData,
    staleTime: 30 * 1000,
  });

  const pendingApproval = data?.pendingApproval ?? 0;
  const toDeliver = data?.toDeliver ?? 0;
  if (pendingApproval === 0 && toDeliver === 0) return null;

  return (
    <div className="space-y-2">
      {pendingApproval > 0 ? (
        <AttentionBanner
          live
          tone="warn"
          title={`${plural(pendingApproval, 'pedido pendiente', 'pedidos pendientes')} de aprobación`}
          description="Esperan que los apruebes o los rechaces."
          actions={
            status === 'PENDING_APPROVAL' ? null : (
              <Button type="button" size="sm" variant="outline" onClick={() => setStatus('PENDING_APPROVAL')}>
                Ver {pendingApproval === 1 ? 'el pendiente' : `los ${pendingApproval}`}
              </Button>
            )
          }
        />
      ) : null}
      {toDeliver > 0 ? (
        <AttentionBanner
          live
          tone="info"
          title={`${plural(toDeliver, 'pedido', 'pedidos')} por entregar`}
          description="Aprobados o entregados en parte, todavía sin cerrar."
          actions={
            status === AWAITING_DELIVERY_FILTER ? null : (
              <Button type="button" size="sm" variant="outline" onClick={() => setStatus(AWAITING_DELIVERY_FILTER)}>
                Ver {toDeliver === 1 ? 'el pedido' : `los ${toDeliver}`}
              </Button>
            )
          }
        />
      ) : null}
    </div>
  );
}
