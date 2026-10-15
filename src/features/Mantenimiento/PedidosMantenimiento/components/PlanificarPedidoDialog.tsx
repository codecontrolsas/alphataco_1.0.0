'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ItemComments } from '@/features/Mantenimiento/components/ItemComments';
import { PreventiveInfoCard } from '@/features/Mantenimiento/components/PreventiveInfoCard';
import { RepairGroupBadge } from '@/features/Mantenimiento/shared/components/RepairGroupBadge';
import { RepairItemPhotos } from '@/features/Mantenimiento/shared/components/RepairItemPhotos';
import { formatDateForDB } from '@/features/Mantenimiento/utils/dateFormat';
import { CalendarCheck, Clock, Gauge, Loader2, Wrench } from 'lucide-react';
import { argentinaDate, formatLongDateAr } from '@/shared/lib/argentina-time';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import moment from 'moment';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ActionDialogResource, getActionErrorMessage } from '../../shared/components/ActionDialogParts';
import { getResourceCondition, getResourceKind } from '../../shared/maintenance-resource';
import { getRepairItemGroupName, getRepairItemImages, getRepairItemLabel } from '../../shared/repair-item-label';
import type { MaintenanceOrderData } from '../actions/actionsServer';
import { useScheduleMaintenanceOrder } from '../hooks/useMaintenanceOrders';

interface PlanificarPedidoDialogProps {
  order: MaintenanceOrderData;
  open: boolean;
  onClose: () => void;
}

function formatSectionCode(code: string | null | undefined): string {
  if (!code) return '';
  return code
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const scheduleSchema = z.object({
  date: z.custom<Date>((value) => value instanceof Date && !Number.isNaN(value.getTime()), {
    message: 'Debe seleccionar una fecha',
  }),
});

type ScheduleValues = z.infer<typeof scheduleSchema>;

export function PlanificarPedidoDialog({ order, open, onClose }: PlanificarPedidoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {/* El formulario vive dentro de DialogContent: al cerrar se desmonta y la fecha no se arrastra. */}
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <ScheduleForm order={order} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

function ScheduleForm({ order, onClose }: { order: MaintenanceOrderData; onClose: () => void }) {
  const scheduleMutation = useScheduleMaintenanceOrder();
  const queryClient = useQueryClient();
  // Tras el éxito el botón sigue bloqueado mientras el diálogo termina de cerrarse.
  const [isDone, setIsDone] = useState(false);

  const form = useForm<ScheduleValues>({
    resolver: zodResolver(scheduleSchema),
    mode: 'onChange',
    defaultValues: { date: undefined },
  });
  const { isSubmitting, isValid } = form.formState;
  const selectedDate = form.watch('date');

  // Ticket 596: el pedido puede ser de un vehiculo o de un equipamiento
  const isOtherEquipment = getResourceKind(order) === 'other_equipment';
  const itemCount = order.maintenance_order_items?.length ?? 0;
  const isPreventive = order.maintenance_requests?.source === 'preventive';
  const description = order.description ?? order.maintenance_requests?.description;

  // Un equipamiento no lleva kilometraje; sus horas de uso viven en `horometer`.
  const kilometer = isOtherEquipment ? null : (order.vehicles?.kilometer ?? order.maintenance_requests?.kilometer);
  const engineHours =
    order.other_equipment?.horometer ?? order.vehicles?.engine_hours ?? order.maintenance_requests?.engine_hours;

  // Fecha mínima: hoy en Argentina (el servidor corre en UTC y entre las 21 y las 24 h ya es "mañana").
  const todayAr = argentinaDate();
  const minDate = moment(todayAr, 'YYYY-MM-DD').toDate();

  async function onSubmit(values: ScheduleValues) {
    try {
      await scheduleMutation.mutateAsync({
        orderId: order.id,
        scheduledDate: formatDateForDB(values.date),
      });
      setIsDone(true);
      queryClient.invalidateQueries({ queryKey: ['datatable-facet'] });
      toast.success('Pedido planificado exitosamente');
      onClose();
    } catch (error) {
      toast.error('Error al planificar el pedido', { description: getActionErrorMessage(error) ?? undefined });
    }
  }

  // Agrupar items por tipo de reparación (soporta múltiples tipos)
  const itemsByRepairType = (order.maintenance_order_items || []).reduce(
    (acc, item) => {
      const pivotRepairTypes = item.maintenance_order_item_repair_types ?? [];
      const repairTypeNames: string[] =
        pivotRepairTypes.length > 0
          ? pivotRepairTypes.map((rt) => rt.types_of_repairs?.name).filter((n): n is string => Boolean(n))
          : item.types_of_repairs?.name
            ? [item.types_of_repairs.name]
            : ['Sin tipo asignado'];

      repairTypeNames.forEach((typeName) => {
        if (!acc[typeName]) {
          acc[typeName] = [];
        }
        acc[typeName].push(item);
      });
      return acc;
    },
    {} as Record<string, typeof order.maintenance_order_items>
  );

  const blocked = isSubmitting || isDone;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col" noValidate>
        {/* ── Encabezado y resumen del equipo ─────────────────────────── */}
        <div className="space-y-3 px-6 pt-6 pb-4">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base">Planificar Pedido de Mantenimiento</DialogTitle>
            <DialogDescription className="text-xs">
              {order.order_number ? `Pedido #${order.order_number}` : 'Pedido de mantenimiento'}
            </DialogDescription>
          </DialogHeader>

          <ActionDialogResource row={order} condition={getResourceCondition(order)} />

          {/* ── Datos clave (fila horizontal) ───────────────────────────── */}
          {(kilometer || engineHours) && (
            <div className="flex flex-wrap gap-4 text-sm">
              {kilometer && (
                <div className="text-muted-foreground flex items-center gap-1.5">
                  <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="text-foreground font-medium">{Number(kilometer).toLocaleString('es-AR')} km</span>
                </div>
              )}
              {engineHours && (
                <div className="text-muted-foreground flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="text-foreground font-medium">{Number(engineHours).toLocaleString('es-AR')} hs</span>
                </div>
              )}
            </div>
          )}

          {/* ── Descripción del pedido ──────────────────────────────────── */}
          {description && (
            <div className="space-y-1">
              <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Descripción</h3>
              <p className="text-sm break-words whitespace-pre-wrap">{description}</p>
            </div>
          )}

          {/* ── Fecha (escritura directa o calendario) ──────────────────── */}
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fecha de recepción en taller *</FormLabel>
                <FormControl>
                  <EnhancedDatePicker date={field.value} setDate={field.onChange} minDate={minDate} />
                </FormControl>
                <FormDescription>
                  {selectedDate
                    ? `Se planifica para el ${formatLongDateAr(moment(selectedDate).format('YYYY-MM-DD'))}.`
                    : 'DD/MM/AAAA. Podés escribirla o elegirla en el calendario.'}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Separator />

        {/* ── Items a reparar ──────────────────────────────────────────── */}
        {isPreventive && (
          <div className="px-6 pt-3 pb-4">
            <PreventiveInfoCard preventiveType={order.maintenance_requests?.preventive_type ?? ''} />
          </div>
        )}

        {itemCount > 0 && (
          <>
            <div className="px-6 pt-3 pb-1">
              <h3 className="text-muted-foreground flex items-center gap-1.5 text-sm font-semibold tracking-wide uppercase">
                <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                Items a reparar
                <span className="text-xs font-normal normal-case">({itemCount})</span>
              </h3>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-3 px-6 pb-4">
                {Object.entries(itemsByRepairType).map(([repairType, items]) => (
                  <div key={repairType} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs font-medium">
                        {repairType}
                      </Badge>
                      <span className="text-muted-foreground text-xs">({items?.length || 0})</span>
                    </div>
                    <div className="space-y-1.5">
                      {items?.map((item, index) => {
                        const deviation = item.maintenance_request_items?.checklist_deviations;
                        // Ticket 592: en la carga manual no hay desvio de checklist —
                        // el titulo del item es lo que escribio el supervisor.
                        const itemLabel = getRepairItemLabel(item);
                        const itemImages = getRepairItemImages(item);
                        return (
                          <div key={item.id} className="space-y-1 rounded-lg border p-2.5">
                            <div className="flex min-w-0 items-start gap-2">
                              <span className="text-muted-foreground bg-muted mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-xs">
                                #{index + 1}
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm leading-snug font-medium">{itemLabel}</p>
                                <RepairGroupBadge groupName={getRepairItemGroupName(item)} className="mt-1" />
                                {deviation?.section_code && (
                                  <p className="text-muted-foreground mt-0.5 text-xs">
                                    {formatSectionCode(deviation.section_code)}
                                  </p>
                                )}
                              </div>
                            </div>
                            <ItemComments
                              item={item}
                              source={order.maintenance_requests?.source}
                              fallbackAuthorName={
                                order.maintenance_requests?.profile_maintenance_requests_supervisor_idToprofile
                                  ?.fullname
                              }
                            />

                            {/* Ticket 592: quien planifica necesita ver la foto para estimar la fecha */}
                            <RepairItemPhotos images={itemImages} label={itemLabel} size="sm" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        {itemCount === 0 && !isPreventive && (
          <div className="px-6 pb-4">
            <p className="text-muted-foreground py-6 text-center text-sm">No hay items registrados</p>
          </div>
        )}

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <Separator />
        <DialogFooter className="shrink-0 items-center px-6 py-4">
          {!isValid && !blocked && (
            <p id="schedule-hint" className="text-muted-foreground mr-auto text-xs">
              Elegí la fecha de recepción para habilitar la planificación.
            </p>
          )}
          <Button type="button" variant="outline" onClick={onClose} disabled={blocked}>
            Cancelar
          </Button>
          <Button type="submit" disabled={blocked || !isValid} aria-describedby={!isValid ? 'schedule-hint' : undefined}>
            {blocked ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <CalendarCheck className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Confirmar Planificación
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
