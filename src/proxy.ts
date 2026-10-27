import { Logger } from '@/lib/logger';
import { auth } from '@/shared/lib/auth';
import { prismaSystem } from '@/shared/lib/prisma-system';
import { resolveDefaultCompanyId, writeCompanyClaim } from '@/shared/lib/session-claims';
import { NextResponse, type NextRequest } from 'next/server';

const logger = new Logger('Proxy');

/**
 * Proxy de Next.js 16 (el ex-middleware). Corre en runtime Node, así que puede leer la sesión
 * de Better Auth directamente contra la base — ya no hace falta el cliente SSR de Supabase que
 * refrescaba el JWT en cada request.
 *
 * Responsabilidades:
 * 1. Verificar autenticación para /dashboard/* y /manual
 * 2. Mandar al operario anónimo (QR) a /maintenance
 * 3. Verificar que el usuario tenga empresa, por el claim de la sesión
 *
 * Notas:
 * - /maintenance/* NO está protegido (acceso anónimo para empleados con CUIL)
 * - Los permisos por rol se manejan con PermissionGuard y role_permissions en BD
 * - Ya NO se siembra la cookie `actualComp` acá: el claim de empresa se resuelve en el alta de
 *   sesión (`session.create.before`) y `getActiveCompanyId()` lo prefiere sobre la cookie, así
 *   que sembrarla era redundante.
 */
export async function proxy(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  // 1. Verificar autenticación
  if (!session?.user.id) {
    logger.debug('Usuario no autenticado, redirigiendo a login');
    // Se recuerda adónde iba para volver ahí después de ingresar (el login valida el destino).
    const loginUrl = new URL('/login', req.url);
    if (req.method === 'GET') loginUrl.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  // 2. Usuarios anónimos no pueden acceder a /dashboard, redirigir a /maintenance
  if (session.user.isAnonymous) {
    logger.debug('Usuario anónimo intentando acceder a dashboard, redirigiendo a maintenance');
    return NextResponse.redirect(new URL('/maintenance', req.url));
  }

  // 3. Solo empleado (legajo vinculado, sin ser miembro activo ni duenio de ninguna empresa): no es usuario del
  //    dashboard. Va al portal de empleados. Se mira ANTES del claim: el alta de sesion le estampa la empresa del
  //    legajo, y con eso ya pasaba al dashboard (sin permisos, pero adentro).
  if (await isEmployeeOnly(session.user.id)) {
    logger.debug('Usuario solo empleado intentando acceder a dashboard, redirigiendo al portal');
    return NextResponse.redirect(new URL('/portal', req.url));
  }

  // 4. Empresa: el claim lo estampó el servidor al abrir la sesión. Si está vacío puede ser que
  //    el usuario no tenga ninguna, o que lo hayan sumado a una DESPUÉS de abrir la sesión: se
  //    reintenta resolver contra la base y, si aparece, se estampa. Sin este auto-rescate el
  //    invitado a una empresa quedaría rebotando contra /dashboard/configuration/companies/new hasta relogearse.
  if (!session.session.company) {
    const resolved = await resolveDefaultCompanyId(session.user.id);

    if (resolved) {
      try {
        await writeCompanyClaim(session.session.token, resolved);
      } catch {
        // La sesión desapareció entre el `getSession()` de arriba y esta escritura: logout en
        // otra pestaña, un ban que borra sesiones, un cambio de contraseña que cierra las
        // demás. `writeCompanyClaim` lanza a propósito (no queremos éxitos silenciosos), pero
        // acá eso sería un 500 en todo /dashboard/* en vez de mandar a iniciar sesión.
        logger.debug('La sesión desapareció mientras se estampaba el claim, redirigiendo a login');
        return NextResponse.redirect(new URL('/login', req.url));
      }
    } else if (!req.nextUrl.pathname.startsWith('/dashboard/configuration/companies/new')) {
      logger.debug('Usuario sin compañía, redirigiendo a crear compañía');
      return NextResponse.redirect(new URL('/dashboard/configuration/companies/new', req.url));
    }
  }

  // 5. Usuario autenticado con compañía - permitir acceso
  return NextResponse.next();
}

/** Una consulta: tiene legajo vinculado y ninguna membresia activa ni empresa propia. */
async function isEmployeeOnly(userId: string): Promise<boolean> {
  const rows = await prismaSystem.$queryRaw<{ employee_only: boolean }[]>`
    SELECT (p.employee_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM public.share_company_users s WHERE s.profile_id = p.id AND s.is_active)
            AND NOT EXISTS (SELECT 1 FROM public.company c WHERE c.owner_id = p.id)) AS employee_only
    FROM public.profile p
    WHERE p.credential_id = ${userId}::uuid
    LIMIT 1`;
  return rows[0]?.employee_only === true;
}

export const config = {
  // Proteger /dashboard/* y el manual (`/manual`, página propia fuera del dashboard: misma sesión y
  // empresa que el resto). /maintenance/* es público para usuarios anónimos.
  matcher: ['/dashboard/:path*', '/manual', '/manual/:path*'],
};
