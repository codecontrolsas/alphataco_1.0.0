'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { fetchSupervisorsForChecklist } from '@/features/Checklists/actions/actionsServer';
import { WORKSHOP_STATUS_CONFIG } from '@/features/Mantenimiento/WorkshopTracking/workshopTrackingColumns';
import { ActivityHistoryModal } from '@/features/Mantenimiento/components/ActivityHistoryModal';
import { CommentAuthorLine, commentStyleConfig } from '@/features/Mantenimiento/components/ItemComments';
import { RepairGroupBadge } from '@/features/Mantenimiento/shared/components/RepairGroupBadge';
import { RepairItemPhotos } from '@/features/Mantenimiento/shared/components/RepairItemPhotos';
import {
  getResourceCondition,
  getResourceInternNumber,
  getResourceKindLabel,
  getResourceLabel,
} from '@/features/Mantenimiento/shared/maintenance-resource';
import {
  PREVENTIVE_TYPES,
  PREVENTIVE_TYPE_ICONS,
  type PreventiveType,
} from '@/features/Mantenimiento/shared/preventive-maintenance';
import {
  getRepairItemDescription,
  getRepairItemGroupName,
  getRepairItemImages,
  getRepairItemLabel,
} from '@/features/Mantenimiento/shared/repair-item-label';
import { getItemComments, getTechnicianComments, type CommentEntry } from '@/features/Mantenimiento/utils/driverInfo';
import { invalidateAllMaintenanceQueries } from '@/features/Mantenimiento/utils/queryInvalidation';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  HardHat,
  History,
  MessageSquare,
  Wrench,
  XCircle,
} from 'lucide-react';
import moment from 'moment';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { completeExternalWorkOrder, updateSectorExecutionOrder } from '../actions/mutations.server';
import type { MaintenanceOrderData, ValidationHistoryData } from '../actions/queries.server';
import { getMaintenanceOrderDetail, getValidationHistory } from '../actions/queries.server';
import {
  operationsRejectItems,
  operationsRejectOrder,
  operationsValidateOrder,
  workshopChiefHandleOperationsRejection,
  workshopChiefRejectItems,
  workshopChiefReturnOrder,
  workshopChiefValidateOrder,
} from '../actions/validations.server';
import { statusLabels as orderStatusLabels, statusVariants as orderStatusVariants } from '../table/columns';
import { getRepairDisplayName } from '../utils/repairDisplayName';
import { ExternalWorkshopCard } from './ExternalWorkshopCard';
import { SectorCard, statusLabels as taskStatusLabels, statusBadgeVariants as taskStatusVariants } from './SectorCard';
import { SectorTimeline, type SectorTimelineItem } from './SectorTimeline';
import {
  itemStatusLabels,
  itemStatusVariants,
  type SelectableRepair,
  type StatusBadgeVariant,
  type TaskInfo,
} from './order-detail/types';
import { OrderMaterialsSection, useOrderMaterials } from './order-detail/OrderMaterialsSection';
import { OrderStatusSections } from './order-detail/OrderStatusSections';
import { ValidationHistoryList } from './order-detail/ValidationHistoryList';
import { useOrderDetailData } from './order-detail/useOrderDetailData';
import { useOrderValidationMutations } from './order-detail/useOrderValidationMutations';

interface OrderDetailDialogProps {
  /** Pass orderId to fetch full data from server (preferred) */
  orderId?: string | null;
  /** Pass order data directly (legacy — only from MaintenanceOrdersClient that already has full data) */
  order?: MaintenanceOrderData | null;
  open: boolean;
  onClose: () => void;
  /** Called when order data has finished loading (use to dismiss external loading overlays) */
  onLoaded?: () => void;
  /** Controls which validation actions are available:
   * - 'workshop': Workshop chief can validate/return. Operations section is info-only.
   * - 'operations': Operations can validate/reject. Workshop section is hidden.
   */
  context?: 'workshop' | 'operations';
}


export function OrderDetailDialog({
  orderId: propOrderId,
  order: propOrder,
  open,
  onClose,
  onLoaded,
  context = 'workshop',
}: OrderDetailDialogProps) {
  const queryClient = useQueryClient();
  const [validationNotes, setValidationNotes] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [showItemRejectDialog, setShowItemRejectDialog] = useState(false);
  const [operationsNotes, setOperationsNotes] = useState('');
  const [operationsRejectionReason, setOperationsRejectionReason] = useState('');
  const [showOperationsRejectDialog, setShowOperationsRejectDialog] = useState(false);
  const [showOpsItemRejectDialog, setShowOpsItemRejectDialog] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Fetch full order detail — ALWAYS when dialog is open (fresh data from DB)
  const resolvedOrderId = propOrderId ?? propOrder?.id;
  const { data: fetchedOrder, isLoading: isLoadingOrder } = useQuery({
    queryKey: ['maintenance', 'order-detail', resolvedOrderId],
    queryFn: () => getMaintenanceOrderDetail(resolvedOrderId!),
    enabled: !!resolvedOrderId && open,
    staleTime: 30 * 1000,
  });

  // Prioritize fetched data (fresh) over prop data (potentially stale from table cache)
  const order = (fetchedOrder ?? propOrder ?? null) as MaintenanceOrderData | null;

  // Notify parent when data is ready (dismiss loading overlay)
  useEffect(() => {
    if (order && !isLoadingOrder) {
      onLoaded?.();
    }
  }, [order, isLoadingOrder, onLoaded]);

  // Supervisor de operaciones a asignar al validar (Jefe de Taller → Operaciones)
  const [selectedOperationsSupervisorId, setSelectedOperationsSupervisorId] = useState<string | undefined>(undefined);

  // Sync supervisor selection when order data loads
  useEffect(() => {
    if (order?.maintenance_requests && !Array.isArray(order.maintenance_requests)) {
      setSelectedOperationsSupervisorId(order.maintenance_requests.supervisor_id ?? undefined);
    }
  }, [order?.id, order?.maintenance_requests]);

  // Item-level rejection state: { repairId: comment }
  const [selectedRejections, setSelectedRejections] = useState<Record<string, string>>({});

  // Operations rejection handling (agree/disagree)
  const [opsRejectionComment, setOpsRejectionComment] = useState('');

  // Local sector order state for immediate UI updates on reorder
  const [localTimelineData, setLocalTimelineData] = useState<SectorTimelineItem[] | null>(null);

  // Pedidos de materiales abiertos: impiden completar la orden (el servidor lo vuelve a validar).
  const { openRequests } = useOrderMaterials(order?.id, open);

  const vehicle = order?.vehicles;
  const items = order?.maintenance_order_items || [];
  const status = order?.status ?? '';

  // Ticket 596: la orden puede ser de un equipamiento, así que la identificación
  // del recurso se resuelve con los helpers en vez de leer `vehicles` a secas.
  const resource = order ?? {};
  const resourceLabel = order ? getResourceLabel(resource) : '';
  const resourceKindLabel = order ? getResourceKindLabel(resource) : '';
  const resourceInternNumber = order ? getResourceInternNumber(resource) : null;
  const resourceCondition = order ? getResourceCondition(resource) : null;

  // Reset rejection state when dialog opens/closes
  const resetRejectionState = useCallback(() => {
    setSelectedRejections({});
    setOpsRejectionComment('');
  }, []);

  // Validation history query
  const { data: validationHistory } = useQuery({
    queryKey: ['maintenance', 'validation-history', order?.id],
    queryFn: () => (order ? getValidationHistory(order.id) : []),
    enabled: !!order?.id && open,
  });

  // Supervisores de operaciones para el select de validación (Jefe de Taller)
  const { data: operationsSupervisors, isLoading: isLoadingOperationsSupervisors } = useQuery({
    queryKey: ['supervisors-for-checklist'],
    queryFn: () => fetchSupervisorsForChecklist(),
    staleTime: 5 * 60 * 1000,
    enabled: open && context === 'workshop' && status === 'pending_workshop_validation',
  });

  // ============================================================================
  // MUTATIONS
  // ============================================================================

  // El circuito de validación (taller/operaciones) vive en `useOrderValidationMutations`.
  const {
    workshopValidateMutation,
    workshopReturnMutation,
    workshopRejectItemsMutation,
    completeExternalWOMutation,
    operationsValidateMutation,
    operationsRejectMutation,
    operationsRejectItemsMutation,
    handleOpsRejectionMutation,
    reorderMutation,
  } = useOrderValidationMutations({
    order,
    onClose,
    validationNotes,
    setValidationNotes,
    selectedOperationsSupervisorId,
    returnReason,
    setReturnReason,
    setShowReturnDialog,
    setShowItemRejectDialog,
    operationsNotes,
    setOperationsNotes,
    operationsRejectionReason,
    setOperationsRejectionReason,
    setShowOperationsRejectDialog,
    setShowOpsItemRejectDialog,
    setOpsRejectionComment,
    setLocalTimelineData,
    resetRejectionState,
  });

  // ============================================================================
  // ============================================================================
  // DATA PROCESSING
  // ============================================================================

  // Las derivaciones (sectores, tareas, timeline, comentarios) viven en `useOrderDetailData`:
  // acá quedan el estado del diálogo, las mutaciones y la presentación.
  const {
    sectorGroups,
    externalWorkshopGroups,
    getRepairsForItem,
    getGroupRepairs,
    countGroupTasks,
    selectableRepairs,
    timelineData,
    getItemTasks,
    getSectorTasks,
    detailItems,
    itemsWithComments,
    opsRejectedItems,
  } = useOrderDetailData(items, order, validationHistory);

  // Reset local timeline override cuando cambia la orden
  useEffect(() => {
    setLocalTimelineData(null);
    // Pre-cargar el supervisor actual de la maintenance_request
    const currentSupervisorId =
      order?.maintenance_requests && !Array.isArray(order.maintenance_requests)
        ? order.maintenance_requests.supervisor_id ?? undefined
        : undefined;
    setSelectedOperationsSupervisorId(currentSupervisorId);
  }, [order?.id]);

  // ============================================================================
  // REJECTION DIALOG HELPERS
  // ============================================================================

  const toggleRejection = (repairId: string) => {
    setSelectedRejections((prev) => {
      if (repairId in prev) {
        const next = { ...prev };
        delete next[repairId];
        return next;
      }
      return { ...prev, [repairId]: '' };
    });
  };

  const updateRejectionComment = (repairId: string, comment: string) => {
    setSelectedRejections((prev) => ({ ...prev, [repairId]: comment }));
  };

  const selectedCount = Object.keys(selectedRejections).length;
  const allHaveComments = Object.values(selectedRejections).every((c) => c.trim().length > 0);
  const canSubmitRejections = selectedCount > 0 && allHaveComments;

  const buildRejectionPayload = () =>
    Object.entries(selectedRejections).map(([repairId, comment]) => ({ repairId, comment }));


  const handleSectorReorder = useCallback(
    (sectorId: string, direction: 'up' | 'down') => {
      // Use current local state if available, otherwise compute from sectorGroups
      const currentTimeline = localTimelineData ?? timelineData;
      // Sort then normalize to guarantee unique sequential values (handles duplicate sequenceOrder)
      const sorted = [...currentTimeline]
        .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
        .map((s, i) => ({ ...s, sequenceOrder: i + 1 }));

      const currentIndex = sorted.findIndex((s) => s.sectorId === sectorId);
      if (currentIndex === -1) return;

      const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (swapIndex < 0 || swapIndex >= sorted.length) return;

      // Build new order by swapping the two sectors' sequence orders
      const newOrders = sorted.map((s, i) => {
        if (i === currentIndex) return { ...s, sequenceOrder: sorted[swapIndex].sequenceOrder };
        if (i === swapIndex) return { ...s, sequenceOrder: sorted[currentIndex].sequenceOrder };
        return s;
      });

      // Apply optimistic update: update local timeline state immediately
      setLocalTimelineData(newOrders);

      // Persist to DB
      reorderMutation.mutate(newOrders.map((s) => ({ sectorId: s.sectorId, sequenceOrder: s.sequenceOrder })));
    },
    [localTimelineData, timelineData, reorderMutation]
  );

  const canReorderSectors = status === 'in_workshop' && context === 'workshop' && sectorGroups.length > 1;

  if (!order) return null;

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  /** Renders the item rejection selector (used by both workshop and operations reject dialogs) */
  const renderItemRejectionSelector = () => {
    // Group selectable repairs by sector
    const bySector = new Map<string, SelectableRepair[]>();
    selectableRepairs.forEach((r) => {
      if (!bySector.has(r.sectorName)) bySector.set(r.sectorName, []);
      bySector.get(r.sectorName)!.push(r);
    });

    if (selectableRepairs.length === 0) {
      return (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No hay items completados disponibles para rechazar.
        </p>
      );
    }

    return (
      <div className="space-y-4 max-h-[50vh] overflow-y-auto">
        {Array.from(bySector.entries()).map(([sectorName, repairs]) => (
          <div key={sectorName}>
            <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{sectorName}</h5>
            <div className="space-y-2">
              {repairs.map((repair) => {
                const isSelected = repair.repairId in selectedRejections;
                return (
                  <div
                    key={repair.repairId}
                    className={`rounded-md border p-3 transition-colors ${isSelected ? 'border-destructive/50 bg-destructive/5' : 'border-border'}`}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleRejection(repair.repairId)} />
                      <span className="text-sm font-medium flex-1">{repair.repairName}</span>
                      <Badge variant="success" className="text-[10px]">
                        Completada
                      </Badge>
                    </div>
                    {isSelected && (
                      <Textarea
                        placeholder="Motivo del rechazo (requerido)"
                        value={selectedRejections[repair.repairId]}
                        onChange={(e) => updateRejectionComment(repair.repairId, e.target.value)}
                        className="mt-2 text-sm"
                        rows={2}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Loading state when fetching order detail
  if (isLoadingOrder && !propOrder) {
    return (
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col items-center justify-center py-12">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm text-muted-foreground">Cargando detalle de orden...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0 pr-10">
          <DialogTitle className="flex items-center gap-3 flex-wrap">
            <span>Detalle de Orden</span>
            {order.order_number && (
              <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded">#{order.order_number}</code>
            )}
            <Badge variant="outline">{resourceLabel}</Badge>
            {/* Un equipamiento no tiene tipo de vehículo: se rotula con su categoría de recurso */}
            {vehicle?.vehicle_type?.name ? (
              <Badge variant="secondary">{vehicle.vehicle_type.name}</Badge>
            ) : (
              <Badge variant="secondary">{resourceKindLabel}</Badge>
            )}
            {/* El estado se rotula con los mismos mappers que las tablas del modulo:
                el ternario anterior no cubria todos los estados y dejaba el enum
                crudo a la vista (ej. `date_confirmed`). */}
            {(() => {
              const trackingConfig = WORKSHOP_STATUS_CONFIG[status];
              const label = trackingConfig?.label ?? orderStatusLabels[status] ?? status;
              const variant: StatusBadgeVariant =
                trackingConfig?.variant ??
                (orderStatusVariants as Record<string, StatusBadgeVariant>)[status] ??
                'default';
              const StatusIcon = trackingConfig?.icon;
              return (
                <Badge variant={variant} className="gap-1">
                  {StatusIcon && <StatusIcon className="h-3 w-3" />}
                  {label}
                </Badge>
              );
            })()}
            {/* `ml-auto` mas el `pr-10` del header dejan libre la esquina donde el
                DialogContent dibuja la X de cerrar (absolute top-4 right-4). */}
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => setHistoryOpen(true)}>
              <Clock className="h-4 w-4 mr-1" />
              Ver historial
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
          <div className="space-y-4 pb-4">
            {/* Info del equipo */}
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground block">N. Interno</span>
                  <span className="font-medium">{resourceInternNumber || '-'}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Ingreso a taller</span>
                  <span className="font-medium">
                    {order.workshop_entry_date ? moment(order.workshop_entry_date).format('DD/MM/YYYY') : '-'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Km al ingreso</span>
                  <span className="font-medium">
                    {order.kilometer_at_entry != null ? String(order.kilometer_at_entry) : '-'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Horometro</span>
                  <span className="font-medium">
                    {order.engine_hours_at_entry != null ? `${order.engine_hours_at_entry} hs` : '-'}
                  </span>
                </div>
                {resourceCondition && (
                  <div>
                    <span className="text-xs text-muted-foreground block">Condicion</span>
                    <span className="font-medium capitalize">{resourceCondition.replace(/_/g, ' ')}</span>
                  </div>
                )}
                {order.source && (
                  <div>
                    <span className="text-xs text-muted-foreground block">Origen</span>
                    <span className="font-medium capitalize">
                      {order.source === 'checklist'
                        ? 'Checklist'
                        : order.source === 'preventive'
                          ? 'Preventivo'
                          : 'Manual'}
                    </span>
                    {order.source === 'preventive' &&
                      (() => {
                        const ptKey = (
                          !Array.isArray(order.maintenance_requests)
                            ? order.maintenance_requests?.preventive_type
                            : undefined
                        ) as PreventiveType | undefined;
                        const PtIcon = ptKey ? PREVENTIVE_TYPE_ICONS[ptKey] : undefined;
                        const ptLabel = ptKey ? PREVENTIVE_TYPES[ptKey] : undefined;
                        return ptLabel ? (
                          <Badge variant="secondary" className="mt-1 gap-1 text-xs">
                            {PtIcon && <PtIcon className="h-3 w-3" />}
                            {ptLabel}
                          </Badge>
                        ) : null;
                      })()}
                  </div>
                )}
              </div>
            </div>

            {/* Descripción del pedido */}
            {(() => {
              const orderDescription =
                order.description ??
                (!Array.isArray(order.maintenance_requests) ? order.maintenance_requests?.description : null) ??
                null;
              if (!orderDescription) return null;
              return (
                <div className="bg-muted/50 rounded-lg p-3">
                  <span className="text-xs text-muted-foreground block mb-1">Descripción</span>
                  <p className="text-sm whitespace-pre-wrap break-words">{orderDescription}</p>
                </div>
              );
            })()}

            {/* Items del pedido — cada uno con su estado, sus tareas y SUS fotos.
                Las fotos ya no van en un bloque aparte: el cliente pidio verlas
                pegadas al item que las origino. */}
            {detailItems.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Ítems del pedido
                  <span className="text-xs font-normal text-muted-foreground">({detailItems.length})</span>
                </h4>

                <div className="space-y-2">
                  {detailItems.map((entry) => (
                    <div key={entry.id} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <span className="text-sm font-medium leading-snug flex-1 min-w-0 break-words">
                          {entry.label}
                        </span>
                        <Badge variant={itemStatusVariants[entry.statusKey]} className="shrink-0 text-[10px]">
                          {itemStatusLabels[entry.statusKey]}
                        </Badge>
                      </div>

                      {(entry.groupName || entry.sectorName || entry.workshopName || entry.isDiagnostico) && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <RepairGroupBadge groupName={entry.groupName} />
                          {entry.sectorName && (
                            <Badge variant="secondary" className="text-[10px]">
                              {entry.sectorName}
                            </Badge>
                          )}
                          {!entry.sectorName && entry.workshopName && (
                            <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700">
                              {entry.workshopName}
                            </Badge>
                          )}
                          {entry.isDiagnostico && (
                            <Badge variant="secondary" className="text-[10px]">
                              Diagnóstico
                            </Badge>
                          )}
                        </div>
                      )}

                      {entry.description && (
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                          {entry.description}
                        </p>
                      )}

                      {/* Estado tarea por tarea: si mas adelante se rechaza una sola,
                          se ve cual sin salir del detalle. */}
                      {entry.tasks.length > 0 && (
                        <ul className="space-y-1">
                          {entry.tasks.map((task) => (
                            <li key={task.id} className="flex items-center gap-2 text-xs">
                              <Wrench className="h-3 w-3 shrink-0 text-muted-foreground" />
                              <span className="min-w-0 flex-1 truncate">{task.repairTypeName}</span>
                              <Badge
                                variant={taskStatusVariants[task.status] ?? 'secondary'}
                                className="shrink-0 text-[10px]"
                              >
                                {taskStatusLabels[task.status] ?? task.status}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}

                      {entry.rejectionReason && (
                        <div className="rounded border border-destructive/20 bg-destructive/5 px-2 py-1.5 text-xs">
                          <span className="font-medium text-destructive">Motivo del rechazo: </span>
                          <span className="italic">{entry.rejectionReason}</span>
                        </div>
                      )}

                      <RepairItemPhotos images={entry.images} label={entry.label} size="sm" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Timeline de sectores */}
            <div>
              <h4 className="text-sm font-medium mb-2">
                Secuencia de Sectores
                {canReorderSectors && (
                  <span className="text-xs text-muted-foreground font-normal ml-2">
                    (usa las flechas para cambiar el orden)
                  </span>
                )}
              </h4>
              <SectorTimeline
                sectors={localTimelineData ?? timelineData}
                onReorder={canReorderSectors ? handleSectorReorder : undefined}
                isReordering={reorderMutation.isPending}
              />
            </div>

            <Separator />

            {/* Sector cards */}
            <div className="space-y-3">
              {sectorGroups.length === 0 && externalWorkshopGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No hay sectores asignados a esta orden</p>
              ) : (
                <>
                  {sectorGroups.map((group) => {
                    const timelineItem = timelineData.find((t) => t.sectorId === group.sectorId);
                    // Extract OT info from the first item that has a work_order
                    const woInfo = group.items.find((i) => i.work_orders && !Array.isArray(i.work_orders))?.work_orders;
                    const workOrderNumber =
                      woInfo && typeof woInfo === 'object' && 'order_number' in woInfo
                        ? (woInfo.order_number as string) ?? undefined
                        : undefined;
                    const workOrderStatus =
                      woInfo && typeof woInfo === 'object' && 'status' in woInfo
                        ? (woInfo.status as string) ?? undefined
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
                      />
                    );
                  })}

                  {/* External workshop cards */}
                  {externalWorkshopGroups.map((group) => (
                    <ExternalWorkshopCard
                      key={group.workshopId}
                      workshopName={group.workshopName}
                      items={group.items}
                      orderStatus={status}
                      readOnly={context === 'operations'}
                      onCompleteWorkOrder={(workOrderId) => completeExternalWOMutation.mutate(workOrderId)}
                      isCompleting={completeExternalWOMutation.isPending}
                    />
                  ))}
                </>
              )}
            </div>

            {/* Materiales (Almacenes etapa 4) */}
            {order?.id && <OrderMaterialsSection orderId={order.id} orderNumber={order.order_number ?? null} />}

            {/* Comentarios de la solicitud (por item) */}
            {itemsWithComments.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Comentarios de la Solicitud
                  </h4>
                  {itemsWithComments.map((group, idx) => (
                    <div key={idx} className="space-y-1.5">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {group.itemLabel}
                      </span>
                      {group.comments.map((comment, cidx) => {
                        const cfg = commentStyleConfig[comment.style];
                        return (
                          <div key={cidx} className={`text-sm p-2.5 rounded-md border ${cfg.container} ${cfg.border}`}>
                            <CommentAuthorLine comment={comment} />
                            <p className={`text-sm mt-0.5 ${comment.style !== 'description' ? 'italic' : ''}`}>
                              {comment.text}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ================================================================ */}
            {/* WORKSHOP VALIDATION - pending_workshop_validation + workshop ctx */}
            {/* ================================================================ */}
            {status === 'pending_workshop_validation' && context === 'workshop' && (
              <>
                <Separator />
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium mb-2">Validacion de Jefe de Taller</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Revisa que todas las ordenes de trabajo esten completadas y los trabajos realizados correctamente.
                    </p>

                    {/* Summary of work orders */}
                    <div className="bg-muted p-3 rounded-md mb-3 text-sm">
                      <div className="font-medium mb-2">Resumen de Ordenes de Trabajo:</div>
                      <div className="space-y-2">
                        {items.map((item) => {
                          const wo = item.work_orders;
                          if (!wo || Array.isArray(wo)) return null;
                          const woStatus = wo.status;
                          const isExternal = !item.assigned_sector_id && !!item.assigned_workshop_id;
                          return (
                            <div key={item.id} className="flex items-center gap-2 text-xs">
                              <Badge
                                variant={
                                  woStatus === 'completed'
                                    ? 'success'
                                    : woStatus === 'completed_partial'
                                      ? 'yellow'
                                      : 'default'
                                }
                                className="text-xs"
                              >
                                {wo.order_number || 'Sin N'}
                              </Badge>
                              {isExternal && (
                                <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700">
                                  Externo
                                </Badge>
                              )}
                              <span className="truncate">{getRepairItemLabel(item, getRepairDisplayName(item))}</span>
                              <Badge
                                variant={
                                  woStatus === 'completed'
                                    ? 'success'
                                    : woStatus === 'completed_partial'
                                      ? 'yellow'
                                      : woStatus === 'in_progress'
                                        ? 'info'
                                        : 'secondary'
                                }
                                className="text-[10px] ml-auto shrink-0"
                              >
                                {woStatus === 'completed'
                                  ? 'Completada'
                                  : woStatus === 'completed_partial'
                                    ? 'Parcial'
                                    : woStatus === 'in_progress'
                                      ? 'En progreso'
                                      : woStatus === 'pending'
                                        ? 'Pendiente'
                                        : woStatus || 'Sin estado'}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            <OrderStatusSections
              order={order}
              items={items}
              status={status}
              context={context}
              operationsNotes={operationsNotes}
              setOperationsNotes={setOperationsNotes}
              opsRejectionComment={opsRejectionComment}
              setOpsRejectionComment={setOpsRejectionComment}
              opsRejectedItems={opsRejectedItems}
              resetRejectionState={resetRejectionState}
              setShowOpsItemRejectDialog={setShowOpsItemRejectDialog}
              setShowOperationsRejectDialog={setShowOperationsRejectDialog}
              operationsValidateMutation={operationsValidateMutation}
              operationsRejectItemsMutation={operationsRejectItemsMutation}
              operationsRejectMutation={operationsRejectMutation}
              handleOpsRejectionMutation={handleOpsRejectionMutation}
            />

            {/* ================================================================ */}
            {/* VALIDATION HISTORY TIMELINE                                      */}
            {/* ================================================================ */}
            {validationHistory && validationHistory.length > 0 && <ValidationHistoryList history={validationHistory} />}
          </div>
        </div>

        {/* Footer fijo: cierre del taller (solo en pending_workshop_validation + workshop).
            Ya no se elige supervisor de Operaciones: desde la reunion del 31/08/2026
            Operaciones no valida mas, el taller cierra el circuito. */}
        {status === 'pending_workshop_validation' && context === 'workshop' && (
          <div className="shrink-0 border-t pt-4 space-y-3">
            <Textarea
              placeholder="Notas de validacion (opcional)"
              value={validationNotes}
              onChange={(e) => setValidationNotes(e.target.value)}
            />

            {openRequests.length > 0 && (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
                No se puede cerrar todavía:{' '}
                {openRequests.length === 1
                  ? `${openRequests[0]!.number} sigue abierto. Entregalo, cerralo o cancelalo`
                  : `${openRequests.map((r) => r.number).join(', ')} siguen abiertos. Entregalos, cerralos o cancelalos`}{' '}
                desde Almacenes → Pedidos.
              </p>
            )}

            <PermissionGuard module="mantenimiento" tab="ordenes_mantenimiento" action="update">
              <div className="flex gap-2">
                <Button
                  onClick={() => workshopValidateMutation.mutate()}
                  disabled={workshopValidateMutation.isPending || openRequests.length > 0}
                  className="flex-1"
                >
                  {workshopValidateMutation.isPending ? 'Cerrando...' : 'Validar y Cerrar Orden'}
                </Button>
                <Button
                  onClick={() => {
                    resetRejectionState();
                    setShowItemRejectDialog(true);
                  }}
                  variant="destructive"
                  disabled={workshopRejectItemsMutation.isPending}
                >
                  Rechazar Items
                </Button>
                <Button
                  onClick={() => setShowReturnDialog(true)}
                  variant="outline"
                  disabled={workshopReturnMutation.isPending}
                  size="sm"
                >
                  Devolver Todo
                </Button>
              </div>
            </PermissionGuard>
          </div>
        )}
      </DialogContent>

      {/* ================================================================ */}
      {/* WORKSHOP: Item-level rejection dialog                            */}
      {/* ================================================================ */}
      <AlertDialog open={showItemRejectDialog} onOpenChange={setShowItemRejectDialog}>
        <AlertDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Rechazar Items Especificos</AlertDialogTitle>
            <AlertDialogDescription>
              Selecciona los items que no fueron realizados correctamente. Cada item requiere un comentario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {renderItemRejectionSelector()}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={resetRejectionState}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => workshopRejectItemsMutation.mutate(buildRejectionPayload())}
              disabled={!canSubmitRejections || workshopRejectItemsMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {workshopRejectItemsMutation.isPending
                ? 'Rechazando...'
                : `Rechazar ${selectedCount} item${selectedCount !== 1 ? 's' : ''}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ================================================================ */}
      {/* WORKSHOP: Bulk return dialog (legacy)                            */}
      {/* ================================================================ */}
      <AlertDialog open={showReturnDialog} onOpenChange={setShowReturnDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Devolver Orden Completa al Taller</AlertDialogTitle>
            <AlertDialogDescription>
              Esta accion reabrira todas las ordenes de trabajo completadas. Indica el motivo:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Motivo de devolucion (requerido)"
            value={returnReason}
            onChange={(e) => setReturnReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setReturnReason('')}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => workshopReturnMutation.mutate()}
              disabled={!returnReason.trim() || workshopReturnMutation.isPending}
            >
              {workshopReturnMutation.isPending ? 'Devolviendo...' : 'Devolver Todo'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ================================================================ */}
      {/* OPERATIONS: Item-level rejection dialog                          */}
      {/* ================================================================ */}
      <AlertDialog open={showOpsItemRejectDialog} onOpenChange={setShowOpsItemRejectDialog}>
        <AlertDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Rechazar Items Especificos</AlertDialogTitle>
            <AlertDialogDescription>
              Selecciona los items que no cumplen con los requisitos. El jefe de taller decidira como proceder.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {renderItemRejectionSelector()}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={resetRejectionState}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => operationsRejectItemsMutation.mutate(buildRejectionPayload())}
              disabled={!canSubmitRejections || operationsRejectItemsMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {operationsRejectItemsMutation.isPending
                ? 'Rechazando...'
                : `Rechazar ${selectedCount} item${selectedCount !== 1 ? 's' : ''}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ================================================================ */}
      {/* OPERATIONS: Bulk reject dialog (legacy)                          */}
      {/* ================================================================ */}
      <AlertDialog open={showOperationsRejectDialog} onOpenChange={setShowOperationsRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rechazar Orden Completa</AlertDialogTitle>
            <AlertDialogDescription>
              La orden volvera al estado de validacion de taller. Indica el motivo:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Motivo de rechazo (requerido)"
            value={operationsRejectionReason}
            onChange={(e) => setOperationsRejectionReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setOperationsRejectionReason('')}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => operationsRejectMutation.mutate()}
              disabled={!operationsRejectionReason.trim() || operationsRejectMutation.isPending}
            >
              {operationsRejectMutation.isPending ? 'Rechazando...' : 'Rechazar Todo'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ActivityHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        maintenanceOrderId={order?.id ?? null}
        maintenanceRequestId={order?.maintenance_request_id ?? null}
        title={`Historial de OM ${order?.order_number ?? ''}`}
      />
    </Dialog>
  );
}
