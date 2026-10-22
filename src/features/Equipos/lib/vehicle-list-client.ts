import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import moment from 'moment';

/**
 * Piezas de cliente compartidas por los listados de vehículos (activos y dados de baja): formato de fechas. Sin dependencias de servidor, así que se puede importar desde componentes cliente.
 */

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
