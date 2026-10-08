'use client';

import { useEffect, useState } from 'react';

/**
 * Devuelve `value` recién cuando dejó de cambiar durante `delayMs`. Lo usa la búsqueda en servidor de
 * `SearchSelect` para no disparar un request por tecla.
 *
 * El timer es sincronización con algo externo al render (el reloj), el único uso de `useEffect` que
 * admite `no-useeffect.md`. Si `delayMs` es 0 devuelve el valor tal cual, sin pasar por el efecto.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (delayMs <= 0) return;
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return delayMs <= 0 ? value : debounced;
}
