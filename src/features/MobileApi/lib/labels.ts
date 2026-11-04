import { conditionLabels, employeeStatusBadges, employeeStatusLabels } from '@/shared/utils/mappers';
import moment from 'moment';
import { z } from 'zod';

/**
 * Piezas de presentación comunes a los contratos de la API móvil (módulo puro, sin `server-only`): el estado con tono
 * que pinta la app, los cursores opacos y la lectura de columnas `@db.Date`.
 */

export type Tone = 'ok' | 'warn' | 'danger' | 'neutral';

const BADGE_TONE: Record<string, Tone> = { success: 'ok', yellow: 'warn', destructive: 'danger' };

/** Estado documental guardado en `employees.status` / `vehicles.status` / `other_equipment.status` (enum `status_type`). */
export function docStatusOf(status: string | null | undefined) {
  if (!status) return null;
  return {
    code: status,
    label: employeeStatusLabels[status] ?? status,
    tone: BADGE_TONE[employeeStatusBadges[status] ?? ''] ?? 'neutral',
  };
}

const CONDITION_TONE: Record<string, Tone> = {
  operativo: 'ok',
  operativo_condicionado: 'warn',
  en_reparacion: 'warn',
  en_preparacion: 'neutral',
  no_operativo: 'danger',
};

/** Condición operativa de un equipo (enum `condition_enum`, nombre de Prisma). */
export function conditionOf(condition: string | null | undefined) {
  if (!condition) return null;
  return { code: condition, label: conditionLabels[condition] ?? condition, tone: CONDITION_TONE[condition] ?? 'neutral' };
}

/** Columnas `@db.Date`: llegan como medianoche UTC y se leen en UTC (en hora argentina caerían el día anterior). */
export const isoDay = (value: Date | null | undefined) => (value ? moment.utc(value).format('YYYY-MM-DD') : null);

/**
 * Fecha y hora en hora argentina con el desfase explícito (`2026-11-04T21:30:00-03:00`): la app no tiene que adivinar
 * la zona. Argentina no tiene horario de verano, así que el desfase es siempre -03:00.
 */
export const argentinaDateTime = (value: Date | string) =>
  moment.utc(value).utcOffset(-180).format('YYYY-MM-DDTHH:mm:ssZ');

export class InvalidCursorError extends Error {}

/** Cursor opaco (base64url de JSON) validado con su schema al volver. */
export function encodeCursor<T>(value: T): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function decodeCursor<T>(raw: string | undefined, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T | null {
  if (!raw) return null;
  try {
    return schema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
  } catch {
    throw new InvalidCursorError('Cursor inválido');
  }
}
