import 'server-only';

import { prismaBase as prisma } from '@/shared/lib/prisma';
import { prismaSystem } from '@/shared/lib/prisma-system';
import { getSessionUserId, isSessionAnonymous } from '@/shared/lib/session';
import { NoActiveCompanyError, getActiveCompanyId } from '@/shared/lib/tenant';
import {
  runWithTenantContext,
  type ActorOnlyContext,
  type TenantContext,
  type TenantTransactionOptions,
  type TenantTx,
} from '@/shared/lib/tenant-context';
import { cache } from 'react';

/**
 * Legajo de la sesión en la empresa activa, y si además es miembro (o dueño) de esa empresa. Una sola consulta con el
 * cliente de sistema: corre ANTES de tener contexto (con el contextual la resolución se esperaría a sí misma).
 *
 * La sesión anónima del QR de mantenimiento también tiene un profile con `employee_id`, pero no es la persona: no se le
 * fija legajo (mismo corte que `getClothingOperator`).
 */
async function resolveSessionEmployee(
  userId: string,
  companyId: string
): Promise<{ employeeId: string; isMember: boolean } | null> {
  if (await isSessionAnonymous()) return null;
  const rows = await prismaSystem.$queryRaw<{ employee_id: string; is_member: boolean }[]>`
    SELECT p.employee_id,
           (EXISTS (SELECT 1 FROM public.company c WHERE c.id = ${companyId}::uuid AND c.owner_id = p.id)
            OR EXISTS (SELECT 1 FROM public.share_company_users s
                       WHERE s.profile_id = p.id AND s.company_id = ${companyId}::uuid AND s.is_active)) AS is_member
    FROM public.profile p
    JOIN public.employees e ON e.id = p.employee_id AND e.company_id = ${companyId}::uuid
    WHERE p.credential_id = ${userId}::uuid
    LIMIT 1`;
  const row = rows[0];
  return row ? { employeeId: row.employee_id, isMember: row.is_member } : null;
}

/**
 * EL contexto de tenant del request: empresa activa + usuario + tipo de actor (+ legajo), resuelto una sola vez por
 * request.
 *
 * Lanza `NoActiveCompanyError` si no hay empresa activa utilizable, en lugar de dejar correr consultas sin contexto.
 * Tipo de actor: `guest` sin sesión; `employee` si la sesión tiene un legajo de la empresa activa y NO es miembro ni
 * dueño (el empleado del portal, también el operario de ropa o de taller); `user` en el resto. `employeeId` se fija
 * siempre que haya legajo, aunque sea miembro: así un usuario del dashboard que además es empleado ve lo suyo en el
 * portal. Los tipos `operator`, `api` y `job` los fijan sus propios puntos de entrada con `withTenantContext()`.
 *
 * Resolverlo acá (y no en cada action del portal) es lo que hace fallar CERRADO a la RLS por empleado: ninguna action
 * puede olvidarse de marcarlo.
 */
export const getTenantContext = cache(async (): Promise<TenantContext> => {
  // Sin sesion de usuario (QR, tests con la empresa simulada) el contexto igual lleva la empresa: userId queda null.
  const [companyId, userId] = await Promise.all([getActiveCompanyId(), getSessionUserId().catch(() => null)]);
  if (!userId) return { companyId, userId, kind: 'guest' };

  const employee = await resolveSessionEmployee(userId, companyId).catch(() => null);
  if (!employee) return { companyId, userId, kind: 'user' };
  return { companyId, userId, kind: employee.isMember ? 'user' : 'employee', employeeId: employee.employeeId };
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
 * Contexto de SOLO ACTOR para la sesión autenticada que todavía no tiene empresa activa (primer ingreso, o membresías
 * sin ninguna elegida). Sin él las consultas corren sin `app.user_id` y, con el rol de aplicación, la RLS le oculta
 * hasta su propio perfil: `createCompany` respondía «El usuario de sesión no tiene perfil» justo al usuario que el proxy
 * manda a crear su empresa.
 *
 * Falla CERRADO: devuelve contexto solo si la empresa falta de verdad (`NoActiveCompanyError`), hay usuario de sesión y
 * la sesión no es la anónima del QR. Si la empresa se resuelve, o falla por otra razón (sin request), devuelve null y
 * no degrada en silencio un request con empresa. El usuario sale de la sesión validada por Better Auth, nunca del
 * cliente; con la empresa vacía, las políticas solo dejan ver lo propio (perfil, membresías, empresas a las que
 * pertenece) y nada de negocio. Memoizado por request, como `getTenantContext`.
 */
export const getSessionActorContextOrNull = cache(async (): Promise<ActorOnlyContext | null> => {
  try {
    await getActiveCompanyId();
    return null;
  } catch (error) {
    if (!(error instanceof NoActiveCompanyError)) return null;
  }
  try {
    const userId = await getSessionUserId();
    if (!userId || (await isSessionAnonymous())) return null;
    return { companyId: null, userId, kind: 'user' };
  } catch {
    return null;
  }
});

/** Transacción interactiva con un contexto explícito (jobs por empresa, operarios, tests). */
export function withTenantContext<T>(
  ctx: TenantContext,
  fn: (tx: TenantTx) => Promise<T>,
  options?: TenantTransactionOptions
): Promise<T> {
  return runWithTenantContext(prisma, ctx, fn, options);
}
