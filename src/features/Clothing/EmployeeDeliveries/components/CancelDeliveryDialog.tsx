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
import { unwrapAction } from '@/features/Warehouses/lib/unwrap-action';
import { Logger } from '@/lib/logger';
import { useMutation } from '@tanstack/react-query';
import { Ban } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { cancelClothingDeliveryAction } from '../actions/cancel.server';

const logger = new Logger('Clothing/CancelDeliveryDialog');

/**
 * Anula una entrega de ropa (Almacenes etapa 5): la ropa vuelve al deposito al mismo costo y la
 * entrega queda marcada "Anulada" (no se borra; la constancia firmada se conserva).
 *
 * `onCancelled` lo usa la tabla para invalidar su query (client-side mode).
 */
export function CancelDeliveryDialog({
  deliveryId,
  employeeLabel,
  hasStock,
  onCancelled,
}: {
  deliveryId: string;
  /** "[123] Perez Juan", para el titulo. */
  employeeLabel: string;
  /** Si la entrega descontó stock. Las anteriores a Almacenes etapa 5 no: anularlas solo las marca. */
  hasStock: boolean;
  onCancelled?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: async () => unwrapAction(await cancelClothingDeliveryAction(deliveryId, reason)),
    onSuccess: () => {
      toast.success(hasStock ? 'Entrega anulada: la ropa volvió al depósito' : 'Entrega anulada');
      setOpen(false);
      setReason('');
      onCancelled?.();
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al anular la entrega', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo anular la entrega');
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
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 text-destructive hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Ban className="h-3.5 w-3.5" />
        Anular
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Anular la entrega a {employeeLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            {hasStock
              ? 'La ropa vuelve al depósito del que salió, al mismo costo. '
              : 'Esta entrega es anterior al control de stock: no hay stock que devolver. '}
            La entrega y su constancia firmada se conservan, marcadas como anuladas. No se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`cancel-delivery-${deliveryId}`}>Motivo</Label>
          <Textarea
            id={`cancel-delivery-${deliveryId}`}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej.: se cargó un talle equivocado"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Volver</AlertDialogCancel>
          <AlertDialogAction
            disabled={!reason.trim() || mutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(event) => {
              event.preventDefault();
              mutation.mutate();
            }}
          >
            {mutation.isPending ? 'Anulando…' : 'Anular entrega'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
