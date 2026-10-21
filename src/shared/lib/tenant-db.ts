import 'server-only';

import { prismaBase as prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import {
  createTenantClient,
  runWithTenantContext,
  type TenantContext,
  type TenantTransactionOptions,
  type TenantTx,
} from '@/shared/lib/tenant-context';
import { cache } from 'react';

/**
 * EL contexto de tenant del request: empresa activa + usuario + tipo de actor, resuelto una sola vez por request.
 *
 * Lanza `NoActiveCompanyError` si no hay empresa activa utilizable, en lugar de dejar correr consultas sin contexto.
 * Hoy el tipo de actor es `user` con sesión y `guest` sin ella; los tipos `operator`, `api` y `job` los fijan sus
 * propios puntos de entrada con `withTenantContext()` cuando migren.
 */
export const getTenantContext = cache(async (): Promise<TenantContext> => {
  // Sin sesion de usuario (QR, tests con la empresa simulada) el contexto igual lleva la empresa: userId queda null.
  const [companyId, userId] = await Promise.all([getActiveCompanyId(), getSessionUserId().catch(() => null)]);
  return { companyId, userId, kind: userId ? 'user' : 'guest' };
});

/** Como `getTenantContext`, pero devuelve null en vez de lanzar (login, jobs, cache sin request). Lo usa `prisma`. */
export async function getTenantContextOrNull(): Promise<TenantContext | null> {
  try {
    return await getTenantContext();
  } catch {
    return null;
  }
}

/**
 * Cliente de Prisma para leer y escribir una sola operación por vez con el contexto del request fijado.
 * Para varias operaciones atómicas usar `withTenantTx`. Dentro del callback de `withTenantTx` NO usar `getDb()`:
 * se saldría de la transacción.
 */
export const getDb = cache(async () => createTenantClient(prisma, await getTenantContext()));

/** Transacción interactiva con el contexto del request. Reemplaza a `withActor` / `withSessionActor`. */
export async function withTenantTx<T>(
  fn: (tx: TenantTx) => Promise<T>,
  options?: TenantTransactionOptions
): Promise<T> {
  return runWithTenantContext(prisma, await getTenantContext(), fn, options);
}

/** Igual que `withTenantTx` con un contexto explícito (jobs por empresa, API externa, operarios). */
export function withTenantContext<T>(
  ctx: TenantContext,
  fn: (tx: TenantTx) => Promise<T>,
  options?: TenantTransactionOptions
): Promise<T> {
  return runWithTenantContext(prisma, ctx, fn, options);
}
