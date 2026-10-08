'use client';

import moment from 'moment';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { useDataTablePending } from '../DataTablePendingContext';

interface UseUrlDateRangeInput {
  columnId: string;
  /** Namespace para prefijar los params de URL cuando hay múltiples DataTables en la misma página */
  paramNamespace?: string;
}

/**
 * Estado de un filtro de rango de fechas sincronizado con la URL (sin UI).
 * Copia literal de la lógica de `DataTableDateRangeFilter`: mismas keys `<col>_from` / `<col>_to`.
 */
export function useUrlDateRange({ columnId, paramNamespace }: UseUrlDateRangeInput) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { startTransition, isClientSide, notifyUrlChange, urlVersion } = useDataTablePending();

  // Prefijo de namespace para aislar parámetros entre DataTables en la misma página
  const prefix = paramNamespace ? `${paramNamespace}__` : '';
  const fromKey = `${prefix}${columnId}_from`;
  const toKey = `${prefix}${columnId}_to`;
  const pageKey = paramNamespace ? `${paramNamespace}__page` : 'page';

  // Leer valores actuales: desde browser URL en client-side mode
  const { fromValue, toValue } = React.useMemo(() => {
    if (isClientSide && typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      return {
        fromValue: urlParams.get(fromKey),
        toValue: urlParams.get(toKey),
      };
    }
    return {
      fromValue: searchParams.get(fromKey),
      toValue: searchParams.get(toKey),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- urlVersion triggers re-read in client-side mode
  }, [isClientSide, searchParams, fromKey, toKey, urlVersion]);

  const fromDate = fromValue ? new Date(fromValue) : undefined;
  const toDate = toValue ? new Date(toValue) : undefined;
  const hasValue = !!(fromValue || toValue);

  /** Texto del rango para chip/trigger: "12/08 - 30/09", "Desde 12/08" o "Hasta 30/09". */
  const rangeLabel =
    fromValue && toValue
      ? `${moment(fromValue).format('DD/MM')} - ${moment(toValue).format('DD/MM')}`
      : fromValue
        ? `Desde ${moment(fromValue).format('DD/MM')}`
        : toValue
          ? `Hasta ${moment(toValue).format('DD/MM')}`
          : '';

  const commit = (params: URLSearchParams) => {
    if (isClientSide) {
      window.history.replaceState(window.history.state, '', `${pathname}?${params.toString()}`);
      notifyUrlChange();
    } else {
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    }
  };

  const updateParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(isClientSide ? window.location.search : searchParams.toString());

    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set(pageKey, '1');
    commit(params);
  };

  const setFrom = (date: Date | undefined) => updateParam(fromKey, date ? moment(date).format('YYYY-MM-DD') : null);
  const setTo = (date: Date | undefined) => updateParam(toKey, date ? moment(date).format('YYYY-MM-DD') : null);

  const clearFilter = () => {
    const params = new URLSearchParams(isClientSide ? window.location.search : searchParams.toString());
    params.delete(fromKey);
    params.delete(toKey);
    params.set(pageKey, '1');
    commit(params);
  };

  return { fromValue, toValue, fromDate, toDate, hasValue, rangeLabel, setFrom, setTo, clearFilter };
}

export type UrlDateRangeState = ReturnType<typeof useUrlDateRange>;
