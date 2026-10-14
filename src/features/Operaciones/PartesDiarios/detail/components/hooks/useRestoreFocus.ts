'use client';

import { useCallback, useRef } from 'react';

/**
 * Devuelve el foco al elemento que abrió un panel o diálogo controlado desde afuera (sin `Trigger` de Radix,
 * por lo que Radix no sabe a quién devolverlo). Se pasan los dos handlers al `*Content`:
 * al abrir se recuerda el elemento enfocado y al cerrar se lo vuelve a enfocar, si sigue en el documento.
 */
export function useRestoreFocus() {
  const openerRef = useRef<HTMLElement | null>(null);

  const onOpenAutoFocus = useCallback(() => {
    // Radix todavía no movió el foco: el elemento activo es el que disparó la apertura.
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, []);

  const onCloseAutoFocus = useCallback((event: Event) => {
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener?.isConnected) {
      event.preventDefault();
      opener.focus();
    }
  }, []);

  return { onOpenAutoFocus, onCloseAutoFocus };
}
