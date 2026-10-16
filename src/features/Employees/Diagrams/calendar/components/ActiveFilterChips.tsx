'use client';

import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import type { DiagramFilterCatalog } from '../../actions/diagram-search-actions';
import { NONE_VALUE, type ArrayFilterKey, type DiagramCalendarFilters } from '../utils/calendar-filters';

export const FILTER_LABELS: Record<ArrayFilterKey, string> = {
  position: 'Puesto',
  workflow: 'Diagrama',
  costCenter: 'Centro de costos',
  covenant: 'Convenio',
  guild: 'Gremio',
  category: 'Categoría',
  contractor: 'Contratista',
  diagramType: 'Novedad de hoy',
};

/** Qué lista del catálogo rotula cada filtro. */
const CATALOG_KEY: Record<ArrayFilterKey, keyof DiagramFilterCatalog> = {
  position: 'positions',
  workflow: 'workflows',
  costCenter: 'costCenters',
  covenant: 'covenants',
  guild: 'guilds',
  category: 'categories',
  contractor: 'contractors',
  diagramType: 'diagramTypes',
};

function optionName(catalog: DiagramFilterCatalog | undefined, key: ArrayFilterKey, id: string): string {
  if (id === NONE_VALUE) return 'Sin novedad';
  const options: ReadonlyArray<{ id: string; name: string | null }> | undefined = catalog?.[CATALOG_KEY[key]];
  const option = options?.find((candidate) => candidate.id === id);
  return option?.name ?? (catalog ? 'Sin nombre' : 'Cargando…');
}

interface ActiveFilterChipsProps {
  filters: DiagramCalendarFilters;
  catalog: DiagramFilterCatalog | undefined;
  onRemoveSearch: () => void;
  onRemoveValue: (key: ArrayFilterKey, id: string) => void;
}

/** Un chip por cada filtro activo, con su botón para quitarlo. */
export function ActiveFilterChips({ filters, catalog, onRemoveSearch, onRemoveValue }: ActiveFilterChipsProps) {
  const listChips = (Object.keys(FILTER_LABELS) as ArrayFilterKey[]).flatMap((key) =>
    filters[key].map((id) => ({ key, id, text: `${FILTER_LABELS[key]}: ${optionName(catalog, key, id)}` }))
  );

  if (!filters.search && listChips.length === 0) return null;

  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label="Filtros activos">
      {filters.search && (
        <li>
          <FilterChip text={`Búsqueda: ${filters.search}`} onRemove={onRemoveSearch} />
        </li>
      )}
      {listChips.map((chip) => (
        <li key={`${chip.key}:${chip.id}`}>
          <FilterChip text={chip.text} onRemove={() => onRemoveValue(chip.key, chip.id)} />
        </li>
      ))}
    </ul>
  );
}

function FilterChip({ text, onRemove }: { text: string; onRemove: () => void }) {
  return (
    <Badge variant="secondary" className="max-w-full gap-1 pr-1">
      <span className="truncate">{text}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Quitar filtro ${text}`}
        className="hover:bg-foreground/10 focus-visible:ring-ring rounded-full p-0.5 outline-none focus-visible:ring-2"
      >
        <X aria-hidden="true" className="size-3" />
      </button>
    </Badge>
  );
}
