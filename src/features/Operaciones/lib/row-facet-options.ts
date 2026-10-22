import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { FacetResult } from '@/shared/components/common/DataTable/types';
import {
  AlertTriangle,
  CalendarOff,
  CheckCircle2,
  CircleOff,
  Clock,
  ShieldCheck,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

/** Iconos del estado de la línea: los mismos en el filtro y en el badge de la celda (uno distinto por estado). */
export const rowStatusIcons: Record<string, LucideIcon> = {
  pendiente: Clock,
  sin_recursos_asignados: AlertTriangle,
  ejecutado: CheckCircle2,
  reprogramado: CalendarOff,
  cancelado: XCircle,
  en_certificacion: ShieldCheck,
};

export interface RowFacetOptions {
  /** Etiquetas de un enum: las opciones salen de sus claves (todas, aunque no tengan registros). */
  labels?: Record<string, string>;
  /** Iconos por valor de un enum. */
  icons?: Record<string, LucideIcon>;
  /** Un mismo icono para todas las opciones (columnas de recurso: empleado, equipo). */
  optionIcon?: LucideIcon;
  /** Etiqueta de la opción "sin valor" (solo aparece si hay registros nulos). */
  nullLabel?: string;
  /** Columna booleana nullable: opciones Sí / No. */
  bool?: boolean;
}

/** Lo que devuelven las acciones `get…SingleFacet` de las líneas del parte (conteos y opciones resueltas). */
interface RowFacetCounts {
  counts: Map<string, number>;
  resolvedOptions?: ReadonlyArray<{ value: string; label: string }>;
}

/**
 * Arma las opciones del filtro de una columna de líneas del parte a partir de lo que devolvió el servidor:
 * booleano (Sí / No), enum (`labels` e `icons`) o FK / texto (`resolvedOptions`), más "sin valor" si hay nulos.
 */
export function buildRowFacetResult(
  result: RowFacetCounts,
  { labels, icons, optionIcon, nullLabel = 'Sin asignar', bool }: RowFacetOptions = {}
): FacetResult {
  const base = bool
    ? [
        { value: 'true', label: 'Sí', icon: CheckCircle2 },
        { value: 'false', label: 'No', icon: XCircle },
      ]
    : labels
      ? Object.keys(labels).map((value) => ({
          value,
          label: labels[value] ?? value,
          ...(icons?.[value] ? { icon: icons[value] } : {}),
        }))
      : (result.resolvedOptions ?? []).map((option) => ({
          value: option.value,
          label: option.label,
          ...(optionIcon ? { icon: optionIcon } : {}),
        }));

  const options = [
    ...base,
    ...(result.counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: nullLabel, icon: CircleOff }] : []),
  ];
  return { options, counts: result.counts };
}
