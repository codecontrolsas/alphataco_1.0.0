/**
 * Paginación acotada para las tablas de Operaciones.
 *
 * `parseSearchParams` devuelve `Number(...)` de lo que venga en la URL (enorme, negativo o `NaN`) y
 * `stateToPrismaParams` lo usa tal cual: un `?pageSize=1000000` trae la tabla entera. Esto acota el
 * tamaño de página y calcula el `skip` con el `take` ya acotado, para que sean coherentes.
 */

/** Tope de la página (como `page` es 0-indexed, también evita `skip` fuera del rango entero de Postgres). */
const MAX_PAGE_INDEX = 100_000;

export function clampedPageParams(
  state: { page: number; pageSize: number },
  { max = 200, fallback = 10 }: { max?: number; fallback?: number } = {}
) {
  const requested = Number.isFinite(state.pageSize) && state.pageSize >= 1 ? Math.floor(state.pageSize) : fallback;
  const take = Math.min(requested, max);
  const page = Number.isFinite(state.page) && state.page >= 0 ? Math.min(Math.floor(state.page), MAX_PAGE_INDEX) : 0;

  return { skip: page * take, take };
}
