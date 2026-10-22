'use client';

import { useDataTableFilter } from '@/shared/components/common/DataTable/useDataTableFilter';
import { useEffect } from 'react';
import { hasTableParams } from '../lib/default-table-filter';

/**
 * Deja el filtro por defecto de una tabla escrito en la URL del navegador cuando entra sin ninguno.
 * El servidor ya consultó con ese filtro (`withDefaultTableFilter`); acá solo se sincroniza la URL,
 * que es de donde el DataTable lee su estado. Sin redirect: conserva el resto de los parámetros.
 * Efecto justificado: sincroniza con la URL, un sistema externo.
 */
export function DefaultTableFilter({ tableId, columnId, value }: { tableId: string; columnId: string; value: string }) {
  const [, , setFilters] = useDataTableFilter(tableId, columnId);

  useEffect(() => {
    const current = Object.fromEntries(new URLSearchParams(window.location.search));
    if (!hasTableParams(current, tableId)) setFilters({ [columnId]: value });
  }, [tableId, columnId, value, setFilters]);

  return null;
}
