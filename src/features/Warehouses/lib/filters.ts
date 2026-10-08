/**
 * Lista de permitidas para `buildFiltersWhere`.
 *
 * El helper compartido convierte CUALQUIER clave de filtro de la URL en `where[campo] = valor`.
 * Con una lista de excluidas, una columna que nadie excluyo (p. ej. `average_cost`) queda
 * filtrable aunque no se muestre: alguien sin `view_prices` podria deducir el costo exacto
 * probando valores y mirando si vuelven filas. Con una lista de permitidas, una columna nueva
 * no se vuelve filtrable por accidente.
 */
export function pickFilters(filters: Record<string, string[]>, allowed: readonly string[]): Record<string, string[]> {
  return Object.fromEntries(Object.entries(filters).filter(([key]) => allowed.includes(key)));
}
