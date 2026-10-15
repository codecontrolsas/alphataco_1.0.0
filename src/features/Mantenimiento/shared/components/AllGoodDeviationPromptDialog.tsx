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
import { CircleCheck } from 'lucide-react';
import { useRef } from 'react';

type AllGoodDeviationPromptDialogProps = {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function AllGoodDeviationPromptDialog({ isOpen, onCancel, onConfirm }: AllGoodDeviationPromptDialogProps) {
  // Distingue click explícito en botón vs cierre por ESC/click fuera.
  // Radix dispara onOpenChange(false) al cerrarse, lo que reencendería los handlers.
  const actionTakenRef = useRef(false);

  const handleCancelClick = () => {
    actionTakenRef.current = true;
    onCancel();
  };

  const handleConfirmClick = () => {
    actionTakenRef.current = true;
    onConfirm();
  };

  const handleOpenChange = (open: boolean) => {
    if (open) {
      actionTakenRef.current = false;
      return;
    }
    // Si el cierre vino por ESC o click fuera, tratar como cancelación.
    if (!actionTakenRef.current) {
      onCancel();
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader className="text-left space-y-3">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ok-subtle ring-1 ring-ok/30"
              aria-hidden="true"
            >
              <CircleCheck className="h-4 w-4 text-ok" />
            </span>
            <AlertDialogTitle className="text-base leading-tight">Checklist guardado correctamente</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-sm leading-relaxed">
            No se detectaron ítems con fallos. ¿Querés registrar un desvío de mantenimiento igualmente? Por ejemplo, si
            notaste algo que el checklist no cubre.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancelClick}>No, continuar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmClick}>Sí, registrar desvío</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
