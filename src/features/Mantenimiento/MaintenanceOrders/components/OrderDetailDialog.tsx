'use client';

import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import type { MaintenanceOrderData } from '../actions/queries.server';
import { getMaintenanceOrderDetail, getValidationHistory } from '../actions/queries.server';
import type { SectorTimelineItem } from './SectorTimeline';
import { OrderDetailHeader } from './order-detail/OrderDetailHeader';
import { OrderDetailMessage, OrderDetailSkeleton } from './order-detail/OrderDetailStates';
import { OrderHistoryInline } from './order-detail/OrderHistoryInline';
import { OrderItemsSection } from './order-detail/OrderItemsSection';
import { OrderMaterialsSection, useOrderMaterials } from './order-detail/OrderMaterialsSection';
import { OrderRejectionDialogs } from './order-detail/OrderRejectionDialogs';
import { OrderSectorsSection } from './order-detail/OrderSectorsSection';
import { OrderStatusSections } from './order-detail/OrderStatusSections';
import { OrderValidationFooter } from './order-detail/OrderValidationFooter';
import { ValidationHistoryList } from './order-detail/ValidationHistoryList';
import { WorkshopValidationSummary } from './order-detail/WorkshopValidationSummary';
import { useOrderDetailData } from './order-detail/useOrderDetailData';
import { useOrderValidationMutations } from './order-detail/useOrderValidationMutations';

/** Mismas pantallas que acepta `getMaintenanceOrderDetail` en el servidor (`ORDER_DETAIL_VIEW_TABS`). */
const ORDER_DETAIL_VIEW_TABS = [
  'ordenes_mantenimiento',
  'seguimiento_taller',
  'bandeja_aprobaciones',
  'gestion_ordenes',
  'pedidos_pendientes',
  'pedidos_confirmados',
] as const;

interface OrderDetailDialogProps {
  /** Pass orderId to fetch full data from server (preferred) */
  orderId?: string | null;
  /** Pass order data directly (legacy — only from MaintenanceOrdersClient that already has full data) */
  order?: MaintenanceOrderData | null;
  open: boolean;
  onClose: () => void;
  /** Called when the panel is ready to show its own loading state (use to dismiss external loading overlays) */
  onLoaded?: () => void;
  /** Controls which validation actions are available:
   * - 'workshop': Workshop chief can validate/return. Operations section is info-only.
   * - 'operations': Operations can validate/reject. Workshop section is hidden.
   */
  context?: 'workshop' | 'operations';
  /** Abre la gestión de la orden (wizard). Opcional: sin ella el panel no muestra "Gestionar orden". */
  onManage?: (orderId: string) => void;
}

/**
 * Detalle de una orden de mantenimiento en un panel lateral (`Sheet`). Conserva el nombre y las props del
 * antiguo diálogo para no tocar a sus consumidores. Las acciones de cierre/validación son las mismas.
 */
export function OrderDetailDialog({
  orderId: propOrderId,
  order: propOrder,
  open,
  onClose,
  onLoaded,
  context = 'workshop',
  onManage,
}: OrderDetailDialogProps) {
  const [validationNotes, setValidationNotes] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [showItemRejectDialog, setShowItemRejectDialog] = useState(false);
  const [operationsNotes, setOperationsNotes] = useState('');
  const [operationsRejectionReason, setOperationsRejectionReason] = useState('');
  const [showOperationsRejectDialog, setShowOperationsRejectDialog] = useState(false);
  const [showOpsItemRejectDialog, setShowOpsItemRejectDialog] = useState(false);

  // Fetch full order detail — ALWAYS when the panel is open (fresh data from DB)
  const resolvedOrderId = propOrderId ?? propOrder?.id;
  const {
    data: fetchedOrder,
    isLoading: isLoadingOrder,
    isError: isOrderError,
    error: orderError,
    refetch: refetchOrder,
    isFetching: isFetchingOrder,
  } = useQuery({
    queryKey: ['maintenance', 'order-detail', resolvedOrderId],
    queryFn: () => getMaintenanceOrderDetail(resolvedOrderId!),
    enabled: !!resolvedOrderId && open,
    staleTime: 30 * 1000,
  });

  // Prioritize fetched data (fresh) over prop data (potentially stale from table cache)
  const order = (fetchedOrder ?? propOrder ?? null) as MaintenanceOrderData | null;

  // El panel dibuja su propio estado de carga: el consumidor puede bajar su overlay apenas se abre.
  useEffect(() => {
    if (open) onLoaded?.();
  }, [open, onLoaded]);

  // Sin permiso de consulta: el servidor lo rechaza; la UI lo dice en vez de mostrar un error genérico.
  const { canView, isLoading: isLoadingPermissions } = usePermissions();
  const lacksViewPermission =
    isOrderError &&
    ((orderError instanceof Error && /permiso/i.test(orderError.message)) ||
      (!isLoadingPermissions && !ORDER_DETAIL_VIEW_TABS.some((tab) => canView('mantenimiento', tab))));

  // Supervisor de operaciones a asignar al validar (Jefe de Taller → Operaciones)
  const [selectedOperationsSupervisorId, setSelectedOperationsSupervisorId] = useState<string | undefined>(undefined);

  // Item-level rejection state: { repairId: comment }
  const [selectedRejections, setSelectedRejections] = useState<Record<string, string>>({});

  // Operations rejection handling (agree/disagree)
  const [opsRejectionComment, setOpsRejectionComment] = useState('');

  // Local sector order state for immediate UI updates on reorder
  const [localTimelineData, setLocalTimelineData] = useState<SectorTimelineItem[] | null>(null);

  // Pedidos de materiales abiertos: impiden completar la orden (el servidor lo vuelve a validar).
  const { openRequests } = useOrderMaterials(order?.id, open);

  const items = order?.maintenance_order_items || [];
  const status = order?.status ?? '';

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

  // Las derivaciones (sectores, tareas, timeline, comentarios) viven en `useOrderDetailData`.
  const {
    sectorGroups,
    externalWorkshopGroups,
    selectableRepairs,
    timelineData,
    getSectorTasks,
    detailItems,
    itemsWithComments,
    opsRejectedItems,
  } = useOrderDetailData(items, order, validationHistory);

  // Al cambiar de orden: se descarta el reordenamiento optimista y se precarga el supervisor actual.
  useEffect(() => {
    setLocalTimelineData(null);
    const request = order?.maintenance_requests;
    setSelectedOperationsSupervisorId(
      request && !Array.isArray(request) ? (request.supervisor_id ?? undefined) : undefined
    );
  }, [order?.id]);

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

  const submitRejections = (target: 'workshop' | 'operations') => {
    const payload = Object.entries(selectedRejections).map(([repairId, comment]) => ({ repairId, comment }));
    if (target === 'workshop') workshopRejectItemsMutation.mutate(payload);
    else operationsRejectItemsMutation.mutate(payload);
  };

  const timeline = localTimelineData ?? timelineData;

  const handleSectorReorder = useCallback(
    (sectorId: string, direction: 'up' | 'down') => {
      // Sort then normalize to guarantee unique sequential values (handles duplicate sequenceOrder)
      const sorted = [...timeline]
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

      // Optimistic update + persist
      setLocalTimelineData(newOrders);
      reorderMutation.mutate(newOrders.map((s) => ({ sectorId: s.sectorId, sequenceOrder: s.sequenceOrder })));
    },
    [timeline, reorderMutation]
  );

  const canReorderSectors = status === 'in_workshop' && context === 'workshop' && sectorGroups.length > 1;
  const isWorkshopValidation = status === 'pending_workshop_validation' && context === 'workshop';
  const workOrderCount = new Set(
    items.flatMap((item) => (item.work_orders && !Array.isArray(item.work_orders) ? [item.work_orders.id] : []))
  ).size;

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) onClose();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          showCloseButton={false}
          aria-describedby={undefined}
          className="w-full gap-0 p-0 sm:max-w-[920px]"
        >
          {!order && isLoadingOrder ? (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <SheetTitle className="sr-only">Detalle de Orden</SheetTitle>
              <OrderDetailSkeleton />
            </div>
          ) : !order ? (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <SheetTitle className="sr-only">Detalle de Orden</SheetTitle>
              <OrderDetailMessage
                kind={lacksViewPermission ? 'forbidden' : 'error'}
                onRetry={() => void refetchOrder()}
                isRetrying={isFetchingOrder}
              />
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
                <div className="space-y-6">
                  <OrderDetailHeader
                    order={order}
                    panelTitle={isWorkshopValidation ? 'Validación de Jefe de Taller' : 'Detalle de Orden'}
                  />

                  {isWorkshopValidation && <WorkshopValidationSummary items={items} />}

                  <OrderSectorsSection
                    orderStatus={status}
                    context={context}
                    sectorGroups={sectorGroups}
                    externalWorkshopGroups={externalWorkshopGroups}
                    timeline={timeline}
                    getSectorTasks={getSectorTasks}
                    canReorder={canReorderSectors}
                    isReordering={reorderMutation.isPending}
                    onReorder={handleSectorReorder}
                    onCompleteExternalWorkOrder={(workOrderId) => completeExternalWOMutation.mutate(workOrderId)}
                    isCompletingExternal={completeExternalWOMutation.isPending}
                    onManage={onManage ? () => onManage(order.id) : undefined}
                  />

                  <OrderMaterialsSection orderId={order.id} orderNumber={order.order_number ?? null} />

                  <OrderItemsSection detailItems={detailItems} itemsWithComments={itemsWithComments} />

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

                  {validationHistory && validationHistory.length > 0 && (
                    <ValidationHistoryList history={validationHistory} />
                  )}

                  <Separator />

                  <OrderHistoryInline
                    orderId={order.id}
                    requestId={order.maintenance_request_id ?? null}
                    enabled={open}
                  />
                </div>
              </div>

              <OrderValidationFooter
                status={status}
                context={context}
                workOrderCount={workOrderCount}
                validationNotes={validationNotes}
                onValidationNotesChange={setValidationNotes}
                openRequestNumbers={openRequests.map((r) => r.number)}
                isValidating={workshopValidateMutation.isPending}
                isRejectingItems={workshopRejectItemsMutation.isPending}
                isReturning={workshopReturnMutation.isPending}
                onValidate={() => workshopValidateMutation.mutate()}
                onRejectItems={() => {
                  resetRejectionState();
                  setShowItemRejectDialog(true);
                }}
                onReturn={() => setShowReturnDialog(true)}
              />
            </>
          )}
        </SheetContent>
      </Sheet>

      <OrderRejectionDialogs
        selectableRepairs={selectableRepairs}
        selectedRejections={selectedRejections}
        onToggleRejection={toggleRejection}
        onRejectionComment={updateRejectionComment}
        onResetRejections={resetRejectionState}
        canSubmitRejections={canSubmitRejections}
        onSubmitRejections={submitRejections}
        showItemReject={showItemRejectDialog}
        setShowItemReject={setShowItemRejectDialog}
        workshopRejectItems={workshopRejectItemsMutation}
        showReturn={showReturnDialog}
        setShowReturn={setShowReturnDialog}
        returnReason={returnReason}
        setReturnReason={setReturnReason}
        workshopReturn={workshopReturnMutation}
        showOpsItemReject={showOpsItemRejectDialog}
        setShowOpsItemReject={setShowOpsItemRejectDialog}
        operationsRejectItems={operationsRejectItemsMutation}
        showOpsReject={showOperationsRejectDialog}
        setShowOpsReject={setShowOperationsRejectDialog}
        operationsRejectionReason={operationsRejectionReason}
        setOperationsRejectionReason={setOperationsRejectionReason}
        operationsReject={operationsRejectMutation}
      />
    </>
  );
}
