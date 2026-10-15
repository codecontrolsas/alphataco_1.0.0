'use client';

import { Button } from '@/components/ui/button';
import { AttentionBanner } from '@/features/Mantenimiento/shared/components/AttentionBanner';
import { useDataTableFilter } from '@/shared/components/common/DataTable';
import { useQuery } from '@tanstack/react-query';
import { getPaymentOrdersAttention } from '../actions.server';
import { PAYMENT_ORDERS_ATTENTION_QUERY_KEY, PAYMENT_ORDERS_TABLE_ID } from '../constants';

type AttentionData = Awaited<ReturnType<typeof getPaymentOrdersAttention>>;

/**
 * Bandas "órdenes por aprobar" (con permiso de aprobar) y "órdenes por pagar" (con permiso de registrar el pago).
 * Cada número llega del servidor con el mismo `where` que la lista filtrada por ese estado, y se refresca tras cada
 * decisión (la clave cuelga de la de la tabla). Si el filtro ya está aplicado, el botón no se ofrece.
 */
export function PaymentOrdersAttention({
  initialData,
  serverStatus = null,
}: {
  /** `null` cuando no corresponde o el conteo del servidor falló: no se muestra nada. */
  initialData: AttentionData;
  /** Filtro de estado con el que se renderizó el servidor (evita el parpadeo antes de leer la URL). */
  serverStatus?: string | null;
}) {
  const [status, setStatus] = useDataTableFilter(PAYMENT_ORDERS_TABLE_ID, 'status', serverStatus);

  const { data } = useQuery({
    queryKey: PAYMENT_ORDERS_ATTENTION_QUERY_KEY,
    queryFn: getPaymentOrdersAttention,
    initialData,
    staleTime: 30 * 1000,
  });

  const toApprove = data?.toApprove ?? 0;
  const toPay = data?.toPay ?? 0;
  if (toApprove === 0 && toPay === 0) return null;

  return (
    <div className="space-y-3">
      {toApprove > 0 && (
        <AttentionBanner
          live
          tone="warn"
          title={`${toApprove} ${toApprove === 1 ? 'orden de pago por aprobar' : 'órdenes de pago por aprobar'}`}
          description="Esperan tu decisión: aprobalas o rechazalas."
          actions={
            status === 'PENDING_APPROVAL' ? null : (
              <Button type="button" size="sm" variant="outline" onClick={() => setStatus('PENDING_APPROVAL')}>
                Ver {toApprove === 1 ? 'la pendiente' : `las ${toApprove}`}
              </Button>
            )
          }
        />
      )}
      {toPay > 0 && (
        <AttentionBanner
          live
          tone="info"
          title={`${toPay} ${toPay === 1 ? 'orden de pago por pagar' : 'órdenes de pago por pagar'}`}
          description="Están aprobadas y falta registrar el pago."
          actions={
            status === 'APPROVED' ? null : (
              <Button type="button" size="sm" variant="outline" onClick={() => setStatus('APPROVED')}>
                Ver {toPay === 1 ? 'la aprobada' : `las ${toPay}`}
              </Button>
            )
          }
        />
      )}
    </div>
  );
}
