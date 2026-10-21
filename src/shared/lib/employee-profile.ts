import 'server-only';

import { prismaSystem as prisma } from '@/shared/lib/prisma-system';

/**
 * El vínculo `profile.employee_id` visto AL REVÉS: dado un legajo, ¿qué profile lo tiene?
 *
 * Hay dos clases de profile con `employee_id` puesto y NO significan lo mismo:
 *
 * - El **usuario del sistema** al que un admin le vinculó el legajo desde Empresa → Usuarios.
 *   Es el que habilita el panel de indumentaria y el de taller, el que se banea al dar de baja
 *   el legajo, y el que hace que el legajo aparezca como "ya vinculado".
 * - El **operario del QR de mantenimiento**, que entra con una sesión ANÓNIMA. Su profile
 *   existe sólo porque las respuestas de checklist y los desvíos tienen FKs a `profile.id`, y
 *   lleva `employee_id` para que el claim de empresa de su sesión satisfaga la regla de
 *   pertenencia de `canUseCompanyAsTenant()` por la rama de empleado (ver
 *   `completeMaintenanceEmployeeAnonymousSession`). Se crea uno POR SESIÓN, así que un mismo
 *   legajo puede tener decenas.
 *
 * Las lecturas inversas quieren siempre la primera clase. Sin filtrar, un `findFirst` por
 * `employee_id` devuelve casi seguro un profile anónimo: se banearía la credencial equivocada,
 * se bloquearía la vinculación del legajo a su usuario real, o el legajo desaparecería del
 * buscador de vinculación.
 *
 * No hay FK entre `profile.credential_id` y `auth_user.id` (ver `prisma/schema.prisma`), así
 * que el filtro es una segunda consulta y no un join.
 *
 * Módulo server-only (NO son Server Actions).
 */

/** De un conjunto de profiles, los que corresponden a un usuario real (no a una sesión del QR). */
async function keepUserProfiles<T extends { credential_id: string | null }>(profiles: T[]): Promise<T[]> {
  const credentialIds = profiles.map((p) => p.credential_id).filter((id): id is string => Boolean(id));
  if (credentialIds.length === 0) return profiles;

  const anonymous = await prisma.user.findMany({
    where: { id: { in: credentialIds }, isAnonymous: true },
    select: { id: true },
  });
  if (anonymous.length === 0) return profiles;

  const anonymousIds = new Set(anonymous.map((u) => u.id));
  // Un profile sin credencial no es del QR (el QR siempre la escribe): cuenta como usuario.
  return profiles.filter((p) => !p.credential_id || !anonymousIds.has(p.credential_id));
}

/**
 * Profile del USUARIO del sistema vinculado a ese legajo, o `null` si no hay ninguno.
 * `excludeProfileId` sirve para preguntar "¿lo tiene OTRO usuario?".
 */
export async function findUserProfileByEmployee(
  employeeId: string,
  options?: { excludeProfileId?: string }
): Promise<{ id: string; credential_id: string | null } | null> {
  const candidates = await prisma.profile.findMany({
    where: {
      employee_id: employeeId,
      ...(options?.excludeProfileId ? { NOT: { id: options.excludeProfileId } } : {}),
    },
    select: { id: true, credential_id: true },
  });

  const [profile] = await keepUserProfiles(candidates);
  return profile ?? null;
}

/** Legajos que YA están vinculados a un usuario del sistema (los del QR no cuentan). */
export async function employeeIdsLinkedToUsers(): Promise<string[]> {
  const candidates = await prisma.profile.findMany({
    where: { employee_id: { not: null } },
    select: { id: true, credential_id: true, employee_id: true },
  });

  const userProfiles = await keepUserProfiles(candidates);
  return userProfiles.map((p) => p.employee_id).filter((id): id is string => Boolean(id));
}
