/**
 * URL base pública de la app, resuelta en RUNTIME desde el entorno del servidor.
 *
 * Una misma imagen Docker sirve para cualquier dominio: ninguna `NEXT_PUBLIC_*` puede determinar la URL
 * (esas se hornean en el bundle durante `next build`). Lo usan Better Auth (`baseURL`), los enlaces de
 * los mails y de los jobs. El navegador usa `window.location.origin` (ver `shared/hooks/useAppOrigin`).
 *
 * Orden: `APP_BASE_URL` y, por compatibilidad con instancias ya desplegadas, `NEXT_PUBLIC_BASE_URL`
 * leída del ENTORNO del proceso (acceso dinámico: Next no la inlinea). Sin ninguna, `http://localhost:3000`.
 */

export const DEFAULT_APP_BASE_URL = 'http://localhost:3000';

/** Normaliza un valor de entorno: solo `http(s)`, sin barras finales. `undefined` si está vacío o no es una URL. */
export function normalizeBaseUrl(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  } catch {
    return undefined;
  }
  return value.replace(/\/+$/, '');
}

/** Resuelve la URL base desde un entorno dado (inyectable para los tests). */
export function resolveAppBaseUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  const legacyKey = ['NEXT_PUBLIC', 'BASE_URL'].join('_');
  return normalizeBaseUrl(env.APP_BASE_URL) ?? normalizeBaseUrl(env[legacyKey]);
}

/** URL base de la app (sin barra final), con `http://localhost:3000` si el entorno no define ninguna. */
export function appBaseUrl(env: Record<string, string | undefined> = process.env): string {
  return resolveAppBaseUrl(env) ?? DEFAULT_APP_BASE_URL;
}
