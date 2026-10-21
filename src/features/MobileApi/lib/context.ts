import 'server-only';

import { auth } from '@/shared/lib/auth';
import { prismaSystem } from '@/shared/lib/prisma-system';
import { resolveDefaultCompanyId, writeCompanyClaim } from '@/shared/lib/session-claims';
import type { TenantContext } from '@/shared/lib/tenant-context';

export type MobileAuthResult =
  | { ok: true; ctx: TenantContext; sessionToken: string }
  | { ok: false; status: 401 | 403; code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NO_ACTIVE_COMPANY'; message: string };

/**
 * Contexto de una petición móvil: usuario y empresa SIEMPRE del servidor (el token identifica la sesión; la empresa
 * sale del claim de esa sesión). No reutiliza `getTenantContext` porque ese lee `next/headers` y la cookie.
 *
 * - Sin sesión válida (token ausente, vencido o mal firmado): 401.
 * - Sesión anónima (el operario del QR): 403, la app móvil es para usuarios con cuenta.
 * - Usuario dado de baja: se vuelve a leer en cada petición, porque el token dura días y el ban solo corta el login.
 */
export async function resolveMobileContext(req: Request): Promise<MobileAuthResult> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return { ok: false, status: 401, code: 'UNAUTHENTICATED', message: 'Sesión inexistente o vencida.' };
  if (session.user.isAnonymous) {
    return { ok: false, status: 403, code: 'FORBIDDEN', message: 'La app móvil requiere un usuario con cuenta.' };
  }

  const user = await prismaSystem.user.findUnique({
    where: { id: session.user.id },
    select: { banned: true, banExpires: true },
  });
  if (!user || (user.banned && (!user.banExpires || user.banExpires > new Date()))) {
    return { ok: false, status: 401, code: 'UNAUTHENTICATED', message: 'El usuario no está habilitado.' };
  }

  let companyId: string | null = session.session.company ?? null;
  if (!companyId) {
    // Mismo rescate que el middleware web: lo sumaron a una empresa después de abrir la sesión.
    companyId = await resolveDefaultCompanyId(session.user.id);
    if (companyId) {
      try {
        await writeCompanyClaim(session.session.token, companyId);
      } catch {
        return { ok: false, status: 401, code: 'UNAUTHENTICATED', message: 'La sesión ya no existe.' };
      }
    }
  }
  if (!companyId) {
    return { ok: false, status: 403, code: 'NO_ACTIVE_COMPANY', message: 'El usuario no tiene una empresa activa.' };
  }

  return { ok: true, ctx: { companyId, userId: session.user.id, kind: 'user' }, sessionToken: session.session.token };
}
