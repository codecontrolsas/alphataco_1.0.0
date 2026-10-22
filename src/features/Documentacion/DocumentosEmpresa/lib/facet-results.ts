import type { FacetResult } from '@/shared/components/common/DataTable/types';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { LucideIcon } from 'lucide-react';
import { Check, CircleOff, X } from 'lucide-react';

/**
 * Armado de `FacetResult` para los filtros de las listas de documentos de empresa (módulo sin
 * directiva: lo usan los componentes cliente de DocumentosEmpresa y de Empresa/General/Documentacion).
 */

type ResolvedOptions = Array<{ id: string; name: string | null }> | undefined;

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

/** FK: opciones resueltas por el servidor + counts. `icon` se aplica a todas las opciones. */
export function buildFkFacetResult(
  resolvedOptions: ResolvedOptions,
  counts: Map<string, number>,
  { nullLabel = 'Sin asignar', icon }: { nullLabel?: string; icon?: LucideIcon } = {}
): FacetResult {
  return {
    options: [
      ...(resolvedOptions?.map((o) => ({ value: o.id, label: o.name ?? '', ...(icon ? { icon } : {}) })) ?? []),
      ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: nullLabel, icon: CircleOff }] : []),
    ],
    counts,
  };
}

/** Booleano: Sí/No con iconos + counts. */
export function buildBooleanFacetResult(counts: Map<string, number>, trueLabel = 'Sí', falseLabel = 'No'): FacetResult {
  return {
    options: [
      { value: 'true', label: trueLabel, icon: Check },
      { value: 'false', label: falseLabel, icon: X },
    ],
    counts,
  };
}
