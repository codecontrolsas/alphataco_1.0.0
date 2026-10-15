'use client';

import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useState } from 'react';
import type { PreparteConfirmation } from '../../list/columns';
import { PreparteConfirmForm } from '../PreparteConfirmForm';
import type { PreparteItem } from '../PreparteManager';

interface OrderConfirmDialogProps {
  item: PreparteItem;
  onSubmit: (confirmation: PreparteConfirmation) => Promise<void> | void;
  /** Cancela: vuelve al detalle si se abrió desde ahí; si se abrió desde la tabla, cierra. */
  onBack: () => void;
  /** Texto del botón de cancelar ("Volver" cuando hay un detalle al que volver). */
  backLabel?: string;
  /** Cierra todo (Escape o clic fuera). */
  onClose: () => void;
  /** Al cerrarse el diálogo: el padre decide a dónde vuelve el foco (ver `PreparteManager`). */
  onCloseAutoFocus?: (event: Event) => void;
}

/** Diálogo de confirmación de un pedido: envuelve `PreparteConfirmForm`. No se cierra mientras hay un pedido en curso. */
export function OrderConfirmDialog({
  item,
  onSubmit,
  onBack,
  backLabel,
  onClose,
  onCloseAutoFocus,
}: OrderConfirmDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (confirmation: PreparteConfirmation) => {
    setIsSubmitting(true);
    try {
      await onSubmit(confirmation);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen && !isSubmitting) onClose();
      }}
    >
      <DialogContent
        showCloseButton={!isSubmitting}
        onCloseAutoFocus={onCloseAutoFocus}
        onEscapeKeyDown={(event) => {
          if (isSubmitting) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (isSubmitting) event.preventDefault();
        }}
      >
        <PreparteConfirmForm item={item} onSubmit={handleSubmit} onCancel={onBack} cancelLabel={backLabel} />
      </DialogContent>
    </Dialog>
  );
}
