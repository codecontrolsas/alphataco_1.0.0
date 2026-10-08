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

interface ConfirmRemovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Explica que pasa: si se borra o se desactiva, y por que. */
  description: string;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
}

/**
 * Confirmacion de baja de un registro de catalogo. El servidor decide si borra o desactiva
 * (segun tenga historial); el texto lo anticipa para que no sorprenda.
 */
export function ConfirmRemovalDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Dar de baja',
  pending,
  onConfirm,
}: ConfirmRemovalDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(event) => {
              // Que el dialogo no se cierre antes de que la action conteste.
              event.preventDefault();
              onConfirm();
            }}
          >
            {pending ? 'Procesando…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
