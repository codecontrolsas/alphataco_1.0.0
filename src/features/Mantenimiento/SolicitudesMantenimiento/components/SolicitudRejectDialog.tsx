'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { PreventiveInfoCard } from '@/features/Mantenimiento/components/PreventiveInfoCard';
import { isNonPropagatingChecklistItem } from '@/features/Mantenimiento/constants/non-propagating-checklist-items';
import { ActionDialogResource, getActionErrorMessage } from '@/features/Mantenimiento/shared/components/ActionDialogParts';
import { cn } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, Info, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { getResourceCondition } from '../../shared/maintenance-resource';
import { getRepairItemLabel } from '../../shared/repair-item-label';
import { getResourceLabel } from '../../shared/maintenance-resource';
import type { MaintenanceRequestData } from '../actions/queries.server';
import { useRejectMaintenanceRequestItems } from '../hooks/useMaintenanceRequests';

interface SolicitudRejectDialogProps {
  request: MaintenanceRequestData;
  open: boolean;
  onClose: () => void;
}

/** Una preventiva se rechaza completa (sin ítems); el resto exige al menos un ítem. */
function buildRejectSchema(isPreventive: boolean) {
  return z
    .object({
      itemIds: z.array(z.string()),
      reason: z.string().trim().min(1, 'Debe indicar un motivo de rechazo'),
    })
    .refine((values) => isPreventive || values.itemIds.length > 0, {
      path: ['itemIds'],
      message: 'Seleccione al menos un item para rechazar',
    });
}

type RejectValues = z.infer<ReturnType<typeof buildRejectSchema>>;

/**
 * Rechazo de ítems de una solicitud (o de la preventiva completa).
 * Permiso: `maintenance_requests:update` (lo exige el servidor y la tabla oculta la acción sin él).
 */
export function SolicitudRejectDialog({ request, open, onClose }: SolicitudRejectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {/* El formulario vive dentro de DialogContent: al cerrar se desmonta y no arrastra motivo ni selección. */}
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <RejectForm request={request} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

function RejectForm({ request, onClose }: { request: MaintenanceRequestData; onClose: () => void }) {
  const rejectMutation = useRejectMaintenanceRequestItems();
  const queryClient = useQueryClient();
  const isPreventive = request.source === 'preventive';
  // Tras el éxito el botón sigue bloqueado mientras el diálogo termina de cerrarse.
  const [isDone, setIsDone] = useState(false);

  // Items pendientes de la solicitud, divididos en decidibles (rechazables) e informativos.
  const { pendingItems, informationalItems } = useMemo(() => {
    const pending = request.maintenance_request_items?.filter((item) => item.status === 'pending') ?? [];
    const decidable: typeof pending = [];
    const info: typeof pending = [];
    for (const item of pending) {
      const templateId =
        (item.checklist_deviations as { checklist_answers?: { template_id?: string | null } | null } | null)
          ?.checklist_answers?.template_id ?? null;
      const itemCode = item.checklist_deviations?.item_code ?? null;
      if (isNonPropagatingChecklistItem(templateId, itemCode)) {
        info.push(item);
      } else {
        decidable.push(item);
      }
    }
    return { pendingItems: decidable, informationalItems: info };
  }, [request.maintenance_request_items]);

  const schema = useMemo(() => buildRejectSchema(isPreventive), [isPreventive]);
  const form = useForm<RejectValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { itemIds: [], reason: '' },
  });
  const { isSubmitting, isValid } = form.formState;
  const selectedItemIds = form.watch('itemIds');

  const allSelected = selectedItemIds.length === pendingItems.length && pendingItems.length > 0;
  const someSelected = selectedItemIds.length > 0;

  function toggleItem(itemId: string, checked: boolean) {
    const next = checked ? [...selectedItemIds, itemId] : selectedItemIds.filter((id) => id !== itemId);
    form.setValue('itemIds', next, { shouldValidate: true, shouldDirty: true });
  }

  function toggleAll() {
    form.setValue('itemIds', allSelected ? [] : pendingItems.map((item) => item.id), {
      shouldValidate: true,
      shouldDirty: true,
    });
  }

  async function onSubmit(values: RejectValues) {
    try {
      await rejectMutation.mutateAsync({
        requestId: request.id,
        itemIds: isPreventive ? [] : values.itemIds,
        reason: values.reason,
      });
      queryClient.invalidateQueries({ queryKey: ['datatable-facet'] });
      setIsDone(true);
      toast.success(isPreventive ? 'Solicitud preventiva rechazada' : 'Items rechazados exitosamente');
      onClose();
    } catch (error) {
      toast.error('Error al rechazar', { description: getActionErrorMessage(error) ?? undefined });
    }
  }

  const blocked = isSubmitting || isDone;
  const rejectButtonLabel = isPreventive
    ? 'Rechazar Solicitud'
    : `Rechazar ${selectedItemIds.length > 0 ? `(${selectedItemIds.length})` : ''}`;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <DialogHeader>
          <DialogTitle>Rechazar Items de Solicitud</DialogTitle>
          <DialogDescription>
            Selecciona los items que deseas rechazar para el equipo{' '}
            <span className="font-medium">
              {getResourceLabel(request)}
            </span>
            . Puedes rechazar items individuales o todos a la vez.
          </DialogDescription>
        </DialogHeader>

        <ActionDialogResource row={request} condition={getResourceCondition(request)} />

        {request.description && (
          <div className="bg-muted rounded-lg p-3">
            <span className="text-muted-foreground text-sm">Descripción: </span>
            <p className="font-medium break-words whitespace-pre-wrap">{request.description}</p>
          </div>
        )}

        {isPreventive ? (
          <PreventiveInfoCard preventiveType={request.preventive_type ?? ''} />
        ) : (
          <FormField
            control={form.control}
            name="itemIds"
            render={() => (
              <FormItem className="space-y-3">
                {/* Selector de todos */}
                <div className="bg-muted/50 flex items-center justify-between rounded-lg p-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="select-all"
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      onCheckedChange={toggleAll}
                      disabled={blocked || pendingItems.length === 0}
                    />
                    <FormLabel htmlFor="select-all" className="cursor-pointer text-sm font-medium">
                      {allSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
                    </FormLabel>
                  </div>
                  <Badge variant="outline" aria-live="polite">
                    {selectedItemIds.length} de {pendingItems.length} seleccionado(s)
                  </Badge>
                </div>

                {/* Lista de items */}
                <div className="max-h-64 space-y-2 overflow-y-auto" role="group" aria-label="Items pendientes">
                  {pendingItems.map((item) => {
                    const isSelected = selectedItemIds.includes(item.id);
                    const deviation = item.checklist_deviations;
                    const isCritical = deviation?.is_critical;
                    const comment = deviation?.driver_comment || item.driver_comment;
                    return (
                      <label
                        key={item.id}
                        htmlFor={`reject-item-${item.id}`}
                        className={cn(
                          'focus-within:ring-ring flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors focus-within:ring-2',
                          isSelected ? 'border-destructive bg-destructive/5' : 'hover:bg-muted/50'
                        )}
                      >
                        <Checkbox
                          id={`reject-item-${item.id}`}
                          checked={isSelected}
                          onCheckedChange={(checked) => toggleItem(item.id, checked === true)}
                          disabled={blocked}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {isCritical ? (
                              <AlertCircle className="text-destructive h-4 w-4 shrink-0" aria-hidden="true" />
                            ) : (
                              <AlertTriangle className="text-warn h-4 w-4 shrink-0" aria-hidden="true" />
                            )}
                            <span className="text-sm font-medium">
                              {getRepairItemLabel(item, 'Item sin descripción')}
                            </span>
                            {isCritical && (
                              <Badge variant="destructive" className="text-xs">
                                CRÍTICO
                              </Badge>
                            )}
                          </div>
                          {deviation?.section_code && (
                            <p className="text-muted-foreground mt-1 text-xs capitalize">
                              Sección: {deviation.section_code.replace('_', ' ')}
                            </p>
                          )}
                          {comment && <p className="text-muted-foreground mt-1 text-xs italic">Comentario: {comment}</p>}
                        </div>
                      </label>
                    );
                  })}

                  {pendingItems.length === 0 && (
                    <div className="text-muted-foreground py-8 text-center">No hay items pendientes para rechazar</div>
                  )}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Items informativos (no rechazables, sólo lectura) */}
        {!isPreventive && informationalItems.length > 0 && (
          <div className="space-y-2">
            <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wider uppercase">
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
              Solo informativos ({informationalItems.length}) — no se pueden rechazar
            </div>
            <div className="space-y-2">
              {informationalItems.map((item) => {
                const deviation = item.checklist_deviations;
                const isCritical = deviation?.is_critical ?? false;
                return (
                  <div key={item.id} className="border-muted-foreground/30 bg-muted/30 rounded-lg border border-dashed p-3">
                    <div className="flex items-start gap-2">
                      {isCritical ? (
                        <AlertCircle className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      ) : (
                        <AlertTriangle className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-muted-foreground text-sm font-medium">
                          {getRepairItemLabel(item, 'Item sin descripción')}
                          {isCritical && <span className="ml-2 text-xs font-semibold">(crítico)</span>}
                        </p>
                        {deviation?.section_code && (
                          <p className="text-muted-foreground mt-0.5 text-xs capitalize">
                            Sección: {deviation.section_code.replace('_', ' ')}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Motivo de rechazo */}
        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Motivo del rechazo *</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="Indique el motivo por el cual rechaza estos items..."
                  rows={3}
                  disabled={blocked}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter className="items-center gap-2 sm:gap-0">
          {!isValid && !blocked && (
            <p id="reject-request-hint" className="text-muted-foreground mr-auto text-xs">
              {isPreventive || someSelected
                ? 'Escribí el motivo para habilitar el rechazo.'
                : 'Elegí al menos un item y escribí el motivo para habilitar el rechazo.'}
            </p>
          )}
          <Button type="button" variant="outline" onClick={onClose} disabled={blocked}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="destructive"
            disabled={blocked || !isValid}
            aria-describedby={!isValid ? 'reject-request-hint' : undefined}
          >
            {blocked && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {rejectButtonLabel}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
