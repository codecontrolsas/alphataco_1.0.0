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
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useDailyReportDetailInvalidation } from '../hooks/useDailyReportDetail';
import { deleteDailyReportRowPrisma } from '../mutations.server';
import type { DailyReportDetailRow } from '../types';
import { useRestoreFocus } from './hooks/useRestoreFocus';

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: DailyReportDetailRow | null;
  dailyReportId: string;
  onSuccess: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function DeleteRowDialog({ open, onOpenChange, row, onSuccess }: Props) {
  const { invalidateDetail } = useDailyReportDetailInvalidation();
  const { onOpenAutoFocus, onCloseAutoFocus } = useRestoreFocus();

  const mutation = useMutation({
    mutationFn: (rowId: string) => deleteDailyReportRowPrisma(rowId),
    onSuccess: (result) => {
      invalidateDetail();
      onOpenChange(false);
      onSuccess();

      if (result?.revertedPreparte?.numero_pedido) {
        toast.success(
          `Registro eliminado. El pedido ${result.revertedPreparte.numero_pedido} volvió a estado Pendiente.`
        );
      } else {
        toast.success('Registro eliminado exitosamente');
      }
    },
    onError: () => {
      toast.error('Ocurrió un error al eliminar el registro');
    },
  });

  const customerName = row?.customers?.name ?? '—';
  const serviceName = row?.customer_services?.service_name ?? '—';

  // El diálogo se cierra recién cuando el servidor confirma: `AlertDialogAction` lo cerraría al instante.
  const handleConfirm = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!row || mutation.isPending) return;
    mutation.mutate(row.id);
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        // Con la eliminación en curso no se puede cerrar (Escape incluido).
        if (mutation.isPending) return;
        onOpenChange(nextOpen);
      }}
    >
      <AlertDialogContent onOpenAutoFocus={onOpenAutoFocus} onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar registro</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>¿Estás seguro de que deseas eliminar este registro? Esta acción no se puede deshacer.</p>
              {row && (
                <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
                  <p>
                    <span className="font-medium">Cliente:</span> {customerName}
                  </p>
                  <p>
                    <span className="font-medium">Servicio:</span> {serviceName}
                  </p>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={mutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {mutation.isPending ? 'Eliminando...' : 'Eliminar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
