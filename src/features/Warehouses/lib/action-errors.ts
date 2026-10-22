import 'server-only';

import { fail, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { Prisma } from '@/generated/prisma/client';
import type { Logger } from '@/lib/logger';
import { StockError } from './stock-errors';

/**
 * Convierte un error de una action de Almacenes en el `ActionResult` que ve el usuario.
 *
 * - `StockError`: su mensaje, que ya trae los datos ("hay 12 l, se pidieron 20 l").
 * - Unicidad (P2002): el mensaje que corresponde a la entidad (`duplicateMessage`).
 * - Cualquier otro: se loguea y se devuelve un mensaje generico. NUNCA el mensaje crudo de
 *   Prisma o SQL, que no le sirve al usuario y expone detalles internos.
 *
 * Las actions DEVUELVEN el error en vez de lanzarlo: en produccion Next.js reemplaza el
 * mensaje de un error lanzado desde una server action por uno generico (spec §3.6).
 */
export function toActionError<T = null>(
  error: unknown,
  logger: Logger,
  context: string,
  duplicateMessage = 'Ya existe un registro con esos datos'
): ActionResult<T> {
  if (error instanceof StockError) return fail(error.message);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return fail(duplicateMessage);
  }
  logger.error(`Error al ${context}`, { data: { error } });
  return fail(`No se pudo ${context}. Intentá de nuevo; si persiste, avisá a soporte.`);
}

export const WAREHOUSE_PATH = '/dashboard/warehouse';

export const NO_PERMISSION = 'No tenés permiso para realizar esta acción';

/** Texto de un campo opcional del formulario: vacío -> `null`. */
export const nullable = (value: string) => (value.trim() ? value.trim() : null);

/** Primer mensaje de validacion de Zod, para el toast. */
export function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Datos inválidos';
}

/** Violacion de FK (P2003): otro registro todavia apunta al que se quiere borrar. */
export function isForeignKeyError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}
