'use client';

import { useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { buildSearch, clampRange, parseFilters, type DiagramCalendarFilters } from '../calendar/utils/calendar-filters';

/**
 * Filtros del calendario de diagramas, reflejados en la URL con el prefijo `diagOld_` (los enlaces del Dashboard
 * siguen funcionando). El estado vive en el cliente y la URL se actualiza con `history.replaceState`: Next lo
 * integra con `useSearchParams`, pero no vuelve a renderizar la página en el servidor por cada cambio.
 * Se parte de la URL actual al montar; no hay botón "Buscar": cada cambio aplica al instante.
 */
export function useDiagramUrlFilters() {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<DiagramCalendarFilters>(() => parseFilters(searchParams));

  // Último estado aplicado, leído de forma síncrona: el timer del buscador (300 ms) conserva el `update` de cuando
  // se tecleó y, sin esto, volvería a escribir el rango o los filtros que cambiaron mientras tanto.
  const latestRef = useRef(filters);

  const apply = (next: DiagramCalendarFilters) => {
    latestRef.current = next;
    setFilters(next);
    const search = buildSearch(next, window.location.search);
    window.history.replaceState(null, '', `${window.location.pathname}${search ? `?${search}` : ''}`);
  };

  const update = (changes: Partial<DiagramCalendarFilters>) => {
    const merged = { ...latestRef.current, ...changes };
    apply({ ...merged, ...clampRange(merged.from, merged.to) });
  };

  /** Quita buscador y listas; conserva el rango de fechas. */
  const reset = () => {
    apply({
      ...latestRef.current,
      search: '',
      position: [],
      workflow: [],
      costCenter: [],
      covenant: [],
      guild: [],
      category: [],
      contractor: [],
      diagramType: [],
    });
  };

  return { filters, update, reset };
}
