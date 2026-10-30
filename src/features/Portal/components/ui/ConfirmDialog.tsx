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
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Confirmación accesible (AlertDialog de Radix: foco atrapado, Escape, foco de vuelta al disparador). Mientras
 * `pending` no se puede cerrar ni volver a confirmar. Nunca se encadena con otro modal.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel = 'Cancelar',
  pending = false,
  destructive = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-balance">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-pretty">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending} className="min-h-11">
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            aria-busy={pending}
            className={cn('min-h-11', destructive && buttonVariants({ variant: 'destructive' }))}
            onClick={(event) => {
              // Radix cerraría el diálogo al instante: lo cierra quien llama cuando termina la acción.
              event.preventDefault();
              onConfirm();
            }}
          >
            {pending && <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
            {pending ? pendingLabel ?? confirmLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
