import 'server-only';

import { fail, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { StockError } from '@/features/Warehouses/lib/stock-errors';
import { Prisma } from '@/generated/prisma/client';
import type { Logger } from '@/lib/logger';

/**
 * Error de una action de Gomeria que mueve stock (Almacenes etapa 6) -> `ActionResult`.
 *
 * Las actions DEVUELVEN el error en vez de lanzarlo: en produccion Next.js reemplaza el mensaje
 * de un error lanzado desde una server action por uno generico, y el operario tiene que leer
 * "la cubierta X no está en un depósito".
 *
 * - `StockError`: su mensaje.
 * - Unicidad (P2002): `duplicateMessage`.
 * - Otros errores de Prisma: se loguean y se devuelve un mensaje generico (nunca SQL crudo).
 * - `Error` comun: son las validaciones de negocio que Gomeria lanza con su texto para el usuario.
 */
export function toGomeriaActionError<T = null>(
  error: unknown,
  logger: Logger,
  context: string,
  duplicateMessage = 'Ya existe una cubierta con ese número de serie'
): ActionResult<T> {
  if (error instanceof StockError) return fail(error.message);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return fail(duplicateMessage);
  logger.error(`Error al ${context}`, { data: { error } });
  const isPrisma =
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientValidationError;
  if (!isPrisma && error instanceof Error && error.message) return fail(error.message);
  return fail(`No se pudo ${context}. Intentá de nuevo; si persiste, avisá a soporte.`);
}
