'use server';

import { signInLinkedEmployee } from '@/features/Auth/lib/employee-login';
import { requirePortalEmployee } from '@/features/Portal/actions/perimeter';
import { isPortalEnabled } from '@/features/Portal/lib/feature-gate';
import { Logger } from '@/lib/logger';
import { auth } from '@/shared/lib/auth';
import { prismaSystem } from '@/shared/lib/prisma-system';
import { writeCompanyClaim } from '@/shared/lib/session-claims';
import { clearActiveCompanyCookie, setActiveCompanyCookie } from '@/shared/lib/tenant';
import { passwordSchema as portalPasswordSchema } from '@/shared/schemas/schemas';
import { APIError } from 'better-auth/api';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

const logger = new Logger('features/Portal/session');

/** Mismo texto para "no existe", "deshabilitado" o "de otra credencial": no confirma qué legajos tienen acceso. */
const NO_ACCESS_MESSAGE = 'Tu acceso al portal no está habilitado. Pedíselo a Recursos Humanos.';

/**
 * Login de `/portal`. Reusa el login de los accesos acotados (`signInLinkedEmployee`: Better Auth + legajo vinculado,
 * con el freno de fuerza bruta del hook de auth) y suma la regla del portal: el legajo tiene que tener el acceso
 * HABILITADO para esta credencial y estar activo. Si no, la sesión recién abierta se cierra (todo o nada).
 *
 * Después deja la empresa del LEGAJO como empresa activa (claim + cookie), igual que el panel de ropa: el claim que
 * estampa el alta de sesión podría ser otra empresa si la persona además es miembro de una.
 */
export async function portalLogin(email: string, password: string): Promise<{ error?: string; success?: boolean }> {
  if (!(await isPortalEnabled())) return { error: 'El portal no está disponible.' };

  const login = await signInLinkedEmployee(email, password, {
    requireCompany: true,
    onAuthFailure: () => logger.warn('Login del portal rechazado por credenciales'),
  });
  if ('error' in login) return { error: login.error };
  const { employee, userId } = login;

  // Antes de tener empresa activa no hay contexto RLS: se lee con el cliente de sistema y se filtra a mano.
  const [access, legajo] = await Promise.all([
    prismaSystem.employee_portal_access.findUnique({
      where: { employee_id: employee.id },
      select: { status: true, credential_id: true },
    }),
    prismaSystem.employees.findUnique({ where: { id: employee.id }, select: { is_active: true } }),
  ]);

  if (!access || access.status !== 'enabled' || access.credential_id !== userId || !legajo?.is_active) {
    await login.rejectSession();
    logger.info('Login del portal sin acceso habilitado', { data: { employeeId: employee.id } });
    return { error: NO_ACCESS_MESSAGE };
  }

  await writeCompanyClaim(login.sessionToken, employee.company_id);
  await setActiveCompanyCookie(employee.company_id);

  logger.info('Login del portal', { data: { employeeId: employee.id } });
  return { success: true };
}

/** Cierra la sesión del portal y vuelve al login. */
export async function portalLogout(): Promise<never> {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // Sin sesión válida el cierre es un no-op.
  }
  await clearActiveCompanyCookie();
  revalidatePath('/portal', 'layout');
  redirect('/portal/login');
}

/**
 * Cambio de contraseña voluntario desde "Perfil": pide la actual (Better Auth la verifica) y cierra las demás sesiones.
 * El cambio OBLIGATORIO tras una contraseña temporal va por `changePassword` (Auth), igual que en el dashboard.
 */
export async function changePortalPassword(
  currentPassword: string,
  newPassword: string
): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = portalPasswordSchema.safeParse(newPassword);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Contraseña inválida' };
  try {
    await requirePortalEmployee();
    await auth.api.changePassword({
      body: { currentPassword, newPassword: parsed.data, revokeOtherSessions: true },
      headers: await headers(),
    });
    return { success: true };
  } catch (error) {
    if (error instanceof APIError) return { success: false, error: 'La contraseña actual no es correcta.' };
    logger.error('Error al cambiar la contraseña del portal', { data: { error } });
    return { success: false, error: 'No se pudo cambiar la contraseña.' };
  }
}
