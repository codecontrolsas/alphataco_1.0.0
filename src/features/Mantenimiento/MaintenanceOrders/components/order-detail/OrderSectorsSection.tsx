'use client';

import { Button } from '@/components/ui/button';
import { SectorRoute, type SectorRouteStep } from '@/features/Mantenimiento/shared/components/SectorRoute';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { Settings2 } from 'lucide-react';
import { ExternalWorkshopCard } from '../ExternalWorkshopCard';
import { SectorCard } from '../SectorCard';
import type { SectorStatus, SectorTimelineItem } from '../SectorTimeline';
import type { useOrderDetailData } from './useOrderDetailData';

type DetailData = ReturnType<typeof useOrderDetailData>;

const ROUTE_STATE: Record<SectorStatus, SectorRouteStep['state']> = {
  completed: 'done',
  in_progress: 'running',
  paused: 'stuck',
  pending: 'pending',
  blocked: 'pending',
};

interface OrderSectorsSectionProps {
  orderStatus: string;
  context: 'workshop' | 'operations';
  sectorGroups: DetailData['sectorGroups'];
  externalWorkshopGroups: DetailData['externalWorkshopGroups'];
  /** Secuencia vigente (incluye el reordenamiento optimista). */
  timeline: SectorTimelineItem[];
  getSectorTasks: DetailData['getSectorTasks'];
  canReorder: boolean;
  isReordering: boolean;
  onReorder: (sectorId: string, direction: 'up' | 'down') => void;
  onCompleteExternalWorkOrder: (workOrderId: string) => void;
  isCompletingExternal: boolean;
  /** Abre la gestión de la orden. Si el consumidor no la provee, el botón no se muestra. */
  onManage?: () => void;
}

/** "Sectores · orden de ejecución": recorrido compacto y una tarjeta por sector con su OT y su progreso. */
export function OrderSectorsSection({
  orderStatus,
  context,
  sectorGroups,
  externalWorkshopGroups,
  timeline,
  getSectorTasks,
  canReorder,
  isReordering,
  onReorder,
  onCompleteExternalWorkOrder,
  isCompletingExternal,
  onManage,
}: OrderSectorsSectionProps) {
  const { hasPermission } = usePermissions();
  // Reordenar escribe `sector_sequence_order`: exige la misma clave `update` que valida el servidor.
  const canUpdateOrders = hasPermission('mantenimiento', 'ordenes_mantenimiento', 'update');
  const showReorder = canReorder && canUpdateOrders;

  const orderedGroups = [...sectorGroups].sort((a, b) => {
    const seq = (id: string, fallback: number) => timeline.find((t) => t.sectorId === id)?.sequenceOrder ?? fallback;
    return seq(a.sectorId, a.sequenceOrder) - seq(b.sectorId, b.sequenceOrder);
  });

  const routeSteps: SectorRouteStep[] = orderedGroups.map((group) => ({
    id: group.sectorId,
    name: group.sectorName,
    state: ROUTE_STATE[timeline.find((t) => t.sectorId === group.sectorId)?.status ?? 'pending'],
  }));

  const isEmpty = sectorGroups.length === 0 && externalWorkshopGroups.length === 0;

  return (
    <section aria-labelledby="order-sectors-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="order-sectors-title" className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          Sectores · orden de ejecución
        </h3>
        {onManage && orderStatus === 'in_workshop' && context === 'workshop' && (
          <PermissionGuard module="mantenimiento" tab="gestion_ordenes" action="update">
            <Button type="button" variant="outline" size="sm" onClick={onManage}>
              <Settings2 aria-hidden="true" className="mr-1 h-4 w-4" />
              Gestionar orden
            </Button>
          </PermissionGuard>
        )}
      </div>

      {isEmpty ? (
        <p className="text-muted-foreground rounded-lg border border-dashed py-8 text-center text-sm">
          Esta orden todavía no tiene sectores asignados.
        </p>
      ) : (
        <>
          {routeSteps.length > 1 && <SectorRoute sectors={routeSteps} />}
          {showReorder && (
            <p className="text-muted-foreground text-xs">Usá las flechas de cada sector para cambiar el orden.</p>
          )}
          <div className="space-y-3">
            {orderedGroups.map((group, index) => {
              const timelineItem = timeline.find((t) => t.sectorId === group.sectorId);
              // La OT del sector sale del primer ítem que ya la tiene generada.
              const woInfo = group.items.find((i) => i.work_orders && !Array.isArray(i.work_orders))?.work_orders;
              const workOrderNumber =
                woInfo && typeof woInfo === 'object' && 'order_number' in woInfo
                  ? ((woInfo.order_number as string) ?? undefined)
                  : undefined;
              const workOrderStatus =
                woInfo && typeof woInfo === 'object' && 'status' in woInfo
                  ? ((woInfo.status as string) ?? undefined)
                  : undefined;
              return (
                <SectorCard
                  key={group.sectorId}
                  sectorName={group.sectorName}
                  sequenceOrder={group.sequenceOrder}
                  status={timelineItem?.status || 'pending'}
                  tasks={getSectorTasks(group)}
                  diagnosticoCompleted={timelineItem?.diagnosticoCompleted || false}
                  workOrderNumber={workOrderNumber}
                  workOrderStatus={workOrderStatus}
                  isReordering={isReordering}
                  onMoveUp={showReorder && index > 0 ? () => onReorder(group.sectorId, 'up') : undefined}
                  onMoveDown={
                    showReorder && index < orderedGroups.length - 1
                      ? () => onReorder(group.sectorId, 'down')
                      : undefined
                  }
                />
              );
            })}

            {externalWorkshopGroups.map((group) => (
              <ExternalWorkshopCard
                key={group.workshopId}
                workshopName={group.workshopName}
                items={group.items}
                orderStatus={orderStatus}
                readOnly={context === 'operations'}
                onCompleteWorkOrder={onCompleteExternalWorkOrder}
                isCompleting={isCompletingExternal}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
