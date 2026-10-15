'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { OrderDetailDialog } from '@/features/Mantenimiento/MaintenanceOrders/components/OrderDetailDialog';
import { MaintenanceStatusPill } from '@/features/Mantenimiento/shared/components/MaintenanceStatusPill';
import { ResourceCell, toResourceCellResource } from '@/features/Mantenimiento/shared/components/ResourceCell';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { Eye } from 'lucide-react';
import { useState } from 'react';
import type { ReturnedOrderData } from '../actions/actionsServer';

interface ReturnedOrdersListProps {
  orders: ReturnedOrderData[];
}

/** Órdenes que el jefe de taller devolvió al taller (D-1). Solo lectura: "Ver orden" abre el panel de detalle. */
export function ReturnedOrdersList({ orders }: ReturnedOrdersListProps) {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  return (
    <>
      <ul className="space-y-3">
        {orders.map((order) => (
          <li key={order.id} className="bg-card rounded-xl border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                <ResourceCell resource={toResourceCellResource(order)} />
                <span className="font-mono text-sm font-semibold">{order.order_number ?? 'Se asigna al ingresar'}</span>
                <MaintenanceStatusPill entity="order" status="in_workshop" size="sm" />
                <Badge variant="outline">
                  {order.returnKind === 'items_rejected' ? 'Ítems rechazados' : 'Orden devuelta'}
                </Badge>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedOrderId(order.id)}>
                <Eye className="size-4" aria-hidden="true" />
                Ver orden
              </Button>
            </div>

            {order.description ? <p className="mt-2 text-sm">{order.description}</p> : null}
            <p className="text-muted-foreground mt-1 text-sm">
              Devuelta{order.returnedBy ? ` por ${order.returnedBy}` : ''} · {formatArgentinaDateTime(order.returnedAt)}
            </p>
            {order.returnReason ? (
              <blockquote className="border-danger/30 bg-danger-subtle text-danger-subtle-foreground mt-3 rounded-md border px-3 py-2 text-sm">
                <span className="font-medium">Motivo: </span>
                {order.returnReason}
              </blockquote>
            ) : null}
          </li>
        ))}
      </ul>

      <OrderDetailDialog
        orderId={selectedOrderId}
        open={!!selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
        context="workshop"
      />
    </>
  );
}
