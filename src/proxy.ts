import { legacyManualRedirectHref } from '@/features/Ayuda/Manual/lib/manual-urls';
import { routeModules } from '@/features/Modules/catalog';
import { Logger } from '@/lib/logger';
import { auth } from '@/shared/lib/auth';
import { getInstanceControlsCached } from '@/shared/lib/instance-controls';
import { INSTANCE_PAUSED_CODE, pauseMessageOf } from '@/shared/lib/instance-controls-core';
import { PAUSED_PAGE_PATH, classifyPausePath } from '@/shared/lib/instance-pause-paths';
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
 * 4. Redirigir los enlaces viejos `?tab=manual` de cualquier ruta del dashboard a `/manual`
 * 5. Responder 404 a las páginas de un módulo apagado para la empresa (F3, prefijo de ruta del catálogo), antes de
 *    renderizar: el módulo «no existe» para esa empresa (sin página de «no contratado», que filtraría el catálogo)
 * 0. Antes que todo, la pausa de la instancia (modo mantenimiento, la opera TaskApp): en pausa las páginas se
 *    reescriben a «Sistema en pausa temporal» y las APIs de usuario, móvil y externa responden 503 `INSTANCE_PAUSED`.
 *    Qué queda exento (API de administración, health, jobs, auth, pantallas de ingreso): `instance-pause-paths.ts`.
 *    La lectura es de memoria (caché de proceso de 5 s): no suma una consulta por request.
 *
 * Notas:
 * - /maintenance/* NO está protegido (acceso anónimo para empleados con CUIL)
 * - Los permisos por rol se manejan con PermissionGuard y role_permissions en BD
 * - Ya NO se siembra la cookie `actualComp` acá: el claim de empresa se resuelve en el alta de
 *   sesión (`session.create.before`) y `getActiveCompanyId()` lo prefiere sobre la cookie, así
 *   que sembrarla era redundante.
 */
export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // 0. Pausa de la instancia: corre para todas las rutas del matcher (no solo el dashboard).
  const routeKind = classifyPausePath(pathname);
  if (routeKind !== 'exempt') {
    const { pause } = await getInstanceControlsCached();
    if (pause.active) return pausedResponse(req, routeKind, pauseMessageOf(pause));
  }

  // Lo que sigue (sesión, empresa, módulos) es solo del dashboard y del manual.
  if (!requiresSession(pathname)) return NextResponse.next();

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

  // 2b. Enlace viejo al manual (`?tab=manual[&guide=…]`) en cualquier ruta del dashboard: va a `/manual`, que valida el
  //     permiso. Antes de las consultas de abajo, que la página del manual vuelve a hacer.
  const manualHref = legacyManualRedirectHref(req.nextUrl.pathname, req.nextUrl.searchParams);
  if (manualHref) return NextResponse.redirect(new URL(manualHref, req.url));

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
  let companyId = session.session.company ?? null;
  if (!companyId) {
    const resolved = await resolveDefaultCompanyId(session.user.id);

    if (resolved) {
      try {
        await writeCompanyClaim(session.session.token, resolved);
        companyId = resolved;
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

  // 5. Módulo apagado (F3): 404 real antes de renderizar. Las rutas del núcleo no consultan nada.
  const required = routeModules(req.nextUrl.pathname);
  if (required && !(await anyModuleEnabled(companyId, required))) {
    logger.debug('Ruta de un módulo apagado, 404', { data: { path: req.nextUrl.pathname, required } });
    return moduleNotFound(req);
  }

  // 6. Usuario autenticado con compañía - permitir acceso
  return NextResponse.next();
}

/**
 * ¿Alguna de las claves está encendida para la empresa? Una consulta (`app_enabled_modules`, la misma fórmula que los
 * permisos). Si la base falla no se corta: la página igual filtra por permisos (que ya excluyen el módulo apagado).
 */
async function anyModuleEnabled(companyId: string | null, keys: readonly string[]): Promise<boolean> {
  try {
    const rows = await prismaSystem.$queryRaw<{ enabled: boolean }[]>`
      SELECT public.app_enabled_modules(${companyId}::uuid) && ${keys}::text[] AS enabled`;
    return rows[0]?.enabled === true;
  } catch (error) {
    logger.error('No se pudo leer el estado de los módulos en el proxy', { data: { error } });
    return true;
  }
}

/** Rutas que exigen sesión y empresa (las del matcher original). */
function requiresSession(pathname: string): boolean {
  return (
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/') ||
    pathname === '/manual' ||
    pathname.startsWith('/manual/')
  );
}

/**
 * Respuesta en pausa. APIs: 503 `INSTANCE_PAUSED` con el mensaje. Páginas: se reescribe a la pantalla de pausa (la URL
 * no cambia); la página la sirve Next con su propio status (200: el App Router no deja fijar un 503 desde una página).
 */
function pausedResponse(req: NextRequest, kind: 'api' | 'page', message: string): NextResponse {
  const headers = { 'Retry-After': '120', 'Cache-Control': 'no-store' };
  if (kind === 'api') {
    return NextResponse.json({ error: { code: INSTANCE_PAUSED_CODE, message } }, { status: 503, headers });
  }
  return NextResponse.rewrite(new URL(PAUSED_PAGE_PATH, req.url), { headers });
}

/** 404 con la página de «no encontrado» de la app: se reescribe a una ruta que no existe. */
function moduleNotFound(req: NextRequest): NextResponse {
  return NextResponse.rewrite(new URL('/_modulo-no-disponible', req.url), { status: 404 });
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
  // Todas las rutas salvo los estáticos: la pausa de la instancia corta cualquier página o API. La sesión y la empresa
  // se exigen solo en /dashboard/* y en el manual (`requiresSession`); /maintenance/* sigue público para anónimos.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|webmanifest|js|css|map|woff2?)$).*)',
  ],
};
