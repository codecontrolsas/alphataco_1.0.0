'use client';

import { useSyncExternalStore } from 'react';

/** Corte de shell (`DISENO.md` §2.6): por debajo de 768px los overlays salen desde abajo. */
export const MOBILE_MEDIA_QUERY = '(max-width: 767px)';

type MediaQueryStore = {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => boolean;
};

// Un store por query, compartido por todos los componentes que la leen: un solo listener de
// `matchMedia` aunque haya N dialogs montados (`client-event-listeners`). Solo guarda la
// `MediaQueryList`, nunca datos de un request, así que no hay estado mutable por usuario en SSR.
const stores = new Map<string, MediaQueryStore>();

function getStore(query: string): MediaQueryStore {
  const cached = stores.get(query);
  if (cached) return cached;

  const listeners = new Set<() => void>();
  let mql: MediaQueryList | null = null;
  const getMql = () => (mql ??= window.matchMedia(query));
  const notify = () => listeners.forEach((listener) => listener());

  const store: MediaQueryStore = {
    subscribe(onChange) {
      if (listeners.size === 0) getMql().addEventListener('change', notify);
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
        if (listeners.size === 0) getMql().removeEventListener('change', notify);
      };
    },
    getSnapshot: () => getMql().matches,
  };

  stores.set(query, store);
  return store;
}

// En SSR vale `false` (desktop). Los overlays que lo usan arrancan cerrados, así que cuando el usuario
// abre uno el valor ya es el real del cliente y no hay render desktop → mobile (`rendering-hydration-no-flicker`).
const getServerSnapshot = () => false;

/**
 * `true` si la media query coincide. Pensado para decisiones de **shell** (el overlay ocupa la
 * pantalla); lo que vive dentro de un panel responde con `@container`, no con este hook.
 */
export function useMediaQuery(query: string): boolean {
  const store = getStore(query);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
}
