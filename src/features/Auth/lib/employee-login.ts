import 'server-only';

import { auth } from '@/shared/lib/auth';
import { normalizeEmail, rejectLogin } from '@/shared/lib/auth-credentials';
import { prismaSystem } from '@/shared/lib/prisma-system';
import { APIError } from 'better-auth/api';
import { headers } from 'next/headers';

interface EmployeeLoginOptions<RequireCompany extends boolean> {
  /** `true` si el acceso exige que el legajo tenga empresa (si no, alcanza con que exista). */
  requireCompany: RequireCompany;
  /** Se llama cuando Better Auth rechaza las credenciales (solo para dejar rastro en el log). */
  onAuthFailure?: () => void;
}

export type EmployeeLoginResult<RequireCompany extends boolean> =
  | { error: string }
  | {
      userId: string;
      /** Token de la sesión recién abierta (para escribirle claims sin depender de la cookie del request). */
      sessionToken: string;
      employee: { id: string; company_id: RequireCompany extends true ? string : string | null };
      /** Cierra la sesión recién abierta, para el acceso que rechaza al empleado después. */
      rejectSession: () => Promise<void>;
    };

/**
 * Primera parte común de los accesos acotados de un empleado (panel del operario y entrega de
 * indumentaria): autentica con Better Auth y resuelve el empleado vinculado al perfil.
 *
 * Si el usuario autentica pero no tiene empleado (o no cumple `requireCompany`), se le cierra
 * la sesión recién abierta con `rejectLogin`: entrar a estos paneles es todo o nada. Lo que
 * sigue (sectores, empresa activa, cookies) lo decide cada acceso.
 */
export async function signInLinkedEmployee<RequireCompany extends boolean>(
  email: string,
  password: string,
  options: EmployeeLoginOptions<RequireCompany>
): Promise<EmployeeLoginResult<RequireCompany>> {
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
    options.onAuthFailure?.();
    if (error instanceof APIError) {
      return { error: error.body?.message ?? 'Correo o contraseña inválidos' };
    }
    return { error: 'No se pudo autenticar' };
  }

  // `profile.credential_id` es el id de sesión: mismo criterio que `getServerAuthProfile()`.
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

  if (!employee || (options.requireCompany && !employee.company_id)) {
    await rejectLogin(sessionToken, requestHeaders);
    return { error: 'No se encontro el empleado vinculado. Contacta al administrador.' };
  }

  return {
    userId,
    sessionToken,
    employee: employee as { id: string; company_id: RequireCompany extends true ? string : string | null },
    rejectSession: () => rejectLogin(sessionToken, requestHeaders),
  };
}
