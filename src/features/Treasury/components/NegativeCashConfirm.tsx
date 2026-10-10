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
import { formatMoney } from '@/features/Warehouses/lib/format';

/** Confirmación cuando una caja queda en negativo (spec §3: avisa, no bloquea). */
export function NegativeCashConfirm({
  accountName,
  after,
  open,
  pending,
  onCancel,
  onConfirm,
}: {
  accountName: string;
  after: string | null;
  open: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(value) => !value && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>La caja queda en negativo</AlertDialogTitle>
          <AlertDialogDescription>
            «{accountName}» queda en {formatMoney(after)}. ¿Guardar igual?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Volver</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {pending ? 'Guardando…' : 'Guardar igual'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
