'use client';

import { Button } from '@/components/ui/button';
import { formatQuantity } from '@/features/Warehouses/lib/format';
import { MaintenanceMaterialRequestDialog } from '@/features/Warehouses/Requests/components/MaintenanceMaterialRequestDialog';
import { RequestStatusBadge } from '@/features/Warehouses/Requests/components/RequestStatusBadge';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, PackagePlus } from 'lucide-react';
import { useState } from 'react';
import {
  createOperatorMaterialRequest,
  getWorkOrderMaterialRequests,
  searchOperatorMaterialOptions,
} from '../../actions/materials.server';

/** Estados de OT que ya no admiten pedidos (el servidor lo vuelve a validar). */
const CLOSED_STATUSES = ['completed', 'completed_partial', 'cancelled'];

/** Pedidos que todavia esperan materiales (pendiente, aprobado o entregado en parte). */
const WAITING_STATUSES = ['PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_DELIVERED'];

/**
 * Materiales de la OT (Almacenes etapa 4): el operario pide lo que necesita (solo material y
 * cantidad) y ve si ya se lo entregaron. La OT no cambia de estado mientras espera.
 */
export function WorkOrderMaterials({
  workOrderId,
  workOrderNumber,
  workOrderStatus,
}: {
  workOrderId: string;
  workOrderNumber: string;
  workOrderStatus: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const queryKey = ['operator-work-order-materials', workOrderId];
  const { data: requests = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => getWorkOrderMaterialRequests(workOrderId),
    refetchInterval: 30000,
  });
  const waiting = requests.some((r) => WAITING_STATUSES.includes(r.status));
  const canRequest = !CLOSED_STATUSES.includes(workOrderStatus);

  return (
    <section className="mt-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Package className="h-4 w-4" />
          Materiales
          {waiting && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              Esperando materiales
            </span>
          )}
        </h2>
        {canRequest && (
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}>
            <PackagePlus className="h-4 w-4" />
            Pedir materiales
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando pedidos…</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pediste materiales para esta OT.</p>
      ) : (
        <ul className="space-y-2">
          {requests.map((request) => (
            <li key={request.id} className="rounded-md border p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-sm font-medium">{request.number}</span>
                <RequestStatusBadge status={request.status} />
              </div>
              <ul className="space-y-1 text-sm">
                {request.lines.map((line) => (
                  <li key={line.id} className="flex justify-between gap-3">
                    <span className="truncate">{line.material}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatQuantity(line.delivered)} de {formatQuantity(line.requested)} {line.unit}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <MaintenanceMaterialRequestDialog
          open={open}
          onOpenChange={setOpen}
          description={`Para la ${workOrderNumber}. El almacén elige de dónde sale cuando lo entrega.`}
          workOrderId={workOrderId}
          search={searchOperatorMaterialOptions}
          searchQueryKey={['operator-material-options']}
          submit={createOperatorMaterialRequest}
          onCreated={() => queryClient.invalidateQueries({ queryKey })}
        />
      )}
    </section>
  );
}
