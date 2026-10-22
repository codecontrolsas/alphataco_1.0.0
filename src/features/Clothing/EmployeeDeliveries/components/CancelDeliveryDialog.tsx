'use client';

import { Button } from '@/components/ui/button';
import { Logger } from '@/lib/logger';
import { ConfirmReasonDialog } from '@/shared/components/common/ConfirmReasonDialog';
import { Ban } from 'lucide-react';
import { useState } from 'react';
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
  const [open, setOpen] = useState(false);

  return (
    <>
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
      <ConfirmReasonDialog
        open={open}
        onOpenChange={setOpen}
        title={`¿Anular la entrega a ${employeeLabel}?`}
        description={`${
          hasStock
            ? 'La ropa vuelve al depósito del que salió, al mismo costo. '
            : 'Esta entrega es anterior al control de stock: no hay stock que devolver. '
        }La entrega y su constancia firmada se conservan, marcadas como anuladas. No se puede deshacer.`}
        confirmLabel="Anular entrega"
        pendingLabel="Anulando…"
        motive={{ label: 'Motivo', placeholder: 'Ej.: se cargó un talle equivocado' }}
        destructive
        run={(reason) => cancelClothingDeliveryAction(deliveryId, reason)}
        onDone={() => onCancelled?.()}
        messages={{
          success: hasStock ? 'Entrega anulada: la ropa volvió al depósito' : 'Entrega anulada',
          errorFallback: 'No se pudo anular la entrega',
          logError: 'Error al anular la entrega',
        }}
        logger={logger}
        resetOnClose
      />
    </>
  );
}
