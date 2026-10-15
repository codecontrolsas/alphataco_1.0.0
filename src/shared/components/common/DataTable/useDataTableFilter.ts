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
 * @returns `[valor actual, setValue, setFilters]`. `setValue(null)` quita el filtro y vuelve a la
 * página 1. `setFilters` escribe varias columnas de la misma tabla de una vez (un solo
 * `replaceState` y un solo evento, así la tabla refetchea una vez y no queda un estado intermedio):
 * cada clave es un id de columna; `null`/`undefined`/vacío la quita y un array se guarda separado por comas.
 */
export type DataTableFilterUpdates = Record<string, string | string[] | null | undefined>;

export function useDataTableFilter(
  tableId: string,
  columnId: string,
  serverValue: string | null = null
): readonly [string | null, (value: string | null) => void, (filters: DataTableFilterUpdates) => void] {
  const key = `${tableId}${PARAM_SEPARATOR}${columnId}`;

  const value = useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get(key),
    () => serverValue
  );

  const setFilters = useCallback(
    (filters: DataTableFilterUpdates) => {
      const params = new URLSearchParams(window.location.search);
      for (const [column, next] of Object.entries(filters)) {
        const paramKey = `${tableId}${PARAM_SEPARATOR}${column}`;
        const serialized = Array.isArray(next) ? next.join(',') : next;
        if (serialized) params.set(paramKey, serialized);
        else params.delete(paramKey);
      }
      params.delete(`${tableId}${PARAM_SEPARATOR}page`);

      const query = params.toString();
      window.history.replaceState(
        window.history.state,
        '',
        query ? `${window.location.pathname}?${query}` : window.location.pathname
      );
      window.dispatchEvent(new Event(DATA_TABLE_URL_CHANGE_EVENT));
    },
    [tableId]
  );

  const setValue = useCallback((next: string | null) => setFilters({ [columnId]: next }), [setFilters, columnId]);

  return [value, setValue, setFilters] as const;
}
