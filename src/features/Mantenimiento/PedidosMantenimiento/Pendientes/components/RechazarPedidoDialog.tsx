'use client';

import { Button } from '@/components/ui/button';
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
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ActionDialogResource, getActionErrorMessage } from '../../../shared/components/ActionDialogParts';
import { getResourceCondition, getResourceKindLabel, getResourceLabel } from '../../../shared/maintenance-resource';
import { useRejectPendingOrder } from '../../hooks/useMaintenanceOrders';
import type { PendingOrderListItem } from '../actions.server';

interface RechazarPedidoDialogProps {
  order: PendingOrderListItem;
  open: boolean;
  onClose: () => void;
}

const rejectOrderSchema = z.object({
  reason: z.string().trim().min(1, 'Debe indicar un motivo de rechazo'),
});

type RejectOrderValues = z.infer<typeof rejectOrderSchema>;

/**
 * Rechazo de un pedido desde el paso "Por Programar" del taller (ticket 676).
 *
 * El motivo es obligatorio: es lo unico que queda registrado para explicar por
 * que el pedido no se ejecuto (el caso tipico es la solicitud duplicada).
 *
 * Permiso: `pedidos_pendientes:update` (lo exige el servidor y la tabla oculta el botón sin él).
 */
export function RechazarPedidoDialog({ order, open, onClose }: RechazarPedidoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {/* El formulario vive dentro de DialogContent: al cerrarse se desmonta y el motivo no se arrastra
          al siguiente pedido que reutilice el diálogo. */}
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <RejectOrderForm order={order} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

function RejectOrderForm({ order, onClose }: { order: PendingOrderListItem; onClose: () => void }) {
  const rejectMutation = useRejectPendingOrder();
  const queryClient = useQueryClient();
  // Tras el éxito el botón sigue bloqueado mientras el diálogo termina de cerrarse.
  const [isDone, setIsDone] = useState(false);

  const form = useForm<RejectOrderValues>({
    resolver: zodResolver(rejectOrderSchema),
    mode: 'onChange',
    defaultValues: { reason: '' },
  });
  const { isSubmitting, isValid } = form.formState;

  async function onSubmit(values: RejectOrderValues) {
    try {
      await rejectMutation.mutateAsync({ orderId: order.id, reason: values.reason });
      setIsDone(true);
      queryClient.invalidateQueries({ queryKey: ['datatable-facet'] });
      toast.success('Pedido rechazado. Queda registrado en el historial de mantenimiento del equipo.');
      onClose();
    } catch (error) {
      toast.error('Error al rechazar el pedido', { description: getActionErrorMessage(error) ?? undefined });
    }
  }

  const blocked = isSubmitting || isDone;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <DialogHeader>
          <DialogTitle>Rechazar Pedido</DialogTitle>
          <DialogDescription>
            Esta acción rechazará el pedido {order.order_number ? `#${order.order_number} ` : ''}del{' '}
            {getResourceKindLabel(order).toLowerCase()} <span className="font-medium">{getResourceLabel(order)}</span>.
            El pedido sale de esta lista y queda registrado en el historial de mantenimiento del equipo con el motivo
            indicado.
          </DialogDescription>
        </DialogHeader>

        <ActionDialogResource
          row={order}
          condition={getResourceCondition(order)}
          aside={order.order_number ? <span className="font-mono">Pedido #{order.order_number}</span> : null}
        />

        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Motivo del rechazo *</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="Indique el motivo por el cual rechaza este pedido (ej: solicitud duplicada)..."
                  rows={3}
                  disabled={blocked}
                  autoFocus
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={blocked}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="destructive"
            disabled={blocked || !isValid}
            aria-describedby={!isValid ? 'reject-order-hint' : undefined}
          >
            {blocked && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Rechazar Pedido
          </Button>
        </DialogFooter>
        {!isValid && (
          <p id="reject-order-hint" className="text-muted-foreground text-right text-xs">
            Escribí el motivo del rechazo para habilitar el botón.
          </p>
        )}
      </form>
    </Form>
  );
}
