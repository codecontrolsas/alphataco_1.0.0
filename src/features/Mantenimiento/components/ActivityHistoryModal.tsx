'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  getMaintenanceOrderActivityLog,
  getMaintenanceOrderFullActivityLog,
  getMaintenanceRequestFullActivityLog,
  getWorkOrderFullActivityLog,
} from '@/features/Mantenimiento/Operaciones/actions/activity-log.server';
import {
  ACTIVITY_STAGE_DESCRIPTIONS,
  ACTIVITY_STAGE_LABELS,
  ACTIVITY_STAGE_ORDER,
  getActivityStage,
  type ActivityStage,
} from '@/features/Mantenimiento/shared/activity-log/stages';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock, GitBranch, Truck } from 'lucide-react';
import { useMemo } from 'react';
import { getPerformerName } from './ActivityHistory/activity-config';
import { ActivityHistorySkeleton } from './ActivityHistory/ActivityHistorySkeleton';
import { GroupedActionItem } from './ActivityHistory/GroupedActionItem';
import { OriginItem, SiblingWorkOrders } from './ActivityHistory/OriginItem';
import { RequestItemComments } from './ActivityHistory/RequestItemComments';
import { TimelineItem } from './ActivityHistory/TimelineItem';
import { WorkOrderAccordion } from './ActivityHistory/WorkOrderAccordion';

interface ActivityHistoryModalProps {
  open: boolean;
  onClose: () => void;
  maintenanceOrderId?: string | null;
  maintenanceRequestId?: string | null;
  workOrderId?: string | null;
  title?: string;
}


export function ActivityHistoryModal({
  open,
  onClose,
  maintenanceOrderId,
  maintenanceRequestId,
  workOrderId,
  title = 'Historial de Actividades',
}: ActivityHistoryModalProps) {
  // Determinar el tipo de vista
  const isWorkOrderView = !!workOrderId;
  const isOrderView = !workOrderId && !!maintenanceOrderId;
  const isRequestOnlyView = !workOrderId && !maintenanceOrderId && !!maintenanceRequestId;

  // Query para historial completo de Work Order (incluye solicitud)
  const { data: fullWorkOrderLog, isLoading: isLoadingFullWO, isError: isErrorWO, refetch: refetchWO } = useQuery({
    queryKey: ['work-order-full-activity-log', workOrderId],
    queryFn: () => getWorkOrderFullActivityLog(workOrderId!),
    enabled: open && isWorkOrderView,
  });

  // Query para historial completo de maintenance_order (incluye origen desde request)
  const { data: fullOrderLog, isLoading: isLoadingFullOrder, isError: isErrorOrder, refetch: refetchOrder } = useQuery({
    queryKey: ['maintenance-order-full-activity-log', maintenanceOrderId, maintenanceRequestId],
    queryFn: () => getMaintenanceOrderFullActivityLog(maintenanceOrderId!, maintenanceRequestId || undefined),
    enabled: open && isOrderView,
  });

  // Query para historial completo de maintenance_request SOLO (sin order asociado)
  const { data: fullRequestLog, isLoading: isLoadingFullRequest, isError: isErrorRequest, refetch: refetchRequest } = useQuery({
    queryKey: ['maintenance-request-full-activity-log', maintenanceRequestId],
    queryFn: () => getMaintenanceRequestFullActivityLog(maintenanceRequestId!),
    enabled: open && isRequestOnlyView,
  });

  const isLoading = isLoadingFullWO || isLoadingFullOrder || isLoadingFullRequest;
  const isError = (isWorkOrderView && isErrorWO) || (isOrderView && isErrorOrder) || (isRequestOnlyView && isErrorRequest);
  const handleRetry = () => {
    if (isWorkOrderView) void refetchWO();
    else if (isOrderView) void refetchOrder();
    else void refetchRequest();
  };

  // Obtener el log de actividades según el tipo de vista
  let activityLog: Awaited<ReturnType<typeof getMaintenanceOrderActivityLog>> = [];
  if (isWorkOrderView) {
    activityLog = fullWorkOrderLog?.history || [];
  } else if (isOrderView) {
    activityLog = fullOrderLog?.history || [];
  } else if (isRequestOnlyView) {
    activityLog = fullRequestLog?.history || [];
  }

  // Obtener el origen (para Order view y Request only view)
  const requestOrigin = isOrderView ? fullOrderLog?.origin : isRequestOnlyView ? fullRequestLog?.origin : null;

  /**
   * Comentarios cargados sobre los items del pedido (ticket 649). Se resuelven en
   * las tres vistas: aunque la de OT no muestra el bloque de origen, los
   * comentarios del pedido son parte del historial que el taller necesita leer.
   */
  const itemComments = isWorkOrderView
    ? fullWorkOrderLog?.itemComments ?? []
    : isOrderView
      ? fullOrderLog?.itemComments ?? []
      : fullRequestLog?.itemComments ?? [];

  const siblingWorkOrders = isWorkOrderView ? fullWorkOrderLog?.siblingWorkOrders : [];
  const vehicleInfo = isWorkOrderView ? fullWorkOrderLog?.vehicleInfo : null;

  /**
   * Historial de la OM repartido en las tres etapas del circuito (ticket 649).
   * Se omiten las etapas sin eventos para no dejar títulos vacíos.
   */
  const stagedActivityLog = useMemo(() => {
    const byStage = new Map<ActivityStage, typeof activityLog>();
    for (const entry of activityLog) {
      const stage = getActivityStage(entry);
      const bucket = byStage.get(stage);
      if (bucket) bucket.push(entry);
      else byStage.set(stage, [entry]);
    }
    // "Pedido" se dibuja aunque no tenga eventos propios cuando hay que colgarle
    // el origen o los comentarios de los items: si no, quedarían sin encabezado.
    const keepEmptyRequestStage = Boolean(requestOrigin) || itemComments.length > 0;

    return ACTIVITY_STAGE_ORDER.filter(
      (stage) => (byStage.get(stage)?.length ?? 0) > 0 || (stage === 'request' && keepEmptyRequestStage)
    ).map((stage) => ({
      stage,
      entries: byStage.get(stage) ?? [],
    }));
  }, [activityLog, requestOrigin, itemComments.length]);

  /** La etapa Taller ya tiene eventos propios en el timeline (ver más abajo) */
  const hasWorkshopStage = stagedActivityLog.some(({ stage }) => stage === 'workshop');

  return (
    <Dialog open={open} onOpenChange={onClose}>
      {/* El ancho va con `sm:` a propósito (ticket 649): la clase base de
          DialogContent trae `sm:max-w-2xl` y un `max-w-*` sin modifier no le gana
          en el CSS, así que el modal quedaba angosto y muy alto. */}
      <DialogContent className="sm:max-w-6xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {isWorkOrderView ? (
              <span className="flex items-center gap-2">
                Historial completo desde la solicitud hasta la orden de trabajo
                {vehicleInfo && (
                  <Badge variant="outline">
                    <Truck className="h-3 w-3 mr-1" />
                    {vehicleInfo.domain || vehicleInfo.intern_number}
                  </Badge>
                )}
              </span>
            ) : (
              'Registro de todas las acciones realizadas'
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Scroll nativo en vez de ScrollArea (ticket 649): el viewport de Radix
            se dimensiona con `height: 100%`, que no resuelve contra un padre cuya
            altura la fija el flex — quedaba en la altura del contenido (758px
            dentro de un area de 367px) y el historial se cortaba sin barra. */}
        {/* `tabIndex` porque una región scrolleable sin elementos focusables adentro
            (p. ej. la vista de solicitud) no se puede recorrer con teclado — antes
            lo resolvía el viewport de Radix. */}
        <div
          className="flex-1 min-h-0 overflow-y-auto pr-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          tabIndex={0}
          aria-label="Historial de actividades"
        >
          {isLoading ? (
            <ActivityHistorySkeleton showWorkOrders={isOrderView} />
          ) : isError ? (
            <div role="alert" className="py-8 text-center text-muted-foreground">
              <AlertTriangle className="mx-auto mb-2 h-10 w-10 opacity-50" />
              <p>No se pudo cargar el historial</p>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={handleRetry}>
                Reintentar
              </Button>
            </div>
          ) : (activityLog && activityLog.length > 0) || requestOrigin || itemComments.length > 0 ? (
            <div>
              {/* Mostrar OTs hermanas si es vista de work order */}
              {isWorkOrderView && siblingWorkOrders && siblingWorkOrders.length > 0 && (
                <SiblingWorkOrders siblings={siblingWorkOrders} />
              )}

              {/* En la vista de OT no hay bloque de origen, así que los comentarios
                  del pedido se muestran arriba de todo (ticket 649) */}
              {isWorkOrderView && itemComments.length > 0 && (
                <div className="relative">
                  <RequestItemComments comments={itemComments} hasMoreItems={activityLog.length > 0} />
                </div>
              )}

              {/* Timeline.
                  En la vista de OM se divide en las tres etapas del circuito
                  (ticket 649); en las otras vistas sigue siendo una sola lista. */}
              {isOrderView ? (
                <div className="space-y-5">
                  {stagedActivityLog.map(({ stage, entries }) => {
                    // El origen y los comentarios de los items pertenecen a la etapa
                    // "Pedido": dejarlos sueltos arriba empujaba el primer encabezado
                    // fuera de la pantalla y los dejaba sin etapa a la que pertenecer.
                    const isFirstStage = stage === 'request';
                    return (
                      <div key={stage}>
                        <div className="sticky top-0 z-20 mb-2 flex items-baseline gap-2 border-b bg-background pb-1 pt-1">
                          <h3 className="text-sm font-semibold">{ACTIVITY_STAGE_LABELS[stage]}</h3>
                          <span className="text-xs text-muted-foreground">{ACTIVITY_STAGE_DESCRIPTIONS[stage]}</span>
                        </div>
                        <div className="relative">
                          {isFirstStage && requestOrigin && (
                            <OriginItem
                              origin={requestOrigin}
                              hasMoreItems={itemComments.length > 0 || entries.length > 0}
                            />
                          )}
                          {isFirstStage && (
                            <RequestItemComments comments={itemComments} hasMoreItems={entries.length > 0} />
                          )}
                          {entries.map((entry, index) =>
                            entry.action_type === 'order_items_updated' ? (
                              <GroupedActionItem
                                key={entry.id}
                                performedAt={entry.performed_at}
                                performerName={getPerformerName(entry.performer ?? null)}
                                metadata={entry.metadata as Parameters<typeof GroupedActionItem>[0]['metadata']}
                                isLast={index === entries.length - 1}
                              />
                            ) : (
                              <TimelineItem
                                key={entry.id}
                                entry={entry as Parameters<typeof TimelineItem>[0]['entry']}
                                isLast={index === entries.length - 1}
                              />
                            )
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="relative">
                  {/* Mostrar origen como primer item (para vista de solicitud) */}
                  {requestOrigin && (
                    <OriginItem
                      origin={requestOrigin}
                      hasMoreItems={activityLog.length > 0 || itemComments.length > 0}
                    />
                  )}

                  {/* Comentarios sobre los items del pedido (ticket 649) */}
                  {!isWorkOrderView && (
                    <RequestItemComments comments={itemComments} hasMoreItems={activityLog.length > 0} />
                  )}

                  {activityLog.map((entry, index) => {
                    if (entry.action_type === 'order_items_updated') {
                      return (
                        <GroupedActionItem
                          key={entry.id}
                          performedAt={entry.performed_at}
                          performerName={getPerformerName(entry.performer ?? null)}
                          metadata={entry.metadata as Parameters<typeof GroupedActionItem>[0]['metadata']}
                          isLast={index === activityLog.length - 1}
                        />
                      );
                    }
                    return (
                      <TimelineItem
                        key={entry.id}
                        entry={entry as Parameters<typeof TimelineItem>[0]['entry']}
                        isLast={index === activityLog.length - 1}
                        showSource={isWorkOrderView}
                      />
                    );
                  })}
                </div>
              )}

              {/* Órdenes de Trabajo (solo en vista de OM).
                  Es la etapa "Taller" del ticket 649: la ejecución se loguea contra
                  cada OT, así que sus eventos no están en el timeline de la OM sino
                  en estos acordeones. Va bajo el mismo encabezado de etapa que las
                  dos anteriores para que las tres se lean como una sola secuencia. */}
              {isOrderView && fullOrderLog?.workOrders && fullOrderLog.workOrders.length > 0 && (
                <>
                  <Separator className="my-4" />
                  <div className="space-y-2">
                    {/* El encabezado solo si la etapa no se dibujó ya arriba con
                        eventos propios (p. ej. `work_order_completed`, que se loguea
                        contra la OM y no contra la OT). */}
                    {!hasWorkshopStage && (
                      <div className="mb-2 flex items-baseline gap-2 border-b pb-1">
                        <h3 className="text-sm font-semibold">{ACTIVITY_STAGE_LABELS.workshop}</h3>
                        <span className="text-xs text-muted-foreground">{ACTIVITY_STAGE_DESCRIPTIONS.workshop}</span>
                      </div>
                    )}
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <GitBranch className="h-4 w-4" />
                      Órdenes de Trabajo ({fullOrderLog.workOrders.length})
                    </h4>
                    {fullOrderLog.workOrders.map((wo, idx) => (
                      <WorkOrderAccordion
                        key={wo.id}
                        workOrder={{
                          id: wo.id,
                          orderNumber: wo.orderNumber,
                          status: wo.status,
                          sectorName: wo.sectorName,
                          isExternal: wo.isExternal,
                        }}
                        defaultOpen={fullOrderLog.workOrders.length === 1 || idx === 0}
                      >
                        {wo.history.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">Sin actividad registrada en esta OT.</p>
                        ) : (
                          <div className="relative">
                            {wo.history.map((entry, i) => {
                              if (entry.action_type === 'order_items_updated') {
                                return (
                                  <GroupedActionItem
                                    key={entry.id}
                                    performedAt={entry.performed_at}
                                    performerName={getPerformerName(entry.performer ?? null)}
                                    metadata={entry.metadata as Parameters<typeof GroupedActionItem>[0]['metadata']}
                                    isLast={i === wo.history.length - 1}
                                  />
                                );
                              }
                              return (
                                <TimelineItem
                                  key={entry.id}
                                  entry={entry as Parameters<typeof TimelineItem>[0]['entry']}
                                  isLast={i === wo.history.length - 1}
                                />
                              );
                            })}
                          </div>
                        )}
                      </WorkOrderAccordion>
                    ))}
                  </div>
                </>
              )}

              {/* Separador y leyenda si es vista de work order */}
              {isWorkOrderView && (
                <>
                  <Separator className="my-4" />
                  <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-xs">
                        Pedido
                      </Badge>
                      = Solicitud original
                    </span>
                    <span className="flex items-center gap-1">
                      <Badge variant="default" className="text-xs">
                        OT
                      </Badge>
                      = Orden de trabajo
                    </span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Sin historial registrado</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
