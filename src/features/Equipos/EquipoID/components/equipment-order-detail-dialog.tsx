'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { SectorTimeline } from '@/features/Mantenimiento/MaintenanceOrders/components/SectorTimeline';
import { formatArgentinaDateTime, formatArgentinaDay } from '@/shared/lib/argentina-time';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, History, MessageSquare, Wrench } from 'lucide-react';
import { useMemo } from 'react';
import { getEquipmentOrderDetail, type EquipmentOrderDetail } from '../lib/actions/vehicle-operations-actions';
import { ORDER_STATUS_VARIANTS, getOrderStatusLabel, isOrderStatus } from '../lib/order-status';
import { ReadonlySectorCard } from './equipment-order-detail/ReadonlySectorCard';
import { ValidationHistoryTimeline } from './equipment-order-detail/ValidationHistoryTimeline';
import {
  buildSectorGroups,
  buildTimelineData,
  collectRequestComments,
  collectWorkOrders,
  getSectorTasks,
  requestSourceLabels,
  workOrderStatusLabels,
  workOrderStatusVariants,
} from './equipment-order-detail/order-detail-model';

interface EquipmentOrderDetailDialogProps {
  equipmentId: string;
  /** Orden a mostrar; `null` cierra el diálogo. El detalle se pide recién al abrir (no viaja con la fila). */
  orderId: string | null;
  onClose: () => void;
  onViewHistory: (target: { orderId: string; requestId: string | null }) => void;
}

function formatDay(value: Date | string | null | undefined): string {
  return value ? formatArgentinaDay(value) : '-';
}

function OrderDetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando el detalle de la orden">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-5 w-full" />
        ))}
      </div>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function OrderDetailBody({ order }: { order: EquipmentOrderDetail }) {
  const items = order.maintenance_order_items;
  const source = order.maintenance_requests?.source;

  const sectorGroups = useMemo(() => buildSectorGroups(items), [items]);
  const timelineData = useMemo(() => buildTimelineData(sectorGroups), [sectorGroups]);
  const workOrders = useMemo(() => collectWorkOrders(items), [items]);
  const requestComments = useMemo(() => collectRequestComments(items, source), [items, source]);

  return (
    <div className="space-y-4 pb-4">
      {/* Info general */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Ingreso:</span>{' '}
          <span className="font-medium">{formatDay(order.workshop_entry_date)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Creada:</span>{' '}
          <span className="font-medium">{formatDay(order.created_at)}</span>
        </div>
        {order.operations_validated_at && (
          <div>
            <span className="text-muted-foreground">Cerrada:</span>{' '}
            <span className="font-medium">{formatDay(order.operations_validated_at)}</span>
          </div>
        )}
        <div>
          <span className="text-muted-foreground">Fuente:</span>{' '}
          <span className="font-medium">{source ? requestSourceLabels[source] ?? source : '-'}</span>
        </div>
      </div>

      <Separator />

      {/* Timeline de sectores */}
      {timelineData.length > 0 && (
        <>
          <div>
            <h4 className="text-sm font-medium mb-2">Secuencia de Sectores</h4>
            <SectorTimeline sectors={timelineData} />
          </div>
          <Separator />
        </>
      )}

      {/* Sector cards */}
      <div className="space-y-3">
        {sectorGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Sin sectores asignados</p>
        ) : (
          sectorGroups.map((group) => {
            const timelineItem = timelineData.find((item) => item.sectorId === group.sectorId);
            return (
              <ReadonlySectorCard
                key={group.sectorId}
                sectorName={group.sectorName}
                sequenceOrder={group.sequenceOrder}
                status={timelineItem?.status ?? 'pending'}
                tasks={getSectorTasks(group)}
                diagnosticoCompleted={timelineItem?.diagnosticoCompleted ?? false}
              />
            );
          })
        )}
      </div>

      {/* Ordenes de Trabajo */}
      {workOrders.length > 0 && (
        <>
          <Separator />
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Ordenes de Trabajo
            </h4>
            <div className="grid gap-2">
              {workOrders.map((workOrder) => (
                <div
                  key={workOrder.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-mono">{workOrder.order_number || '-'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {workOrder.started_at && (
                      <span className="text-xs text-muted-foreground">Inicio: {formatDay(workOrder.started_at)}</span>
                    )}
                    {workOrder.completed_at && (
                      <span className="text-xs text-muted-foreground">Fin: {formatDay(workOrder.completed_at)}</span>
                    )}
                    <Badge variant={workOrderStatusVariants[workOrder.status] ?? 'outline'}>
                      {workOrderStatusLabels[workOrder.status] ?? workOrder.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Comentarios de la solicitud */}
      {requestComments.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Comentarios de la Solicitud
            </h4>
            {requestComments.map((comment, index) => (
              <div
                key={`${comment.type}-${index}`}
                className={`text-sm p-2.5 rounded-md ${
                  comment.type === 'driver'
                    ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800'
                    : 'bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800'
                }`}
              >
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span
                    className={`text-xs font-medium ${
                      comment.type === 'driver'
                        ? 'text-amber-700 dark:text-amber-300'
                        : 'text-blue-700 dark:text-blue-300'
                    }`}
                  >
                    {comment.type === 'driver' ? 'Chofer' : source === 'manual' ? 'Supervisor' : 'Validador'}
                  </span>
                  <span className="text-xs text-muted-foreground">&middot; {comment.itemDescription}</span>
                </div>
                <p className="text-sm italic">{comment.text}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Informacion de cierre */}
      {(order.workshop_validated_at || order.operations_validated_at) && (
        <>
          <Separator />
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Informacion de Validaciones</h4>
            {order.workshop_validated_at && (
              <div className="bg-muted p-3 rounded-md text-sm">
                <div className="font-medium mb-1">Validado por Jefe de Taller</div>
                <div className="text-xs text-muted-foreground">
                  Fecha: {formatArgentinaDateTime(order.workshop_validated_at)}
                </div>
                {order.workshop_validation_notes && (
                  <div className="text-xs mt-1">Notas: {order.workshop_validation_notes}</div>
                )}
              </div>
            )}
            {order.operations_validated_at && (
              <div className="bg-muted p-3 rounded-md text-sm">
                <div className="font-medium mb-1">Validado por Operaciones</div>
                <div className="text-xs text-muted-foreground">
                  Fecha: {formatArgentinaDateTime(order.operations_validated_at)}
                </div>
                {order.operations_validation_notes && (
                  <div className="text-xs mt-1">Notas: {order.operations_validation_notes}</div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Historial de validaciones */}
      <ValidationHistoryTimeline history={order.validationHistory} />
    </div>
  );
}

/**
 * Detalle de una orden de mantenimiento del equipo (solo lectura). La fila de la tabla es liviana: el
 * detalle completo (sectores, OTs, reparaciones, historial de validaciones) se pide acá, al abrir.
 */
export function EquipmentOrderDetailDialog({
  equipmentId,
  orderId,
  onClose,
  onViewHistory,
}: EquipmentOrderDetailDialogProps) {
  const {
    data: order,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['equipment-order-detail', equipmentId, orderId],
    queryFn: () => getEquipmentOrderDetail(equipmentId, orderId as string),
    enabled: orderId !== null,
    // Corto: el estado de la orden cambia desde Mantenimiento y el diálogo debe mostrar el actual.
    staleTime: 10 * 1000,
  });

  const status = order?.status;

  return (
    <Dialog open={orderId !== null} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono">{order ? order.order_number || 'Sin numero' : 'Detalle de la orden'}</span>
            {status && (
              <Badge variant={isOrderStatus(status) ? ORDER_STATUS_VARIANTS[status] : 'default'}>
                {getOrderStatusLabel(status)}
              </Badge>
            )}
            {order && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto text-purple-600 hover:text-purple-700"
                onClick={() => onViewHistory({ orderId: order.id, requestId: order.maintenance_requests?.id ?? null })}
              >
                <History className="h-4 w-4 mr-1" />
                Historial
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {isLoading && <OrderDetailSkeleton />}

          {isError && (
            <div role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-muted-foreground">No se pudo cargar el detalle de la orden.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                Reintentar
              </Button>
            </div>
          )}

          {order && <OrderDetailBody order={order} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
