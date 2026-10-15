'use client';

import { Button } from '@/components/ui/button';
import { AttentionBanner } from '@/features/Mantenimiento/shared/components/AttentionBanner';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { getPurchaseReceiptsAttention } from '../actions.server';
import { PENDING_ORDERS_HREF, RECEIPTS_ATTENTION_QUERY_KEY } from '../constants';

type AttentionData = Awaited<ReturnType<typeof getPurchaseReceiptsAttention>>;

/**
 * Banda "órdenes pendientes de recibir". El número es el mismo del contador de la sub-navegación (llega del
 * servidor, solo para quien puede registrar recepciones) y se refresca tras cada recepción (la clave cuelga de
 * la de la tabla, así `invalidatePurchases` la invalida). La acción lleva a la lista de órdenes filtrada, donde
 * se abre la orden y se registra la recepción; solo se ofrece si el usuario puede ver órdenes.
 */
export function ReceiptsAttention({ initialData }: { initialData: AttentionData }) {
  const { data } = useQuery({
    queryKey: RECEIPTS_ATTENTION_QUERY_KEY,
    queryFn: getPurchaseReceiptsAttention,
    initialData,
    staleTime: 30 * 1000,
  });

  const pending = data?.pendingToReceive ?? 0;
  if (pending === 0) return null;

  return (
    <AttentionBanner
      live
      tone="warn"
      title={`${pending} ${pending === 1 ? 'orden pendiente' : 'órdenes pendientes'} de recibir`}
      description="Fueron enviadas al proveedor y todavía falta recibir mercadería o servicios."
      actions={
        data?.canViewOrders ? (
          <Button asChild size="sm" variant="outline">
            <Link href={PENDING_ORDERS_HREF}>Ver {pending === 1 ? 'la orden' : `las ${pending} órdenes`}</Link>
          </Button>
        ) : null
      }
    />
  );
}
