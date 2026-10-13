'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { PARAM_SEPARATOR } from './helpers';
import { DATA_TABLE_URL_CHANGE_EVENT } from './useDataTable';

function subscribe(onChange: () => void) {
  window.addEventListener(DATA_TABLE_URL_CHANGE_EVENT, onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    window.removeEventListener(DATA_TABLE_URL_CHANGE_EVENT, onChange);
    window.removeEventListener('popstate', onChange);
  };
}

/**
 * Lee y escribe el filtro de UNA columna de un DataTable que corre en modo client-side, desde
 * fuera de la tabla (tarjetas de métricas, atajos…).
 *
 * La tabla guarda su estado en la URL con el prefijo de su `tableId` (`<tableId>__<columna>`) y
 * escucha `DATA_TABLE_URL_CHANGE_EVENT`; este hook escribe en esa misma URL sin navegar y avisa
 * por ese evento, así que la tabla se actualiza sola y no hay estado duplicado: el valor se lee
 * siempre de la URL (`useSyncExternalStore`), no de un `useState` que pueda desincronizarse.
 *
 * @param serverValue valor con el que se renderizó el servidor (evita el salto de hidratación)
 * @returns `[valor actual, setValue]`; `setValue(null)` quita el filtro y vuelve a la página 1
 */
export function useDataTableFilter(
  tableId: string,
  columnId: string,
  serverValue: string | null = null
): readonly [string | null, (value: string | null) => void] {
  const key = `${tableId}${PARAM_SEPARATOR}${columnId}`;
  const pageKey = `${tableId}${PARAM_SEPARATOR}page`;

  const value = useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get(key),
    () => serverValue
  );

  const setValue = useCallback(
    (next: string | null) => {
      const params = new URLSearchParams(window.location.search);
      if (next) params.set(key, next);
      else params.delete(key);
      params.delete(pageKey);

      const query = params.toString();
      window.history.replaceState(
        window.history.state,
        '',
        query ? `${window.location.pathname}?${query}` : window.location.pathname
      );
      window.dispatchEvent(new Event(DATA_TABLE_URL_CHANGE_EVENT));
    },
    [key, pageKey]
  );

  return [value, setValue] as const;
}
