import type { FacetResult } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { Check, CircleOff, X } from 'lucide-react';
import { TONE_TO_BADGE, type StatusUi } from '../../Mantenimiento/lib/status-presentation';

/**
 * Presentación del estado activo/inactivo de los catálogos de Configuración (etiqueta, tono e ícono).
 * Módulo sin directiva: lo usan las celdas, las opciones del filtro y el export, para que digan lo mismo.
 */

export { TONE_TO_BADGE };

export const ACTIVE_STATUS_UI: Record<'true' | 'false', StatusUi> = {
  true: { label: 'Activo', tone: 'ok', icon: Check },
  false: { label: 'Inactivo', tone: 'neutral', icon: X },
};

export const UNASSIGNED_STATUS_UI: StatusUi = { label: 'Sin asignar', tone: 'neutral', icon: CircleOff };

/** Etiqueta de `is_active` (booleano nullable) para el export y las celdas de solo texto. */
export function activeStatusLabel(value: unknown): string {
  if (value === null || value === undefined) return UNASSIGNED_STATUS_UI.label;
  return ACTIVE_STATUS_UI[value ? 'true' : 'false'].label;
}

/** Opciones del filtro facetado de `is_active`; "Sin asignar" solo si hay filas sin valor. */
export function buildActiveFacetResult(counts: Map<string, number>): FacetResult {
  return {
    options: [
      { value: 'true', label: ACTIVE_STATUS_UI.true.label, icon: ACTIVE_STATUS_UI.true.icon },
      { value: 'false', label: ACTIVE_STATUS_UI.false.label, icon: ACTIVE_STATUS_UI.false.icon },
      ...(counts.has(NULL_FILTER_VALUE)
        ? [{ value: NULL_FILTER_VALUE, label: UNASSIGNED_STATUS_UI.label, icon: UNASSIGNED_STATUS_UI.icon }]
        : []),
    ],
    counts,
  };
}
