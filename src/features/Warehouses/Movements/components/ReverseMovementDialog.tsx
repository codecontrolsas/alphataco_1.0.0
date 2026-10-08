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
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Logger } from '@/lib/logger';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { reverseStockMovementAction } from '../../actions/movements.server';
import { formatMoney } from '../../lib/format';
import { WAREHOUSE_QUERY_KEYS } from '../../lib/query-keys';
import { unwrapAction } from '../../lib/unwrap-action';

const logger = new Logger('Warehouses/ReverseMovementDialog');

/**
 * Anula un movimiento con otro de efecto inverso. El motivo es obligatorio y queda en el
 * movimiento de anulacion. Si el material ya se consumio, el servidor lo rechaza con el detalle.
 */
export function ReverseMovementDialog({ movementId, number }: { movementId: string; number: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: async () => unwrapAction(await reverseStockMovementAction(movementId, reason)),
    onSuccess: (result) => {
      const total = result.totalCost !== null ? ` (${formatMoney(result.totalCost)})` : '';
      toast.success(`${number} anulado por ${result.number}${total}`);
      queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.movements });
      queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.stock });
      queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.availability });
      // Anular una entrega recalcula el estado y el avance del pedido.
      queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.requests });
      setOpen(false);
      router.push(`/dashboard/warehouse/movements/${result.id}`);
    },
    onError: (error) => {
      logger.error('Error al anular el movimiento', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo anular el movimiento');
    },
  });

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setReason('');
      }}
    >
      <Button type="button" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setOpen(true)}>
        <Undo2 className="mr-2 h-4 w-4" />
        Anular
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Anular {number}?</AlertDialogTitle>
          <AlertDialogDescription>
            Se registra un movimiento inverso al mismo costo, y el original queda marcado como anulado. No se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reverse-reason">Motivo</Label>
          <Textarea
            id="reverse-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej.: se cargó en el depósito equivocado"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!reason.trim() || mutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(event) => {
              event.preventDefault();
              mutation.mutate();
            }}
          >
            {mutation.isPending ? 'Anulando…' : 'Anular movimiento'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
