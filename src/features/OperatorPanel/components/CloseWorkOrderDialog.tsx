'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { invalidateAllMaintenanceQueries } from '@/features/Mantenimiento/utils/queryInvalidation';
import { Logger } from '@/lib/logger';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { closeWorkOrder } from '../actions/work-orders.server';

const logger = new Logger('CloseWorkOrderDialog');

interface CloseWorkOrderDialogProps {
  workOrderId: string;
  workOrderItems: Array<{
    id: string;
    status: string | null;
    work_order_item_repairs: Array<{
      id: string;
      status: string | null;
    }> | null;
  }>;
  open: boolean;
  onClose: () => void;
}

export function CloseWorkOrderDialog({ workOrderId, workOrderItems, open, onClose }: CloseWorkOrderDialogProps) {
  const [notes, setNotes] = useState('');
  const queryClient = useQueryClient();
  const router = useRouter();

  const countRepairsByStatus = () => {
    let completed = 0;
    let pending = 0;
    let returned = 0;

    workOrderItems.forEach((item) => {
      item.work_order_item_repairs?.forEach((repair) => {
        if (repair.status === 'completed') {
          completed++;
        } else if (repair.status === 'reassignment_requested') {
          returned++;
        } else {
          pending++;
        }
      });
    });

    return { completed, pending, returned };
  };

  const { completed, pending, returned } = countRepairsByStatus();

  const mutation = useMutation({
    mutationFn: async () => {
      return closeWorkOrder(workOrderId, notes || undefined);
    },
    onSuccess: (result) => {
      logger.info('Orden de trabajo cerrada exitosamente', {
        data: { workOrderId },
      });
      toast.success('Orden de trabajo cerrada exitosamente', {
        description: `${completed} completada${completed === 1 ? '' : 's'}, ${pending} pendiente${pending === 1 ? '' : 's'}, ${returned} devuelta${returned === 1 ? '' : 's'}.`,
      });

      // La OT se cerró igual, pero el pedido no pudo avanzar: el operario tiene que saberlo
      // y a quién avisar. El toast va aparte y sin auto-cierre para que no se lo pierda.
      if (result?.orderAdvanceWarning) {
        toast.warning(result.orderAdvanceWarning, { duration: Infinity, closeButton: true });
      }

      queryClient.invalidateQueries({ queryKey: ['operator-work-orders'] });
      invalidateAllMaintenanceQueries(queryClient);
      handleClose();
      router.push('/operator/dashboard');
    },
    onError: (error) => {
      logger.error('Error al cerrar orden de trabajo', {
        data: {
          workOrderId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      toast.error(error instanceof Error ? error.message : 'Error al cerrar la orden de trabajo');
    },
  });

  const handleClose = () => {
    setNotes('');
    onClose();
  };

  const handleSubmit = () => {
    mutation.mutate();
  };

  const footer = (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end w-full">
      <Button
        type="button"
        variant="outline"
        onClick={handleClose}
        disabled={mutation.isPending}
        className="h-12 w-full sm:h-11 sm:w-auto"
      >
        Cancelar
      </Button>
      <Button type="button" onClick={handleSubmit} disabled={mutation.isPending} className="h-12 w-full sm:h-11 sm:w-auto">
        {mutation.isPending ? 'Cerrando...' : 'Cerrar Orden de Trabajo'}
      </Button>
    </div>
  );

  return (
    <ResponsiveDialog open={open} onOpenChange={handleClose} title="Cerrar Orden de Trabajo" footer={footer}>
      <div className="space-y-4">
        {/* Summary Section */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Resumen de Reparaciones</h4>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-ok/30 bg-ok-subtle p-3 text-center">
              <p className="text-sm font-medium text-ok-subtle-foreground">Completadas</p>
              <p className="text-2xl font-bold text-ok-subtle-foreground">{completed}</p>
            </div>
            <div className="rounded-lg border border-warn/30 bg-warn-subtle p-3 text-center">
              <p className="text-sm font-medium text-warn-subtle-foreground">Pendientes</p>
              <p className="text-2xl font-bold text-warn-subtle-foreground">{pending}</p>
            </div>
            <div className="rounded-lg border border-danger/30 bg-danger-subtle p-3 text-center">
              <p className="text-sm font-medium text-danger-subtle-foreground">Devueltas</p>
              <p className="text-2xl font-bold text-danger-subtle-foreground">{returned}</p>
            </div>
          </div>
        </div>

        {/* Warning if pending repairs */}
        {pending > 0 && (
          <div className="rounded-lg border border-warn/30 bg-warn-subtle p-3.5 flex items-start gap-3">
            <AlertTriangle aria-hidden="true" className="h-5 w-5 text-warn-subtle-foreground flex-shrink-0 mt-0.5" />
            <div className="text-sm text-warn-subtle-foreground">
              <p className="font-medium">Advertencia</p>
              <p className="mt-1">
                Esta OT se cerrara con {pending} tarea{pending > 1 ? 's' : ''} pendiente{pending > 1 ? 's' : ''}
              </p>
            </div>
          </div>
        )}

        <Separator />

        {/* Optional Notes */}
        <div className="space-y-2">
          <Label htmlFor="closure-notes">
            Notas de cierre <span className="text-muted-foreground">(opcional)</span>
          </Label>
          <Textarea
            id="closure-notes"
            placeholder="Ingrese observaciones sobre el cierre de la orden de trabajo"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="min-h-[80px] text-base"
          />
        </div>
      </div>
    </ResponsiveDialog>
  );
}
