import type { DataTableFilterOption, FacetResult } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { LucideIcon } from 'lucide-react';
import { CircleOff } from 'lucide-react';
import moment from 'moment';

/**
 * Piezas de cliente compartidas por los listados de vehículos (activos y dados de baja): armado de resultados de
 * faceta y formato de fechas. Sin dependencias de servidor, así que se puede importar desde componentes cliente.
 */

// ============================================================================
// FACETAS
// ============================================================================

export function buildFkFacetResult(
  resolvedOptions: { value: string; label: string }[] | undefined,
  counts: Map<string, number>,
  nullLabel = 'Sin asignar'
): FacetResult {
  const options: DataTableFilterOption[] = (resolvedOptions ?? []).map((o) => ({ value: o.value, label: o.label }));
  if (counts.has(NULL_FILTER_VALUE)) {
    options.push({ value: NULL_FILTER_VALUE, label: nullLabel, icon: CircleOff });
  }
  return { options, counts };
}

export function buildEnumFacetResult(
  enumValues: string[],
  labels: Record<string, string>,
  counts: Map<string, number>,
  icons?: Record<string, LucideIcon | undefined>,
  nullLabel = 'Sin asignar'
): FacetResult {
  const options: DataTableFilterOption[] = enumValues.map((v) => ({
    value: v,
    label: labels[v] ?? v,
    ...(icons?.[v] ? { icon: icons[v] } : {}),
  }));
  if (counts.has(NULL_FILTER_VALUE)) {
    options.push({ value: NULL_FILTER_VALUE, label: nullLabel, icon: CircleOff });
  }
  return { options, counts };
}

/** Construye FacetResult para booleanos con labels e iconos custom. */
export function buildBooleanFacetResult(
  trueLabel: string,
  falseLabel: string,
  trueIcon: LucideIcon,
  falseIcon: LucideIcon,
  counts: Map<string, number>
): FacetResult {
  return {
    options: [
      { value: 'true', label: trueLabel, icon: trueIcon },
      { value: 'false', label: falseLabel, icon: falseIcon },
    ],
    counts,
  };
}

// ============================================================================
// FECHAS
// ============================================================================

/**
 * Columna `@db.Date`: llega como medianoche UTC, así que se lee en UTC para no correr el día en un navegador
 * al oeste de UTC (Argentina).
 */
export function formatDbDate(value: unknown): string {
  return value ? moment.utc(value as string | Date).format('DD/MM/YYYY') : '';
}

/** Timestamp (`created_at`, fecha del último checklist): el día en hora argentina, en el servidor y en el navegador. */
export function formatTimestampDay(value: unknown): string {
  return value ? formatArgentinaDay(value as string | Date) : '';
}
