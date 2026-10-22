import 'server-only';

import { fail, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { TreasuryError } from '@/features/Treasury/lib/treasury-errors';
import { StockError } from '@/features/Warehouses/lib/stock-errors';
import { Prisma } from '@/generated/prisma/client';
import type { Logger } from '@/lib/logger';
import { PurchaseError } from './purchase-errors';

/**
 * Error de una action de Compras -> `ActionResult`. Las actions DEVUELVEN el error en vez de
 * lanzarlo: en produccion Next.js reemplaza el mensaje de un error lanzado por uno generico.
 *
 * - `PurchaseError`: su mensaje.
 * - `StockError`: su mensaje (lo lanza `validateExitDestination`, compartido con Almacenes).
 * - `TreasuryError`: su mensaje (lo lanza el libro de movimientos de Tesoreria al pagar).
 * - Unicidad (P2002): `duplicateMessage`.
 * - Cualquier otro: se loguea y se devuelve un mensaje generico, nunca SQL crudo.
 */
export function toPurchaseActionError<T = null>(
  error: unknown,
  logger: Logger,
  context: string,
  duplicateMessage = 'Ya existe un registro con esos datos'
): ActionResult<T> {
  if (error instanceof PurchaseError || error instanceof StockError || error instanceof TreasuryError)
    return fail(error.message);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return fail(duplicateMessage);
  logger.error(`Error al ${context}`, { data: { error } });
  return fail(`No se pudo ${context}. Intentá de nuevo; si persiste, avisá a soporte.`);
}

/** Primer mensaje de validacion de Zod, para el toast. */
export function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Datos inválidos';
}

export const NO_PERMISSION = 'No tenés permiso para realizar esta acción';

/** Un id que no es uuid haria fallar la query de Prisma: se responde como "no existe". */

/** Ruta del módulo: las acciones revalidan desde acá. */
export const PURCHASES_PATH = '/dashboard/purchases';

export const SESSION_EXPIRED = 'Tu sesión expiró. Volvé a ingresar.';

/** Transacciones con varias escrituras (recepciones, facturas, pagos): el motor de stock puede tardar. */
export const TRANSACTION_OPTIONS = { timeout: 20_000, maxWait: 5_000 };
