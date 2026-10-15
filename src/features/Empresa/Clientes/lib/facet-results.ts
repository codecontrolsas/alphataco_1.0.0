import type { FacetResult } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { LucideIcon } from 'lucide-react';
import { Check, CircleOff, X } from 'lucide-react';

/**
 * Armado de `FacetResult` para los filtros de las tablas de Clientes. Sin directiva: lo importan
 * componentes cliente.
 */

type ResolvedOptions = ReadonlyArray<{ value: string; label: string }> | undefined;

/** Enum: opciones fijas + counts del servidor ("Sin asignar" solo si hay filas sin valor). */
export function buildEnumFacetResult(
  enumValues: readonly string[],
  labels: Record<string, string>,
  icons: Record<string, LucideIcon | undefined>,
  counts: Map<string, number>
): FacetResult {
  return {
    options: [
      ...enumValues.map((value) => ({ value, label: labels[value] ?? value, icon: icons[value] })),
      ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff }] : []),
    ],
    counts,
  };
}

/** FK: opciones resueltas por el servidor + counts. */
export function buildFkFacetResult(
  resolvedOptions: ResolvedOptions,
  counts: Map<string, number>,
  { nullLabel = 'Sin asignar', icon }: { nullLabel?: string; icon?: LucideIcon } = {}
): FacetResult {
  return {
    options: [
      ...(resolvedOptions?.map((option) => ({
        value: option.value,
        label: option.label,
        ...(icon ? { icon } : {}),
      })) ?? []),
      ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: nullLabel, icon: CircleOff }] : []),
    ],
    counts,
  };
}

/** Booleano: dos opciones con iconos + counts ("Sin asignar" solo si hay filas nulas). */
export function buildBooleanFacetResult(
  counts: Map<string, number>,
  trueLabel: string,
  falseLabel: string
): FacetResult {
  return {
    options: [
      { value: 'true', label: trueLabel, icon: Check },
      { value: 'false', label: falseLabel, icon: X },
      ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff }] : []),
    ],
    counts,
  };
}
