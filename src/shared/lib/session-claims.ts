import 'server-only';

import { canUseCompanyAsTenant } from '@/shared/lib/company-membership';
import { prismaBase as prisma } from '@/shared/lib/prisma';

/**
 * ESCRITURA de los claims de sesión (`auth_session.company`, `auth_session.employee_id`).
 *
 * Es el único módulo que los escribe, y es `server-only`. No existe un endpoint HTTP
 * equivalente: en `shared/lib/auth.ts` los dos campos se declaran con `input: false`, así que
 * Better Auth los ignora en `updateSession`, en `updateUser` y en cualquier otro endpoint que
 * acepte campos de sesión. La invariante de `tenant.ts` —"el claim de empresa es de confianza
 * porque sólo lo escribe el servidor y siempre después de validar la pertenencia"— vive acá:
 * las dos funciones de escritura reciben una empresa ya validada por su llamador, y
 * `resolveDefaultCompanyId()` la resuelve contra la base sin mirar nada del cliente.
 *
 * Deliberadamente NO exporta nada que un Client Component pueda importar, ni se exporta desde
 * una Server Action: quien necesita cambiar de empresa pasa por `switchActiveCompany()`, que
 * valida con `canUseAsActiveCompany()` antes de llamar acá.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Empresa por defecto de un usuario, resuelta CONTRA LA BASE.
 *
 * La usa el hook `session.create.before` para estampar el claim inicial de toda sesión nueva
 * (login con contraseña, Google, y el invitado del QR). Devuelve `null` si el usuario no tiene
 * ninguna —entonces la sesión arranca sin claim y `getActiveCompanyId()` cae a la cookie, que
 * sí se revalida.
 *
 * ── POR QUÉ EL CLAIM ES CONFIABLE: esto es un subconjunto de `canUseCompanyAsTenant()` ────
 *
 * `getActiveCompanyId()` (tenant.ts) prefiere el claim y NO lo revalida; a la cookie, en
 * cambio, la pasa por `canUseAsActiveCompany()`. Que eso sea seguro no depende de que el
 * claim lo escriba el servidor —eso hace falta pero no alcanza—, sino de que **todo valor
 * que el servidor escribe como claim también habría pasado la regla de la cookie**. Sin esa
 * equivalencia, el claim sería una puerta más permisiva que la cookie y el perímetro
 * dependería de cuál de las dos ganó.
 *
 * Las tres ramas de acá se corresponden una a una con las de `canUseCompanyAsTenant()`:
 *
 *   | acá                                   | `canUseCompanyAsTenant()`                     |
 *   | ------------------------------------- | --------------------------------------------- |
 *   | `company.owner_id === profile.id`     | `canAccessCompany()`, rama owner              |
 *   | `share_company_users.is_active`       | `canAccessCompany()`, rama membresía activa   |
 *   | empresa del legajo del profile        | `hasEmployeeInCompany`                        |
 *
 * **Si alguien agrega una rama acá, tiene que existir la equivalente allá** (y viceversa), o
 * la invariante deja de valer sin que se rompa ningún test. Lo mismo para los otros dos
 * escritores de claims: `switchActiveCompany()` llama a `canUseAsActiveCompany()` de frente,
 * y el QR (`writeMaintenanceClaims()`) escribe además `profile.employee_id`, que es
 * justamente lo que hace que su claim caiga en la rama de empleado.
 *
 * Prioriza la empresa de la que es owner, después la membresía activa más vieja (orden
 * estable: el usuario entra siempre a la misma empresa) y por último la del legajo.
 */
export async function resolveDefaultCompanyId(userId: string): Promise<string | null> {
  if (!UUID_RE.test(userId)) return null;

  const profile = await prisma.profile.findUnique({
    where: { credential_id: userId },
    select: { id: true, employee_id: true },
  });
  if (!profile) return null;

  const owned = await prisma.company.findFirst({
    where: { owner_id: profile.id },
    select: { id: true },
    // `company` no tiene fecha de alta: el orden estable sale del id.
    orderBy: { id: 'asc' },
  });
  if (owned) return owned.id;

  const membership = await prisma.share_company_users.findFirst({
    where: { profile_id: profile.id, is_active: true },
    select: { company_id: true },
    orderBy: { created_at: 'asc' },
  });
  if (membership?.company_id) return membership.company_id;

  if (profile.employee_id) {
    const employee = await prisma.employees.findUnique({
      where: { id: profile.employee_id },
      select: { company_id: true },
    });
    if (employee?.company_id) return employee.company_id;
  }

  return null;
}

/**
 * ¿Puede `companyId` ser la empresa activa de `userId`? Misma regla que
 * `canUseAsActiveCompany()` (tenant.ts) pero sin depender de la sesión del request: la usan
 * las escrituras de claims que corren fuera de una petición del propio usuario.
 */
export async function canUserUseCompany(userId: string, companyId: string): Promise<boolean> {
  if (!UUID_RE.test(userId) || !UUID_RE.test(companyId)) return false;

  const profile = await prisma.profile.findUnique({
    where: { credential_id: userId },
    select: { id: true, employee_id: true },
  });
  if (!profile) return false;

  const [company, membership, employee] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { owner_id: true } }),
    prisma.share_company_users.findFirst({
      where: { profile_id: profile.id, company_id: companyId },
      select: { is_active: true },
    }),
    profile.employee_id
      ? prisma.employees.findFirst({ where: { id: profile.employee_id, company_id: companyId }, select: { id: true } })
      : Promise.resolve(null),
  ]);

  return canUseCompanyAsTenant({
    profileId: profile.id,
    company,
    membership,
    hasEmployeeInCompany: employee !== null,
  });
}

/**
 * Escribe el claim de empresa en la sesión identificada por su `token`.
 *
 * **El llamador tiene que haber validado la pertenencia**, y acá sólo se valida la forma del
 * uuid. Los tres llamadores la validan de maneras distintas pero equivalentes:
 * `switchActiveCompany()` con `canUseAsActiveCompany()`, `createCompany()` porque el usuario
 * acaba de quedar como `owner_id` en la misma transacción, y los logins de panel con el legajo
 * de la sesión. Ya no hay excepciones: el login del QR, que antes era la única, ahora escribe
 * también `profile.employee_id` y cae en la rama de empleado de `canUseCompanyAsTenant()`.
 */
export async function writeCompanyClaim(sessionToken: string, companyId: string | null): Promise<void> {
  if (companyId !== null && !UUID_RE.test(companyId)) {
    throw new Error('companyId debe ser un uuid');
  }
  const { count } = await prisma.session.updateMany({
    where: { token: sessionToken },
    data: { company: companyId },
  });
  // Si el token ya no existe (sesión vencida o cerrada entre la lectura y la escritura) el
  // `updateMany` devuelve 0 sin error: sin este chequeo el llamador reportaría éxito con el
  // claim sin escribir, que es el modo de falla más silencioso que puede tener el perímetro.
  if (count === 0) throw new Error('La sesión ya no existe: no se pudo fijar la empresa activa');
}

/**
 * Escribe los dos claims del QR de mantenimiento: empresa y legajo.
 *
 * Sólo lo llama `completeMaintenanceEmployeeAnonymousSession()`, DESPUÉS de comprobar que la
 * sesión es anónima, que el CUIL corresponde a un empleado activo y que ese empleado tiene
 * empresa asignada — la empresa sale SIEMPRE del legajo, nunca del vehículo escaneado. El
 * `employeeId` es el que atribuye las respuestas de checklist, así que va por el mismo camino
 * server-only que la empresa y no por un campo que el cliente pueda proponer.
 */
export async function writeMaintenanceClaims(
  sessionToken: string,
  claims: { companyId: string; employeeId: string }
): Promise<void> {
  if (!UUID_RE.test(claims.companyId) || !UUID_RE.test(claims.employeeId)) {
    throw new Error('Los claims de mantenimiento deben ser uuids');
  }
  const { count } = await prisma.session.updateMany({
    where: { token: sessionToken },
    data: { company: claims.companyId, employeeId: claims.employeeId },
  });
  if (count === 0) throw new Error('La sesión ya no existe: no se pudieron fijar los claims');
}
