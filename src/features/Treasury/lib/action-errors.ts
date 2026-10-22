import 'server-only';

import { fail, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { PurchaseError } from '@/features/Purchases/lib/purchase-errors';
import { Prisma } from '@/generated/prisma/client';
import type { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { TreasuryError } from './treasury-errors';

export { NO_PERMISSION, firstIssue } from '@/features/Purchases/lib/action-errors';
export { UUID_RE } from '../schemas/shared';

/**
 * Error de una action de Tesorería -> `ActionResult` (mismo criterio que Compras: se DEVUELVE,
 * porque en producción Next.js reemplaza el mensaje de un error lanzado).
 */
export function toTreasuryActionError<T = null>(
  error: unknown,
  logger: Logger,
  context: string,
  duplicateMessage = 'Ya existe un registro con esos datos'
): ActionResult<T> {
  if (error instanceof TreasuryError || error instanceof PurchaseError) return fail(error.message);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return fail(duplicateMessage);
  logger.error(`Error al ${context}`, { data: { error } });
  return fail(`No se pudo ${context}. Intentá de nuevo; si persiste, avisá a soporte.`);
}

/** Perfil y empresa activa de quien llama, o `null` si la sesión venció. */
export async function treasurySession() {
  const profile = await getServerAuthProfile();
  if (!profile) return null;
  return { profile, companyId: await getActiveCompanyId() };
}

/** Las operaciones de cheques no se fechan a futuro. */
export function assertNotFuture(date: string, today: string) {
  if (date > today) throw new TreasuryError('La fecha no puede ser futura');
}
