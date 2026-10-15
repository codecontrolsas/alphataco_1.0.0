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
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ItemComments } from '@/features/Mantenimiento/components/ItemComments';
import { PreventiveInfoCard } from '@/features/Mantenimiento/components/PreventiveInfoCard';
import { RepairGroupBadge } from '@/features/Mantenimiento/shared/components/RepairGroupBadge';
import { RepairItemPhotos } from '@/features/Mantenimiento/shared/components/RepairItemPhotos';
import { formatDateLong } from '@/features/Mantenimiento/utils/dateFormat';
import { getInitialKilometer } from '@/features/Mantenimiento/utils/kilometerPreload';
import { invalidateAllMaintenanceQueries } from '@/features/Mantenimiento/utils/queryInvalidation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  ActionDialogResource,
  ImpactNotice,
  getActionErrorMessage,
} from '../../shared/components/ActionDialogParts';
import {
  getResourceCondition,
  getResourceInternNumber,
  getResourceKind,
  getResourceKindLabel,
  getResourceLabel,
} from '../../shared/maintenance-resource';
import { getRepairItemGroupName, getRepairItemImages, getRepairItemLabel } from '../../shared/repair-item-label';
import { approveWorkshopEntryFromOrder, type MaintenanceOrderData } from '../actions/actionsServer';

interface EntradaTallerDialogProps {
  order: MaintenanceOrderData;
  open: boolean;
  onClose: () => void;
}

/** Schema del formulario. Los mínimos salen de los valores registrados: la lectura de un contador no retrocede. */
function buildEntrySchema({
  requiresKilometer,
  minKilometer,
  minEngineHours,
}: {
  requiresKilometer: boolean;
  minKilometer: number;
  minEngineHours: number;
}) {
  return z.object({
    kilometer: z
      .string()
      .trim()
      .superRefine((value, ctx) => {
        if (!value) {
          if (requiresKilometer) ctx.addIssue({ code: 'custom', message: 'Debe ingresar el kilometraje actual' });
          return;
        }
        const num = parseInt(value, 10);
        if (Number.isNaN(num) || num < 0) {
          ctx.addIssue({ code: 'custom', message: 'Ingrese un valor numérico válido' });
        } else if (minKilometer > 0 && num < minKilometer) {
          ctx.addIssue({
            code: 'custom',
            message: `El kilometraje no puede ser menor a ${minKilometer.toLocaleString()} km (valor registrado)`,
          });
        }
      }),
    engineHours: z
      .string()
      .trim()
      .superRefine((value, ctx) => {
        if (!value) return;
        const num = parseInt(value, 10);
        if (Number.isNaN(num) || num < 0) {
          ctx.addIssue({ code: 'custom', message: 'Ingrese un valor numérico válido' });
        } else if (minEngineHours > 0 && num < minEngineHours) {
          ctx.addIssue({ code: 'custom', message: `No puede ser menor a ${minEngineHours.toLocaleString()} hs` });
        }
      }),
  });
}

type EntryValues = z.infer<ReturnType<typeof buildEntrySchema>>;

export function EntradaTallerDialog({ order, open, onClose }: EntradaTallerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {/* Alto acotado + scroll solo en el cuerpo: con muchos items el titulo quedaba
          cortado arriba y "Confirmar Entrada" abajo (reportado en la demo). El formulario vive dentro
          de DialogContent: al cerrar se desmonta y no arrastra valores al siguiente pedido. */}
      <DialogContent className="flex max-h-[90vh] max-w-lg flex-col">
        <EntryForm order={order} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

function EntryForm({ order, onClose }: { order: MaintenanceOrderData; onClose: () => void }) {
  // Ticket 596: un equipamiento no lleva kilometraje — se mide por horómetro.
  const isOtherEquipment = getResourceKind(order) === 'other_equipment';
  const resourceLabel = getResourceLabel(order);
  const resourceKindLabel = getResourceKindLabel(order);
  const resourceInternNumber = getResourceInternNumber(order);
  const resourceCondition = getResourceCondition(order);

  // Kilometraje inicial y su origen (checklist o vehículo)
  const initialKm = useMemo(
    () => getInitialKilometer(order.vehicles?.kilometer, order.maintenance_order_items),
    [order]
  );
  const minKilometer = useMemo(() => {
    const parsed = parseInt(initialKm.value, 10);
    return !Number.isNaN(parsed) ? parsed : 0;
  }, [initialKm.value]);

  // Horómetro: precargado del vehículo (opcional)
  const initialEngineHours = useMemo(() => {
    const hours = order.other_equipment?.horometer ?? order.vehicles?.engine_hours;
    return hours ? String(hours) : '';
  }, [order]);
  const minEngineHours = useMemo(() => {
    const parsed = parseInt(initialEngineHours, 10);
    return !Number.isNaN(parsed) ? parsed : 0;
  }, [initialEngineHours]);

  const schema = useMemo(
    () => buildEntrySchema({ requiresKilometer: !isOtherEquipment, minKilometer, minEngineHours }),
    [isOtherEquipment, minKilometer, minEngineHours]
  );
  const form = useForm<EntryValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { kilometer: initialKm.value, engineHours: initialEngineHours },
  });
  const { isSubmitting, isValid } = form.formState;
  const kilometer = form.watch('kilometer');
  const engineHours = form.watch('engineHours');

  const queryClient = useQueryClient();
  // Tras el éxito el botón sigue bloqueado mientras el diálogo termina de cerrarse.
  const [isDone, setIsDone] = useState(false);

  const approveMutation = useMutation({
    mutationFn: approveWorkshopEntryFromOrder,
    onSuccess: () => {
      invalidateAllMaintenanceQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['datatable-facet'] });
    },
  });

  async function onSubmit(values: EntryValues) {
    try {
      await approveMutation.mutateAsync({
        orderId: order.id,
        ...(values.kilometer ? { kilometer: values.kilometer } : {}),
        ...(values.engineHours ? { engine_hours: values.engineHours } : {}),
      });
      setIsDone(true);
      toast.success(
        `Entrada a taller aprobada. El ${isOtherEquipment ? 'equipamiento' : 'equipo'} ahora está "No Operativo"`
      );
      onClose();
    } catch (error) {
      // El servidor rechaza lecturas que retroceden: si devuelve el motivo, se muestra tal cual.
      const message = getActionErrorMessage(error);
      toast.error('Error al aprobar la entrada a taller', { description: message ?? undefined });
      if (message) form.setError('root', { message });
    }
  }

  const items = order.maintenance_order_items || [];
  const isPreventive = order.maintenance_requests?.source === 'preventive';
  const blocked = isSubmitting || isDone;
  const rootError = form.formState.errors.root?.message;
  const description = order.description ?? order.maintenance_requests?.description;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col gap-4" noValidate>
        <DialogHeader className="shrink-0">
          <DialogTitle>Aprobar Entrada a Taller</DialogTitle>
          <DialogDescription>
            Confirme la entrada del {resourceKindLabel.toLowerCase()}{' '}
            <span className="font-medium">{resourceLabel}</span>
            {resourceInternNumber && <span className="text-muted-foreground"> (#{resourceInternNumber})</span>} al
            taller.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-1 pr-1">
          <ActionDialogResource
            row={order}
            condition={resourceCondition}
            aside={
              order.scheduled_date ? (
                <span className="text-muted-foreground text-xs">
                  Fecha programada: <span className="text-foreground font-medium">{formatDateLong(order.scheduled_date)}</span>
                </span>
              ) : null
            }
          />

          {/* Información actual */}
          <div className="bg-muted space-y-2 rounded-lg p-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Condición actual:</span>
              <Badge variant={resourceCondition === 'operativo' ? 'success' : 'destructive'}>
                {resourceCondition || 'Desconocido'}
              </Badge>
            </div>
            {!isOtherEquipment && (
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">Km actual:</span>
                <span className="font-medium">{order.vehicles?.kilometer || '-'} km</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Horómetro actual:</span>
              <span className="font-medium">
                {String((isOtherEquipment ? order.other_equipment?.horometer : order.vehicles?.engine_hours) ?? '-')} hs
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Items a reparar:</span>
              <span className="block font-medium">
                {isPreventive && items.length === 0 ? 'Preventivo' : items.length}
              </span>
            </div>
            {description && (
              <div className="border-t pt-1">
                <span className="text-muted-foreground text-sm">Descripción:</span>
                <p className="font-medium break-words whitespace-pre-wrap">{description}</p>
              </div>
            )}
          </div>

          {/* Preventive info */}
          {isPreventive && (
            <PreventiveInfoCard preventiveType={order.maintenance_requests?.preventive_type ?? ''} className="mb-2" />
          )}

          {/* Lista de items */}
          {items.length > 0 && (
            <div className="space-y-2">
              <Label>Items a Reparar</Label>
              {/* Se amplia respecto de los 150px originales: los items ahora traen miniaturas (ticket 592) */}
              <div className="max-h-[240px] overflow-y-auto">
                <div className="space-y-2 pr-2">
                  {items.map((item, index) => {
                    const deviation = item.maintenance_request_items?.checklist_deviations;
                    const formattedCode = deviation?.item_code?.replace(/_/g, ' ') || '';

                    // Extraer tipos de reparación de la tabla pivot (prioridad) o del campo legacy
                    const pivotRepairTypes = item.maintenance_order_item_repair_types ?? [];
                    const repairTypeNames: string[] =
                      pivotRepairTypes.length > 0
                        ? pivotRepairTypes.map((rt) => rt.types_of_repairs?.name).filter((n): n is string => Boolean(n))
                        : item.types_of_repairs?.name
                          ? [item.types_of_repairs.name]
                          : [];

                    // Ticket 592: los items de carga manual no tienen desvio de checklist —
                    // su titulo es el texto libre o la tarea elegida del listado.
                    const itemLabel = getRepairItemLabel(item, 'Sin etiqueta');
                    const itemImages = getRepairItemImages(item);

                    return (
                      <div key={item.id || index} className="bg-muted rounded p-2 text-sm">
                        <div className="font-medium">{itemLabel}</div>
                        <RepairGroupBadge groupName={getRepairItemGroupName(item)} className="mt-1" />
                        <div className="text-muted-foreground text-xs">
                          {formattedCode && <>Código: {formattedCode}</>}
                          {repairTypeNames.length > 0 && (
                            <span className="ml-2">
                              | Tipo{repairTypeNames.length > 1 ? 's' : ''}:{' '}
                              <span className="font-medium">{repairTypeNames.join(', ')}</span>
                            </span>
                          )}
                        </div>
                        <ItemComments
                          item={item}
                          source={order.maintenance_requests?.source}
                          fallbackAuthorName={
                            order.maintenance_requests?.profile_maintenance_requests_supervisor_idToprofile?.fullname
                          }
                        />

                        {/* Ticket 592: el taller ve la foto antes de aceptar el ingreso */}
                        <RepairItemPhotos images={itemImages} label={itemLabel} size="sm" className="mt-1.5" />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Kilometraje — un equipamiento no lleva km (ticket 596) */}
            {!isOtherEquipment && (
              <FormField
                control={form.control}
                name="kilometer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kilometraje actual del equipo *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="Ej: 150000"
                        disabled={blocked}
                      />
                    </FormControl>
                    <FormDescription>
                      {initialKm.source === 'checklist'
                        ? `Valor precargado desde el checklist (${minKilometer.toLocaleString()} km). El nuevo valor no puede ser menor.`
                        : initialKm.source === 'vehicle'
                          ? `Valor precargado desde el vehículo (${minKilometer.toLocaleString()} km). El nuevo valor no puede ser menor.`
                          : 'Ingrese el kilometraje actual al momento de la entrada al taller'}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Horómetro (opcional) */}
            <FormField
              control={form.control}
              name="engineHours"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Horómetro actual del equipo</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="Ej: 5000"
                      disabled={blocked}
                    />
                  </FormControl>
                  <FormDescription>
                    {minEngineHours > 0
                      ? `Valor precargado desde el ${isOtherEquipment ? 'equipamiento' : 'vehículo'} (${minEngineHours.toLocaleString()} hs). El nuevo valor no puede ser menor.`
                      : 'Opcional. Ingrese las horas de motor actuales.'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Impacto: lo que cambia en el equipo al confirmar */}
          <ImpactNotice title="Esta acción actualizará el equipo:">
            <ul className="mt-1 list-inside list-disc">
              <li>
                La condición cambiará a{' '}
                <Badge variant="destructive" className="ml-1">
                  No Operativo
                </Badge>
              </li>
              {!isOtherEquipment && (
                <li>
                  El kilometraje se actualizará al valor ingresado
                  {kilometer.trim() && order.vehicles?.kilometer ? (
                    <span className="font-mono">
                      {' '}
                      ({order.vehicles.kilometer} → {kilometer.trim()})
                    </span>
                  ) : null}
                </li>
              )}
              {engineHours.trim() && <li>El horómetro se actualizará al valor ingresado</li>}
            </ul>
          </ImpactNotice>

          {rootError && (
            <p role="alert" className="text-destructive text-sm">
              {rootError}
            </p>
          )}
        </div>

        <DialogFooter className="shrink-0 items-center">
          {!isValid && !blocked && (
            <p id="entry-hint" className="text-muted-foreground mr-auto text-xs">
              Corregí los datos marcados para habilitar la confirmación.
            </p>
          )}
          <Button type="button" variant="outline" onClick={onClose} disabled={blocked}>
            Cancelar
          </Button>
          <Button type="submit" disabled={blocked || !isValid} aria-describedby={!isValid ? 'entry-hint' : undefined}>
            {blocked && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Confirmar Entrada
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
