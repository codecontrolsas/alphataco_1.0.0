'use client';

import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { PreventiveInfoCard } from '@/features/Mantenimiento/components/PreventiveInfoCard';
import { MIN_APPROVAL_DESCRIPTION_LENGTH } from '@/features/Mantenimiento/constants/approval';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, X } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { getActionErrorMessage } from '../../../shared/components/ActionDialogParts';
import type { MaintenanceRequestData } from '../../actions/queries.server';
import { useApproveMaintenanceRequestItems, useRejectMaintenanceRequestItems } from '../../hooks/useMaintenanceRequests';
import { ApprovalDescriptionField } from './ApprovalDescriptionField';
import { RequestSummary } from './RequestSummary';
import { preventiveApprovalSchema, type PreventiveApprovalValues } from './approval-schema';

interface PreventiveApprovalFormProps {
  request: MaintenanceRequestData;
  onClose: () => void;
}

/** Validación de una solicitud preventiva: se aprueba completa (con descripción) o se rechaza (con motivo). */
export function PreventiveApprovalForm({ request, onClose }: PreventiveApprovalFormProps) {
  const approveMutation = useApproveMaintenanceRequestItems();
  const rejectMutation = useRejectMaintenanceRequestItems();
  const queryClient = useQueryClient();
  // Tras el éxito el botón sigue bloqueado mientras el diálogo termina de cerrarse.
  const [isDone, setIsDone] = useState(false);

  const form = useForm<PreventiveApprovalValues>({
    resolver: zodResolver(preventiveApprovalSchema),
    mode: 'onChange',
    defaultValues: { action: 'approve', comment: '', reason: '', description: '' },
  });
  const { isSubmitting, isValid } = form.formState;
  const action = useWatch({ control: form.control, name: 'action' });
  const description = useWatch({ control: form.control, name: 'description' });
  const isRejecting = action === 'reject';

  async function onSubmit(values: PreventiveApprovalValues) {
    try {
      if (values.action === 'approve') {
        await approveMutation.mutateAsync({
          requestId: request.id,
          approvedItems: [],
          rejectedItems: [],
          preventiveApproval: true,
          validatorComment: values.comment.trim() || undefined,
          description: values.description.trim(),
        });
        toast.success('Solicitud preventiva aprobada');
      } else {
        await rejectMutation.mutateAsync({
          requestId: request.id,
          itemIds: [],
          reason: values.reason.trim(),
        });
        toast.success('Solicitud preventiva rechazada');
      }
      setIsDone(true);
      queryClient.invalidateQueries({ queryKey: ['datatable-facet'] });
      onClose();
    } catch (error) {
      toast.error('Error al procesar la solicitud', { description: getActionErrorMessage(error) ?? undefined });
    }
  }

  const blocked = isSubmitting || isDone;
  const blockReason = isValid
    ? null
    : isRejecting
      ? 'Escribí el motivo del rechazo para habilitar el botón.'
      : `Escribí la descripción para el taller (mínimo ${MIN_APPROVAL_DESCRIPTION_LENGTH} caracteres, van ${description.trim().length}).`;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col" noValidate>
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle>Validar Solicitud de Mantenimiento</DialogTitle>
          <DialogDescription>
            Esta solicitud es un mantenimiento preventivo: se aprueba o se rechaza completa.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-2">
          <RequestSummary request={request} />
          <PreventiveInfoCard preventiveType={request.preventive_type ?? ''} />

          <FormField
            control={form.control}
            name="comment"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Comentario del validador (opcional)</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder="Agregar un comentario..." rows={2} disabled={blocked} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {isRejecting ? (
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo del rechazo *</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Ingrese el motivo del rechazo..." rows={3} disabled={blocked} autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : (
            <ApprovalDescriptionField disabled={blocked} />
          )}
        </div>

        <DialogFooter className="items-center border-t px-6 py-4">
          {blockReason && !blocked && (
            <p id="preventive-block-reason" className="text-muted-foreground mr-auto text-xs">
              {blockReason}
            </p>
          )}
          <Button type="button" variant="outline" onClick={onClose} disabled={blocked}>
            Cancelar
          </Button>
          {isRejecting ? (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => form.setValue('action', 'approve', { shouldValidate: true })}
                disabled={blocked}
              >
                Volver
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={blocked || !isValid}
                aria-describedby={blockReason ? 'preventive-block-reason' : undefined}
              >
                {blocked && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                Rechazar Solicitud
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="destructive"
                onClick={() => form.setValue('action', 'reject', { shouldValidate: true })}
                disabled={blocked}
              >
                <X className="mr-2 h-4 w-4" aria-hidden="true" />
                Rechazar
              </Button>
              <Button
                type="submit"
                disabled={blocked || !isValid}
                aria-describedby={blockReason ? 'preventive-block-reason' : undefined}
              >
                {blocked ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                Aprobar Solicitud
              </Button>
            </>
          )}
        </DialogFooter>
      </form>
    </Form>
  );
}
