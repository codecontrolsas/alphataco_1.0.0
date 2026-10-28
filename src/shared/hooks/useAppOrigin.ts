'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * Origen (`https://dominio`) con el que el usuario abrió la app. Reemplaza a `NEXT_PUBLIC_BASE_URL`, que se
 * hornea en el bundle: así una misma imagen sirve para cualquier dominio. Vale `''` en el servidor y en la
 * hidratación (sin diferencia de markup); el valor real llega en el primer render del cliente.
 */
export function useAppOrigin(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => ''
  );
}
