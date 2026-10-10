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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { unwrapAction } from '@/features/Warehouses/lib/unwrap-action';
import { Logger } from '@/lib/logger';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { invalidateTreasury } from '../lib/invalidate';

const logger = new Logger('Treasury/CancelReasonDialog');

interface CancelReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  successMessage: string;
  run: (reason: string) => Promise<ActionResult>;
}

/** Anulación con motivo obligatorio (movimientos manuales, saldos iniciales y transferencias). */
export function CancelReasonDialog({ open, onOpenChange, title, description, successMessage, run }: CancelReasonDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const reasonId = useId();
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: async () => unwrapAction(await run(reason)),
    onSuccess: () => {
      toast.success(successMessage);
      setReason('');
      onOpenChange(false);
      invalidateTreasury(queryClient);
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al anular', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo anular');
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor={reasonId}>Motivo</Label>
          <Textarea id={reasonId} rows={3} value={reason} placeholder="Por qué se anula" onChange={(e) => setReason(e.target.value)} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Volver</AlertDialogCancel>
          <AlertDialogAction
            disabled={mutation.isPending || !reason.trim()}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              // Se cierra al terminar: si falla, el diálogo queda abierto con el motivo.
              e.preventDefault();
              mutation.mutate();
            }}
          >
            {mutation.isPending ? 'Anulando…' : 'Anular'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
