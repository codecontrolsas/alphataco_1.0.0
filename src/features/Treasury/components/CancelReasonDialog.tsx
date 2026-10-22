'use client';

import type { ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { Logger } from '@/lib/logger';
import { ConfirmReasonDialog } from '@/shared/components/common/ConfirmReasonDialog';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateTreasury } from '../lib/invalidate';

const logger = new Logger('Treasury/CancelReasonDialog');

interface CancelReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  successMessage: string;
  run: (reason: string) => Promise<ActionResult>;
  /** Texto del botón (por defecto "Anular"): "Dar de baja", "Deshacer débito"… */
  confirmLabel?: string;
}

/** Anulación con motivo obligatorio (movimientos manuales, saldos iniciales y transferencias). */
export function CancelReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  successMessage,
  run,
  confirmLabel = 'Anular',
}: CancelReasonDialogProps) {
  const queryClient = useQueryClient();

  return (
    <ConfirmReasonDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      pendingLabel="Guardando…"
      motive={{ label: 'Motivo', placeholder: 'Por qué se anula' }}
      destructive
      run={run}
      onDone={() => invalidateTreasury(queryClient)}
      messages={{ success: successMessage, errorFallback: 'No se pudo anular', logError: 'Error al anular' }}
      logger={logger}
    />
  );
}
