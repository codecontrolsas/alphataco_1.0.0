import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/lib/prisma';
import { withActor, type ActorTransactionOptions } from '@/shared/lib/actor';
import { getSessionUserId } from '@/shared/lib/session';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { withTenantContext } from '@/shared/lib/tenant-db';

/**
 * Transacción con el actor de sesión seteado (`app.user_id`), para las mutaciones de
 * Operaciones cuyas tablas tienen triggers de historial (`dailyreportrows_history`,
 * `preparte_change_logs`): sin el actor, el trigger guarda `changed_by = NULL`.
 *
 * Si además hay empresa activa, fija también `app.company_id` y `app.actor_kind` (el contexto que
 * leerán las políticas RLS; hoy nadie lo lee). Si no se puede resolver la empresa, sigue como antes,
 * solo con el actor.
 *
 * Módulo server-only (NO es una Server Action). Si no hay sesión abre igual la
 * transacción, sin actor — es el comportamiento que ya tenía el historial cuando el
 * cambio lo hace un proceso del sistema.
 */
export async function withSessionActor<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: ActorTransactionOptions
): Promise<T> {
  const userId = await getSessionUserId();
  if (!userId) {
    return prisma.$transaction(fn, options);
  }
  const companyId = await getActiveCompanyId().catch(() => null);
  if (!companyId) return withActor(userId, fn, prisma, options);
  return withTenantContext({ companyId, userId, kind: 'user' }, fn, options);
}
