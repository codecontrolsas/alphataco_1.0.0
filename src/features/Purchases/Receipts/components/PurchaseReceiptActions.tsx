'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Ban } from 'lucide-react';
import { type PurchaseReceiptDetail } from '../../actions/receipt-queries.server';
import { cancelPurchaseReceipt } from '../../actions/receipts.server';
import { ConfirmAction } from '../../components/ConfirmAction';
import { invalidateWarehouseAfterReceipt } from '../lib/invalidate-warehouse';

/** Anular la recepcion: anula su entrada a Almacenes y la OC complementaria si no se aprobo. */
export function PurchaseReceiptActions({ receipt }: { receipt: PurchaseReceiptDetail }) {
  const queryClient = useQueryClient();
  if (!receipt.can.cancel) return null;
  return (
    <ConfirmAction
      icon={Ban}
      label="Anular"
      title={`¿Anular ${receipt.number}?`}
      description={
        receipt.movement
          ? `Se anula la entrada ${receipt.movement.number} en Almacenes (si ese stock ya salió, no se puede) y la orden vuelve a esperar lo recibido.`
          : 'La orden vuelve a esperar lo recibido.'
      }
      confirmLabel="Anular recepción"
      successMessage={`Recepción ${receipt.number} anulada`}
      motive={{ label: 'Motivo', placeholder: 'Obligatorio', required: true }}
      run={async (notes) => {
        const result = await cancelPurchaseReceipt(receipt.id, notes);
        // La anulación devuelve el stock a Almacenes: sus tablas (client-side mode) también se refrescan.
        if (result.ok) invalidateWarehouseAfterReceipt(queryClient);
        return result;
      }}
    />
  );
}
