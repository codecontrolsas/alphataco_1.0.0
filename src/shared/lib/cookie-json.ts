/**
 * Lee el valor JSON de una cookie de preferencias (visibilidad de columnas, filtros guardados).
 * Una cookie corrupta o editada a mano no debe romper la pantalla: cae al valor por defecto.
 */
export function readCookieJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
