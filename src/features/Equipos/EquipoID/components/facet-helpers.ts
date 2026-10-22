import type { DataTableFilterOption, DataTableSearchParams, FacetResult } from '@/shared/components/common/DataTable/types';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { CircleOff } from 'lucide-react';

/** Lo que devuelven las facetas de las Server Actions de la ficha (`null` si la columna no tiene faceta o falló). */
type FacetResponse = {
  counts: Map<string, number>;
  resolvedOptions?: Array<{ value: string; label: string }>;
} | null;

const EMPTY_FACET: FacetResult = { options: [], counts: new Map() };

function selectedValues(params: DataTableSearchParams, columnId: string): Set<string> {
  const raw = params[columnId];
  const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  return new Set(values.filter(Boolean));
}

function withNullOption(options: DataTableFilterOption[], counts: Map<string, number>, nullLabel: string) {
  return counts.has(NULL_FILTER_VALUE)
    ? [...options, { value: NULL_FILTER_VALUE, label: nullLabel, icon: CircleOff }]
    : options;
}

/**
 * Faceta de una columna con opciones conocidas en el cliente (enum con rótulos e íconos): se listan las que
 * tienen registros con los otros filtros activos y las que el usuario ya tiene seleccionadas (para no perder
 * la selección cuando otro filtro las deja en cero).
 */
export function buildStaticFacet(
  response: FacetResponse,
  columnId: string,
  params: DataTableSearchParams,
  candidates: DataTableFilterOption[],
  nullLabel = 'Sin asignar'
): FacetResult {
  if (!response) return EMPTY_FACET;

  const selected = selectedValues(params, columnId);
  const options = candidates.filter((option) => response.counts.has(option.value) || selected.has(option.value));

  return { options: withNullOption(options, response.counts, nullLabel), counts: response.counts };
}

/** Faceta de una FK: las opciones las resuelve el servidor (solo las que tienen registros). */
export function buildResolvedFacet(response: FacetResponse, nullLabel = 'Sin asignar'): FacetResult {
  if (!response) return EMPTY_FACET;

  const options: DataTableFilterOption[] = (response.resolvedOptions ?? []).map((option) => ({
    value: option.value,
    label: option.label,
  }));

  return { options: withNullOption(options, response.counts, nullLabel), counts: response.counts };
}
