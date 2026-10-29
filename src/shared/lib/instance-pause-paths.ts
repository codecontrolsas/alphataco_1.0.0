/**
 * Qué rutas corta la pausa de la instancia (modo mantenimiento). Puro: lo usan el proxy y sus tests.
 *
 * - `exempt`: siguen funcionando en pausa. La API de administración (TaskApp opera la instancia, incluida la
 *   pausa), `/api/health` (monitoreo), `/api/jobs/*` (el servicio `cron`), `/api/auth/*` (Better Auth: ingresar y
 *   salir siguen andando; adentro se ve la pantalla de pausa), las pantallas de ingreso (muestran el mensaje) y la
 *   propia pantalla de pausa.
 * - `api`: el resto de `/api/*` (móvil, externa, archivos, eventos de TaskApp, lo que se agregue): 503 `INSTANCE_PAUSED`.
 * - `page`: toda otra página: se reescribe a la pantalla «Sistema en pausa temporal» con 503.
 */

/** Ruta interna de la pantalla de pausa (el proxy reescribe acá). */
export const PAUSED_PAGE_PATH = '/sistema-en-pausa';

const EXEMPT_API_PREFIXES = ['/api/admin/', '/api/health', '/api/jobs/', '/api/auth/'] as const;

/** Pantallas de ingreso: en pausa se pueden abrir y muestran el mensaje (`AuthShell`). */
const LOGIN_PAGES = new Set(['/login', '/portal/login', '/operator/login', '/clothing/login']);

export type PauseRouteKind = 'exempt' | 'api' | 'page';

function hasPrefix(pathname: string, prefix: string): boolean {
  // `/api/health` también cubre `/api/health/...`, pero no `/api/healthz`.
  return prefix.endsWith('/')
    ? pathname.startsWith(prefix) || pathname === prefix.slice(0, -1)
    : pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function classifyPausePath(pathname: string): PauseRouteKind {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  if (path === '/api' || path.startsWith('/api/')) {
    return EXEMPT_API_PREFIXES.some((prefix) => hasPrefix(path, prefix)) ? 'exempt' : 'api';
  }
  if (path.startsWith('/_next/')) return 'exempt';
  if (path === PAUSED_PAGE_PATH || LOGIN_PAGES.has(path)) return 'exempt';
  return 'page';
}
