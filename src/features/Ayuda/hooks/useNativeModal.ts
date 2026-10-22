'use client';

import { useEffect, useRef } from 'react';

interface Options {
  /** Selector del control que recibe el foco al abrir. */
  initialFocusSelector: string;
  /**
   * Corta Escape en `window` (fase de captura) para que no llegue al sheet de Radix de atrás, que lo escucha en
   * `document` antes que React. No hace `preventDefault`: el cierre nativo (evento `cancel`) tiene que seguir
   * ocurriendo y lo maneja el diálogo.
   */
  stopEscapeInCapture?: boolean;
}

/**
 * Apertura, foco y bloqueo de scroll de un `<dialog>` modal nativo (`ConfirmDialog`, `TicketCloseProposalDialog`).
 * Devuelve la ref que va en el `<dialog>`. Sincroniza `open` con el estado nativo; no hay ningún `setState`,
 * sólo llamadas al DOM.
 */
export function useNativeModal(open: boolean, { initialFocusSelector, stopEscapeInCapture = false }: Options) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || dialog === null) return;

    // Quién tenía el foco antes de abrir. `close()` lo devuelve solo, pero si
    // el diálogo se desmonta abierto (se cierra el sheet, se navega) esa
    // restauración nativa no ocurre y el foco se cae al <body>.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    dialog.showModal();
    dialog.querySelector<HTMLElement>(initialFocusSelector)?.focus();

    const stopEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') event.stopPropagation();
    };
    if (stopEscapeInCapture) window.addEventListener('keydown', stopEscape, { capture: true });

    return () => {
      if (stopEscapeInCapture) window.removeEventListener('keydown', stopEscape, { capture: true });
      if (dialog.open) dialog.close();
      if (opener !== null && opener.isConnected && document.activeElement === document.body) {
        opener.focus();
      }
    };
  }, [open, initialFocusSelector, stopEscapeInCapture]);

  // Bloqueo del scroll del fondo, en su propio efecto porque tiene su propio
  // ciclo de vida: hay que devolver el body EXACTAMENTE como estaba, incluso
  // si el diálogo se desmonta abierto.
  useEffect(() => {
    if (!open) return;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;

    // Compensar el ancho de la barra ANTES de ocultarla, o el fondo salta unos
    // píxeles a la derecha al abrir. Si el hueco es 0 no se toca nada: pasa con
    // las barras superpuestas de macOS y también cuando el sheet del host ya
    // bloqueó el scroll y compensó él.
    const gap = window.innerWidth - document.documentElement.clientWidth;
    if (gap > 0) {
      const current = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${current + gap}px`;
    }
    body.style.overflow = 'hidden';

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, [open]);

  return dialogRef;
}
