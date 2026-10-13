/** Destino por defecto tras ingresar. */
export const DEFAULT_AFTER_LOGIN_PATH = '/dashboard';

/** Caracteres de control y barra invertida: el navegador los ignora o los toma por `/`. */
const UNSAFE_CHARS = /[\u0000-\u001f\u007f\\]/;

/**
 * Devuelve `value` sólo si es una ruta interna segura; si no, el destino por defecto.
 *
 * `/login?next=` lo puede escribir cualquiera, así que aceptar un destino sin mirarlo sería un
 * redireccionamiento abierto. Los navegadores descartan tabulaciones y saltos de línea al
 * resolver una URL, así que `/\t/sitio.com` termina siendo `//sitio.com`: por eso se rechazan los
 * caracteres de control y la barra invertida, y además se comprueba que el destino resuelto siga
 * en el mismo origen. Una ruta de auth haría un bucle y también se descarta.
 */
export function safeNextPath(value: string | string[] | null | undefined): string {
  const candidate = (Array.isArray(value) ? value[0] : value)?.trim();
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//') || UNSAFE_CHARS.test(candidate)) {
    return DEFAULT_AFTER_LOGIN_PATH;
  }
  if (new URL(candidate, 'http://internal.invalid').origin !== 'http://internal.invalid') {
    return DEFAULT_AFTER_LOGIN_PATH;
  }
  if (candidate === '/login' || candidate.startsWith('/login?') || candidate.startsWith('/reset_password')) {
    return DEFAULT_AFTER_LOGIN_PATH;
  }
  return candidate;
}
