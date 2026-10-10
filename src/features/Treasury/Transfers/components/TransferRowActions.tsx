'use client';

import { Button } from '@/components/ui/button';
import { Ban } from 'lucide-react';
import { useState } from 'react';
import { cancelTransfer } from '../../actions/transfers.server';
import { CancelReasonDialog } from '../../components/CancelReasonDialog';

/**
 * Anular una transferencia vigente (anula sus dos movimientos). Las transferencias no se editan:
 * se anulan y se cargan de nuevo. La fila decide si se muestra según `tesoreria:transferencias:update`.
 */
export function TransferRowActions({ transfer }: { transfer: { id: string; number: string; cancelled: boolean } }) {
  const [open, setOpen] = useState(false);
  if (transfer.cancelled) return null;
  return (
    <>
      <Button type="button" variant="ghost" size="sm" className="h-8 text-destructive hover:text-destructive" onClick={() => setOpen(true)}>
        <Ban className="mr-1 h-4 w-4" />
        Anular
      </Button>
      <CancelReasonDialog
        open={open}
        onOpenChange={setOpen}
        title={`Anular la ${transfer.number}`}
        description="Se anulan el egreso de la cuenta de origen y el ingreso de la de destino. Para corregirla, anulala y cargala de nuevo."
        successMessage={`${transfer.number} anulada`}
        run={(reason) => cancelTransfer(transfer.id, reason)}
      />
    </>
  );
}
