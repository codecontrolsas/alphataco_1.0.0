/**
 * Lista blanca de filtros de un DataTable.
 *
 * `parseSearchParams` convierte CUALQUIER clave de la URL en un filtro y `buildFiltersWhere` la usa como
 * campo de Prisma (`where[clave] = valor`): sin lista blanca, `?company_id=<otra empresa>` pisaría el
 * perímetro de la consulta. Cada tabla declara las claves que realmente filtra y el resto se descarta
 * ANTES de armar el `where`.
 */

/** Claves `<col>_from` / `<col>_to` de las columnas con filtro de rango de fechas. */
export function dateRangeKeys(dateColumns: readonly string[]): string[] {
  return dateColumns.flatMap((column) => [`${column}_from`, `${column}_to`]);
}

/**
 * Devuelve una copia del estado que conserva solo los filtros cuya clave está en `allowedKeys`.
 * No muta el estado recibido.
 */
export function sanitizeFilters<State extends { filters: Record<string, string[]> }>(
  state: State,
  allowedKeys: ReadonlySet<string> | readonly string[]
): State {
  const allowed = allowedKeys instanceof Set ? allowedKeys : new Set<string>(allowedKeys);
  const filters: Record<string, string[]> = {};

  for (const [key, values] of Object.entries(state.filters)) {
    if (allowed.has(key)) filters[key] = values;
  }

  return { ...state, filters };
}
