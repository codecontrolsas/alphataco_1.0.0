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
import type { Logger } from '@/lib/logger';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useId, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

interface ConfirmReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Contenido extra entre la descripción y el motivo (por ejemplo, un aviso). */
  children?: ReactNode;
  confirmLabel: string;
  /** Texto del botón mientras corre la acción. */
  pendingLabel?: string;
  /** Si pide motivo: obligatorio por defecto. Sin esta prop el diálogo es una confirmación simple. */
  motive?: { label: string; placeholder: string; required?: boolean };
  /** El botón de confirmar se pinta como acción destructiva. */
  destructive?: boolean;
  run: (notes: string) => Promise<ActionResult<unknown>>;
  /** Se llama tras una acción exitosa, antes de refrescar la ruta: invalida las queries del módulo. */
  onDone: () => void;
  messages: {
    success: string;
    /** Aviso si la acción falla y no trae mensaje propio. */
    errorFallback: string;
    /** Mensaje del log de error. */
    logError: string;
  };
  logger: Logger;
  /** Borra el motivo escrito al cerrar el diálogo (si no, se conserva hasta que la acción termina bien). */
  resetOnClose?: boolean;
}

/**
 * Confirmación de un cambio de estado con motivo opcional u obligatorio (AlertDialog). La acción se
 * confirma al terminar: si falla, el diálogo queda abierto con el motivo escrito.
 */
export function ConfirmReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  pendingLabel = 'Procesando…',
  motive,
  destructive,
  run,
  onDone,
  messages,
  logger,
  resetOnClose,
}: ConfirmReasonDialogProps) {
  const router = useRouter();
  const motiveId = useId();
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: async () => unwrapAction(await run(notes)),
    onSuccess: () => {
      toast.success(messages.success);
      onOpenChange(false);
      setNotes('');
      onDone();
      router.refresh();
    },
    onError: (error) => {
      logger.error(messages.logError, { data: { error } });
      toast.error(error instanceof Error ? error.message : messages.errorFallback);
    },
  });

  const missingMotive = motive !== undefined && motive.required !== false && !notes.trim();

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next && resetOnClose) setNotes('');
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        {motive && (
          <div className="space-y-2">
            <Label htmlFor={motiveId}>{motive.label}</Label>
            <Textarea
              id={motiveId}
              rows={3}
              value={notes}
              placeholder={motive.placeholder}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Volver</AlertDialogCancel>
          <AlertDialogAction
            disabled={mutation.isPending || missingMotive}
            className={destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
            onClick={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
          >
            {mutation.isPending ? pendingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
