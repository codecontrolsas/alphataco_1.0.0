'use client';

import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { Logger } from '@/lib/logger';
import { ConfirmReasonDialog } from '@/shared/components/common/ConfirmReasonDialog';
import { useQueryClient } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
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
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" size="sm" variant={variant} onClick={() => setOpen(true)}>
        <Icon className="mr-1 h-4 w-4" />
        {text.label}
      </Button>
      <ConfirmReasonDialog
        open={open}
        onOpenChange={setOpen}
        title={text.title}
        description={text.description}
        confirmLabel={text.confirmLabel}
        motive={motive}
        destructive={variant === 'destructive'}
        run={run}
        onDone={() => invalidatePurchases(queryClient)}
        messages={{
          success: text.successMessage,
          errorFallback: 'No se pudo completar la acción',
          logError: 'Error al cambiar el estado',
        }}
        logger={logger}
      >
        {children}
      </ConfirmReasonDialog>
    </>
  );
}
