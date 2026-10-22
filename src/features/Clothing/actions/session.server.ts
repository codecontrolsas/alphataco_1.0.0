'use server';

import { Logger } from '@/lib/logger';
import { auth } from '@/shared/lib/auth';
import { normalizeEmail, rejectLogin } from '@/shared/lib/auth-credentials';
import { prismaSystem } from '@/shared/lib/prisma-system';
import { getSessionToken } from '@/shared/lib/session';
import { writeCompanyClaim } from '@/shared/lib/session-claims';
import { clearActiveCompanyCookie, setActiveCompanyCookie } from '@/shared/lib/tenant';
import { APIError } from 'better-auth/api';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getClothingOperator, type ClothingOperator } from './perimeter';

const logger = new Logger('features/Clothing/session');

/**
 * Login de la ruta `/clothing` (panel del operario de ropa).
 *
 * Sólo exige que el usuario tenga un empleado vinculado (no pide sector de taller).
 * La empresa se deja en la cookie de empresa activa vía `setActiveCompanyCookie()` para
 * que el resto del dashboard la vea; el perímetro de las actions NO se apoya en esa
 * cookie, sale del empleado (`perimeter.ts`).
 */
export async function clothingLogin(email: string, password: string) {
  const requestHeaders = await headers();
  let userId: string;
  let sessionToken: string;

  try {
    const result = await auth.api.signInEmail({
      body: { email: normalizeEmail(email), password },
      headers: requestHeaders,
    });
    userId = result.user.id;
    sessionToken = result.token;
  } catch (error) {
    logger.warn('Clothing login auth failed', { data: { email } });
    if (error instanceof APIError) {
      return { error: error.body?.message ?? 'Correo o contraseña inválidos' };
    }
    return { error: 'No se pudo autenticar' };
  }

  // Login: todavia no hay empresa activa, asi que el perfil y el legajo se leen con el cliente de sistema.
  const profile = await prismaSystem.profile.findUnique({
    where: { credential_id: userId },
    select: { employee_id: true },
  });

  if (!profile?.employee_id) {
    await rejectLogin(sessionToken, requestHeaders);
    return { error: 'Tu usuario no tiene un empleado vinculado. Contacta al administrador.' };
  }

  const employee = await prismaSystem.employees.findUnique({
    where: { id: profile.employee_id },
    select: { id: true, company_id: true },
  });

  if (!employee) {
    await rejectLogin(sessionToken, requestHeaders);
    return { error: 'No se encontro el empleado vinculado. Contacta al administrador.' };
  }

  if (employee.company_id) {
    // La empresa activa tiene que ser la DEL LEGAJO, y para eso hay que escribir el claim: el
    // hook de alta de sesión ya estampó uno resolviendo owner → membresía → legajo, así que un
    // operario que además es miembro de otra empresa abría el panel en la equivocada. El claim
    // le gana a la cookie en `getActiveCompanyId()`, así que escribir sólo la cookie no
    // alcanzaba. La pertenencia está validada: la empresa sale del legajo vinculado al profile
    // de la sesión, que es la rama de empleado de `canUseCompanyAsTenant()`.
    const sessionToken = await getSessionToken();
    if (sessionToken) await writeCompanyClaim(sessionToken, employee.company_id);

    // El panel de ropa es un puesto fijo: la cookie dura un año como antes, no la hora
    // por defecto del helper (si expirara, los listados del panel se quedarían sin empresa).
    await setActiveCompanyCookie(employee.company_id, 60 * 60 * 24 * 365);
  }

  logger.info('Clothing login successful', { data: { userId } });
  return { success: true };
}

/**
 * Cierra la sesión del panel de ropa y vuelve al login.
 */
export async function clothingLogout() {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // Sin sesión válida el cierre es un no-op.
  }
  await clearActiveCompanyCookie();
  revalidatePath('/', 'layout');
  redirect('/clothing/login');
}

/**
 * Contexto del operario de ropa de la sesión para las páginas de `/clothing`.
 * Devuelve `null` si la sesión no tiene un empleado vinculado.
 */
export async function getClothingOperatorContext(): Promise<ClothingOperator | null> {
  return getClothingOperator();
}

export type ClothingOperatorContext = ClothingOperator;
