'use client';

import { useCallback, type KeyboardEvent, type MouseEvent } from 'react';

/**
 * Delegación de eventos para figuras interactivas: cada parte clicable del SVG lleva
 * `data-iso-id`, `tabindex="0"`, `role="button"` y un `aria-label`. Un solo listener en el
 * contenedor resuelve clic, Enter y Espacio, así no hay un handler por pieza.
 */
export function useIsoSelect(onSelect: (id: string | null) => void) {
  const resolve = (target: EventTarget | null) =>
    (target as Element | null)?.closest?.('[data-iso-id]')?.getAttribute('data-iso-id') ?? null;

  const onClick = useCallback((event: MouseEvent<HTMLElement>) => onSelect(resolve(event.target)), [onSelect]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const id = resolve(event.target);
      if (id === null) return;
      event.preventDefault();
      onSelect(id);
    },
    [onSelect]
  );

  return { onClick, onKeyDown };
}
