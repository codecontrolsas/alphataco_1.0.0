import 'server-only';

import type { PortalEmployee } from '@/features/Portal/actions/perimeter';
import { clearAttempts, consumeAttempt } from '@/shared/lib/login-rate-limit';
import { prismaSystem } from '@/shared/lib/prisma-system';
import { verifyPassword } from 'better-auth/crypto';
import { headers } from 'next/headers';

/**
 * Firma simple del portal: el empleado confirma con SU contraseña dentro de la MISMA acción que registra lo firmado
 * (aceptar un documento HSE, firmar una constancia). Junto con la firma se guardan la IP y el navegador del request
 * (nunca del cliente) y la hora del servidor. Módulo server-only: lo usan las acciones del portal.
 */

/** Freno de contraseñas: 5 intentos fallidos cada 15 minutos por persona y por tipo de firma (como el login). */
const PASSWORD_RULE = { max: 5, windowSeconds: 15 * 60 };

async function verifyEmployeePassword(employee: PortalEmployee, password: string): Promise<boolean> {
  // Las tablas `auth_*` están cerradas al rol de la app: se leen con el cliente de sistema (como el login del portal).
  const account = await prismaSystem.account.findFirst({
    where: { userId: employee.userId, providerId: 'credential' },
    select: { password: true },
  });
  if (!account?.password) return false;
  return verifyPassword({ hash: account.password, password });
}

/** Verifica la contraseña con freno de intentos. Devuelve el error para el usuario, o `null` si es correcta. */
export async function checkSignaturePassword(
  employee: PortalEmployee,
  password: string,
  scope: 'hse-ack' | 'hse-certificate'
): Promise<string | null> {
  const key = `${scope}:${employee.userId}`;
  const attempt = consumeAttempt(key, PASSWORD_RULE);
  if (!attempt.allowed) {
    return `Demasiados intentos. Probá de nuevo en ${Math.ceil(attempt.retryAfterSeconds / 60)} minutos.`;
  }
  if (!(await verifyEmployeePassword(employee, password))) return 'La contraseña no es correcta.';
  clearAttempts(key);
  return null;
}

/** IP y navegador del request que firma (los pone el proxy y el navegador; nunca un campo del formulario). */
export async function requestFingerprint() {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
  const userAgent = h.get('user-agent')?.slice(0, 500) ?? null;
  return { ip: ip?.slice(0, 100) ?? null, userAgent };
}
