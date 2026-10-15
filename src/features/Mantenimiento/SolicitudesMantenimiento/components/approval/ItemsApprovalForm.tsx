'use client';

import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { MIN_APPROVAL_DESCRIPTION_LENGTH } from '@/features/Mantenimiento/constants/approval';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Info, Loader2, Wrench } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { getActionErrorMessage } from '../../../shared/components/ActionDialogParts';
import type { MaintenanceRequestData } from '../../actions/queries.server';
import { useApproveMaintenanceRequestItems } from '../../hooks/useMaintenanceRequests';
import { ApprovalDescriptionField } from './ApprovalDescriptionField';
import { ApprovalItemCard } from './ApprovalItemCard';
import { InformationalItemCard } from './InformationalItemCard';
import { RequestSummary } from './RequestSummary';
import {
  buildDeviationItems,
  itemsApprovalSchema,
  type DeviationItem,
  type ItemsApprovalValues,
} from './approval-schema';

interface ItemsApprovalFormProps {
  request: MaintenanceRequestData;
  onClose: () => void;
}

/** Sección de ítems de un mismo tipo (críticos / no críticos) con su encabezado. */
function ItemGroup({
  title,
  description,
  icon,
  items,
  indexOf,
  disabled,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  items: DeviationItem[];
  indexOf: (item: DeviationItem) => number;
  disabled: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label={title} className="space-y-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
          {icon}
          {title} · {items.length}
        </h3>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      {items.map((item) => (
        <ApprovalItemCard key={item.itemId} item={item} index={indexOf(item)} disabled={disabled} />
      ))}
    </section>
  );
}

/** Validación de una solicitud de checklist/manual: cada ítem se aprueba o se rechaza con motivo. */
export function ItemsApprovalForm({ request, onClose }: ItemsApprovalFormProps) {
  const approveMutation = useApproveMaintenanceRequestItems();
  const queryClient = useQueryClient();
  // Tras el éxito el botón sigue bloqueado mientras el diálogo termina de cerrarse.
  const [isDone, setIsDone] = useState(false);

  const pendingItems = useMemo(() => buildDeviationItems(request), [request]);
  // Solo se crean decisiones para items "decidibles": los no-propagables son lectura.
  const decidableItems = useMemo(() => pendingItems.filter((item) => !item.is_non_propagating), [pendingItems]);
  const informationalItems = useMemo(() => pendingItems.filter((item) => item.is_non_propagating), [pendingItems]);
  const criticalItems = decidableItems.filter((item) => item.is_critical);
  const nonCriticalItems = decidableItems.filter((item) => !item.is_critical);
  const indexOf = (item: DeviationItem) => decidableItems.findIndex((candidate) => candidate.itemId === item.itemId);

  const form = useForm<ItemsApprovalValues>({
    resolver: zodResolver(itemsApprovalSchema),
    mode: 'onChange',
    defaultValues: {
      items: decidableItems.map((item) => ({
        itemId: item.itemId,
        status: 'pending' as const,
        rejectionReason: '',
        validatorComment: '',
      })),
      description: '',
    },
  });
  const { isSubmitting, isValid } = form.formState;

  const watchedItems = useWatch({ control: form.control, name: 'items' });
  const description = useWatch({ control: form.control, name: 'description' });
  const approvedCount = watchedItems.filter((d) => d.status === 'approved').length;
  const rejectedCount = watchedItems.filter((d) => d.status === 'rejected').length;
  const pendingCount = watchedItems.filter((d) => d.status === 'pending').length;
  const rejectedWithoutReason = watchedItems.filter((d) => d.status === 'rejected' && !d.rejectionReason.trim()).length;

  // Por qué el botón está bloqueado (se enlaza con aria-describedby).
  const blockReason =
    pendingCount > 0
      ? `Faltan ${pendingCount} item(s) por aprobar o rechazar.`
      : rejectedWithoutReason > 0
        ? 'Completá el motivo de cada item rechazado.'
        : approvedCount > 0 && description.trim().length < MIN_APPROVAL_DESCRIPTION_LENGTH
          ? `Escribí la descripción para el taller (mínimo ${MIN_APPROVAL_DESCRIPTION_LENGTH} caracteres).`
          : null;

  async function onSubmit(values: ItemsApprovalValues) {
    const approvedItems = values.items
      .filter((d) => d.status === 'approved')
      .map((d) => ({ itemId: d.itemId, validatorComment: d.validatorComment.trim() || undefined }));

    // Items "no propagables" se incluyen como aprobados automáticamente.
    // Quedan registrados en la solicitud, pero el server action los filtra al
    // crear `maintenance_order_items` por la matriz, así no llegan al taller.
    const nonPropagatingItems = informationalItems.map((item) => ({
      itemId: item.itemId,
      validatorComment: undefined as string | undefined,
    }));

    const rejectedItems = values.items
      .filter((d) => d.status === 'rejected')
      .map((d) => ({
        itemId: d.itemId,
        reason: d.rejectionReason,
        validatorComment: d.validatorComment.trim() || undefined,
      }));

    try {
      await approveMutation.mutateAsync({
        requestId: request.id,
        approvedItems: [...approvedItems, ...nonPropagatingItems],
        rejectedItems,
        description: approvedItems.length > 0 ? values.description.trim() : undefined,
      });

      setIsDone(true);
      queryClient.invalidateQueries({ queryKey: ['datatable-facet'] });
      const descriptionParts = [
        `${approvedItems.length} aprobado(s)`,
        `${rejectedItems.length} rechazado(s)`,
        ...(nonPropagatingItems.length > 0 ? [`${nonPropagatingItems.length} solo informativo(s)`] : []),
      ];
      toast.success('Solicitud procesada', { description: descriptionParts.join(', ') });
      onClose();
    } catch (error) {
      toast.error('Error al procesar la solicitud', { description: getActionErrorMessage(error) ?? undefined });
    }
  }

  const blocked = isSubmitting || isDone;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col" noValidate>
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle>Validar Solicitud de Mantenimiento</DialogTitle>
          <DialogDescription>
            Revisa cada item y aprueba o rechaza con un motivo. Los tipos de reparación se asignarán en la etapa de
            Planificación.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-2">
          <RequestSummary request={request} />

          <ItemGroup
            title="Estos items requieren atención inmediata"
            description="Items críticos: requieren atención inmediata."
            icon={<AlertCircle className="text-destructive h-4 w-4" aria-hidden="true" />}
            items={criticalItems}
            indexOf={indexOf}
            disabled={blocked}
          />
          <ItemGroup
            title="Otros items"
            description="Items que requieren mantenimiento pero no son críticos."
            icon={<Wrench className="text-muted-foreground h-4 w-4" aria-hidden="true" />}
            items={nonCriticalItems}
            indexOf={indexOf}
            disabled={blocked}
          />

          {decidableItems.length === 0 && informationalItems.length === 0 && (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Esta solicitud no tiene items pendientes de decisión.
            </p>
          )}

          {/* Items Solo Informativos — NO requieren decisión, NO viajan a taller */}
          {informationalItems.length > 0 && (
            <section aria-label="Solo informativos" className="space-y-3">
              <div>
                <h3 className="text-muted-foreground flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
                  <Info className="h-4 w-4" aria-hidden="true" />
                  Solo informativos · {informationalItems.length}
                </h3>
                <p className="text-muted-foreground text-xs">
                  Estos items quedan registrados en la solicitud pero no requieren decisión y no viajan a taller.
                </p>
              </div>
              {informationalItems.map((item) => (
                <InformationalItemCard key={item.itemId} item={item} />
              ))}
            </section>
          )}

          {/* Solo se pide descripción si algo queda aprobado: si se rechaza
              todo, no se genera pedido y el taller no ve nada. */}
          {approvedCount > 0 && <ApprovalDescriptionField disabled={blocked} />}
        </div>

        <DialogFooter className="items-center border-t px-6 py-4 sm:justify-between">
          <div className="flex flex-col gap-1 text-sm">
            <p aria-live="polite" className="font-medium">
              <span className="tabular-nums">{approvedCount}</span> aprobados ·{' '}
              <span className="tabular-nums">{rejectedCount}</span> rechazados
              {pendingCount > 0 && (
                <>
                  {' '}
                  · <span className="tabular-nums">{pendingCount}</span> pendientes
                </>
              )}
              {informationalItems.length > 0 && (
                <span className="text-muted-foreground font-normal">
                  {' '}
                  · {informationalItems.length} solo informativo(s)
                </span>
              )}
            </p>
            {blockReason && !blocked && (
              <p id="approval-block-reason" className="text-muted-foreground text-xs">
                {blockReason}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={blocked}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={blocked || !isValid}
              aria-describedby={blockReason ? 'approval-block-reason' : undefined}
            >
              {blocked && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Procesar Solicitud
            </Button>
          </div>
        </DialogFooter>
      </form>
    </Form>
  );
}
