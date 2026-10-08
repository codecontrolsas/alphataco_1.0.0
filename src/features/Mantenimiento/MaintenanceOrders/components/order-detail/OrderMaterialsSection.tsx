'use client';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { searchMaterialOptions } from '@/features/Warehouses/actions/options.server';
import { formatMoney, formatQuantity } from '@/features/Warehouses/lib/format';
import { WAREHOUSE_QUERY_KEYS } from '@/features/Warehouses/lib/query-keys';
import { MaintenanceMaterialRequestDialog } from '@/features/Warehouses/Requests/components/MaintenanceMaterialRequestDialog';
import { RequestStatusBadge } from '@/features/Warehouses/Requests/components/RequestStatusBadge';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, PackagePlus } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { useState } from 'react';
import { createOrderMaterialRequestAction, getMaintenanceOrderMaterials } from '../../actions/materials.server';

/** Pedidos que impiden completar la orden (el servidor lo vuelve a validar al cerrar). */
const OPEN_STATUSES = ['PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_DELIVERED'];

export const orderMaterialsQueryKey = (orderId: string) => ['maintenance', 'order-materials', orderId] as const;

/** Materiales de la orden: lo comparten la seccion y el aviso del footer de cierre. */
export function useOrderMaterials(orderId: string | null | undefined, enabled: boolean) {
  const query = useQuery({
    queryKey: orderMaterialsQueryKey(orderId ?? ''),
    queryFn: () => getMaintenanceOrderMaterials(orderId!),
    enabled: Boolean(orderId) && enabled,
    staleTime: 30 * 1000,
  });
  const openRequests = query.data?.requests.filter((r) => OPEN_STATUSES.includes(r.status)) ?? [];
  return { ...query, openRequests };
}

/**
 * Seccion "Materiales" del detalle de la orden (Almacenes etapa 4): los pedidos de la orden y lo
 * entregado neto por OT. Costos solo si el servidor los manda (permiso de ver precios).
 */
export function OrderMaterialsSection({ orderId, orderNumber }: { orderId: string; orderNumber: string | null }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useOrderMaterials(orderId, true);

  if (isLoading || !data) return null;
  const empty = data.requests.length === 0;
  if (empty && !data.canRequest) return null;

  return (
    <>
      <Separator />
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 text-sm font-medium">
            <Package className="h-4 w-4" />
            Materiales
          </h4>
          {data.canRequest && (
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}>
              <PackagePlus className="h-4 w-4" />
              Pedir materiales
            </Button>
          )}
        </div>

        {empty ? (
          <p className="text-sm text-muted-foreground">Todavía no se pidieron materiales para esta orden.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {data.requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <Link href={`/dashboard/warehouse/requests/${r.id}`} className="font-mono underline">
                  {r.number}
                </Link>
                <RequestStatusBadge status={r.status} />
                <span className="text-muted-foreground">
                  {r.workOrder ?? 'Orden'} · {moment(r.createdAt).format('DD/MM/YYYY')} ·{' '}
                  {r.lineCount === 1 ? '1 material' : `${r.lineCount} materiales`}
                </span>
              </li>
            ))}
          </ul>
        )}

        {data.delivered.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Entregado</p>
            {data.delivered.map((group) => (
              <div key={group.workOrder ?? 'order'} className="rounded-md border p-3">
                <div className="mb-1 flex justify-between gap-2 text-sm font-medium">
                  <span>{group.workOrder ?? 'Toda la orden'}</span>
                  {group.totalCost !== null && <span className="tabular-nums">{formatMoney(group.totalCost)}</span>}
                </div>
                <ul className="space-y-0.5 text-sm">
                  {group.lines.map((line) => (
                    <li key={line.materialId} className="flex justify-between gap-3">
                      <span className="truncate">{line.material}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatQuantity(line.quantity)} {line.unit}
                        {line.totalCost !== null && ` · ${formatMoney(line.totalCost)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {data.totalCost !== null && (
              <p className="text-right text-sm font-medium tabular-nums">Total materiales: {formatMoney(data.totalCost)}</p>
            )}
          </div>
        )}
      </div>

      {open && (
        <MaintenanceMaterialRequestDialog
          open={open}
          onOpenChange={setOpen}
          description={`Para la orden ${orderNumber ?? ''}. El almacén elige de dónde sale cuando lo entrega.`}
          workOrderOptions={data.workOrderOptions}
          search={searchMaterialOptions}
          searchQueryKey={WAREHOUSE_QUERY_KEYS.materialOptions}
          submit={(values) => createOrderMaterialRequestAction(orderId, values)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: orderMaterialsQueryKey(orderId) });
            queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.requests });
          }}
        />
      )}
    </>
  );
}
