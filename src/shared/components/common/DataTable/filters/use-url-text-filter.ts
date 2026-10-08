'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { useDataTablePending } from '../DataTablePendingContext';

interface UseUrlTextFilterInput {
  columnId: string;
  /** Namespace para prefijar los params de URL cuando hay múltiples DataTables en la misma página */
  paramNamespace?: string;
}

/**
 * Estado de un filtro de texto sincronizado con la URL (sin UI).
 * Copia literal de la lógica de `DataTableTextFilter`: mismas keys, mismo `pageKey`.
 */
export function useUrlTextFilter({ columnId, paramNamespace }: UseUrlTextFilterInput) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { startTransition, isClientSide, notifyUrlChange, urlVersion } = useDataTablePending();

  // Clave con prefijo de namespace si corresponde
  const paramKey = paramNamespace ? `${paramNamespace}__${columnId}` : columnId;
  const pageKey = paramNamespace ? `${paramNamespace}__page` : 'page';

  // Leer valor actual: desde browser URL en client-side mode, desde Next.js searchParams en server mode
  const currentValue = React.useMemo(() => {
    if (isClientSide && typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get(paramKey) ?? '';
    }
    return searchParams.get(paramKey) ?? '';
    // eslint-disable-next-line react-hooks/exhaustive-deps -- urlVersion triggers re-read in client-side mode
  }, [isClientSide, searchParams, paramKey, urlVersion]);

  const [inputValue, setInputValue] = React.useState(currentValue);
  const hasValue = !!currentValue;

  // Sincronizar input si el valor cambia externamente
  React.useEffect(() => {
    setInputValue(currentValue);
  }, [currentValue]);

  const applyFilter = (value: string) => {
    // En client-side mode, leer params actuales del browser URL (no de Next.js state)
    const params = new URLSearchParams(isClientSide ? window.location.search : searchParams.toString());

    if (value.trim()) {
      params.set(paramKey, value.trim());
    } else {
      params.delete(paramKey);
    }
    params.set(pageKey, '1');

    if (isClientSide) {
      // Actualización silenciosa — no navega, no re-renderiza server components
      window.history.replaceState(window.history.state, '', `${pathname}?${params.toString()}`);
      notifyUrlChange();
    } else {
      // Comportamiento original: navegación del servidor
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    }
  };

  const clearFilter = () => {
    setInputValue('');
    applyFilter('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      applyFilter(inputValue);
    }
    if (e.key === 'Escape') {
      setInputValue(currentValue);
    }
  };

  return { currentValue, inputValue, setInputValue, hasValue, applyFilter, clearFilter, handleKeyDown };
}

export type UrlTextFilterState = ReturnType<typeof useUrlTextFilter>;
