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
import type { ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { Logger } from '@/lib/logger';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { invalidatePurchases } from '../lib/invalidate';

const logger = new Logger('Purchases/ConfirmAction');

interface ConfirmProps {
  icon: LucideIcon;
  label: string;
  title: string;
  description: string;
  /** Contenido extra del dialogo (p. ej. el aviso de documentos vencidos del proveedor). */
  children?: ReactNode;
  confirmLabel: string;
  successMessage: string;
  variant?: 'default' | 'outline' | 'destructive';
  /** Si pide motivo: obligatorio u opcional. */
  motive?: { label: string; placeholder: string; required: boolean };
  run: (notes: string) => Promise<ActionResult>;
}

/** Confirmacion de un cambio de estado de Compras, con motivo cuando corresponde. */
export function ConfirmAction({ icon: Icon, variant = 'outline', motive, run, children, ...text }: ConfirmProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const motiveId = useId();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: async () => unwrapAction(await run(notes)),
    onSuccess: () => {
      toast.success(text.successMessage);
      setOpen(false);
      setNotes('');
      invalidatePurchases(queryClient);
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al cambiar el estado', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo completar la acción');
    },
  });

  const missingMotive = motive?.required === true && !notes.trim();

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button type="button" size="sm" variant={variant} onClick={() => setOpen(true)}>
        <Icon className="mr-1 h-4 w-4" />
        {text.label}
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{text.title}</AlertDialogTitle>
          <AlertDialogDescription>{text.description}</AlertDialogDescription>
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
            className={
              variant === 'destructive'
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : undefined
            }
            onClick={(e) => {
              // La accion se confirma al terminar: si falla, el dialogo queda abierto con el motivo.
              e.preventDefault();
              mutation.mutate();
            }}
          >
            {mutation.isPending ? 'Procesando…' : text.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
