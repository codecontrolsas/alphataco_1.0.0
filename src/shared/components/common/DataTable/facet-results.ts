import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { FacetResult } from '@/shared/components/common/DataTable/types';
import type { LucideIcon } from 'lucide-react';
import { CircleOff } from 'lucide-react';

/**
 * `FacetResult` de un enum: opciones fijas con su etiqueta e ícono + los conteos del servidor. La opción
 * "Sin asignar" aparece solo si hay filas sin valor.
 */
export function buildEnumFacetResult(
  enumValues: readonly string[],
  labels: Record<string, string>,
  icons: Record<string, LucideIcon | undefined> | undefined,
  counts: Map<string, number>,
  nullLabel = 'Sin asignar'
): FacetResult {
  return {
    options: [
      ...enumValues.map((value) => ({
        value,
        label: labels[value] ?? value,
        ...(icons?.[value] ? { icon: icons[value] } : {}),
      })),
      ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: nullLabel, icon: CircleOff }] : []),
    ],
    counts,
  };
}

/**
 * `FacetResult` de una FK: opciones resueltas por el servidor (`{ id, name }`) + conteos. `icon` se aplica a
 * todas las opciones; "Sin asignar" (o `nullLabel`) aparece solo si hay filas sin valor.
 */
export function buildFkFacetResult(
  resolvedOptions: ReadonlyArray<{ id: string; name: string | null }> | undefined,
  counts: Map<string, number>,
  nullLabel = 'Sin asignar',
  icon?: LucideIcon
): FacetResult {
  return {
    options: [
      ...(resolvedOptions?.map((o) => ({ value: o.id, label: o.name ?? '', ...(icon ? { icon } : {}) })) ?? []),
      ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: nullLabel, icon: CircleOff }] : []),
    ],
    counts,
  };
}
