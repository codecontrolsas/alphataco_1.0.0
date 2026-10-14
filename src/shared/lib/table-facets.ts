import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';

/**
 * Arma el mapa de conteos de una faceta (`valor → cantidad`). Una clave `null` o `undefined` se cuenta
 * bajo `NULL_FILTER_VALUE` ("Sin asignar"). Antes estaba copiada en 5 archivos de facets de Operaciones.
 */
export function toFacetMap(rows: ReadonlyArray<{ key: string | boolean | null | undefined; count: number }>) {
  const map = new Map<string, number>();
  for (const { key, count } of rows) {
    if (key == null) {
      map.set(NULL_FILTER_VALUE, (map.get(NULL_FILTER_VALUE) ?? 0) + count);
    } else {
      map.set(String(key), (map.get(String(key)) ?? 0) + count);
    }
  }
  return map;
}

/**
 * Estado de filtros de un DataTable SIN el filtro propio de `excludeColumn` (cross-filter): los counts de
 * una faceta no deben quedar condicionados por la selección de esa misma faceta. También quita sus
 * variantes de rango (`<col>_from`, `<col>_to`).
 */
export function withoutOwnFilter<State extends { filters: Record<string, unknown> }>(
  state: State,
  excludeColumn: string
): State {
  const filters = { ...state.filters };
  delete filters[excludeColumn];
  delete filters[`${excludeColumn}_from`];
  delete filters[`${excludeColumn}_to`];
  return { ...state, filters };
}

// ============================================================================
// Motor genérico de facetas de UNA columna (lazy-load)
// ============================================================================

export type FacetKey = string | boolean | null;
export type FacetRow = { key: FacetKey; count: number };
export type FacetOption = { value: string; label: string };

/** Faceta de una columna directa (enum, texto o booleano): el valor agrupado ES la opción. */
export type DirectFacet<Where> = { kind: 'direct'; group: (where: Where) => Promise<FacetRow[]> };

/**
 * Faceta de una FK: se agrupa por el id de la fila y se resuelve el nombre con UNA sola consulta de lookup.
 * `lookup` devuelve `idDeLaFila → opción`: para sector/área la fila apunta al pivote de servicio y la opción es el
 * sector/área real (que es lo que filtra el `where` de la tabla).
 */
export type LookupFacet<Where> = {
  kind: 'lookup';
  group: (where: Where) => Promise<FacetRow[]>;
  lookup: (ids: string[]) => Promise<Map<string, FacetOption>>;
};

export type FacetConfig<Where> = DirectFacet<Where> | LookupFacet<Where>;

/** Resultado de una faceta: conteos por valor y las opciones presentes (ordenadas por etiqueta). */
export type FacetOutput = { counts: Map<string, number>; resolvedOptions: FacetOption[] };

/**
 * Agrupa con `config.group(where)`, resuelve los nombres de una sola vez (si la columna es FK) y arma
 * `{ counts, resolvedOptions }`. Las opciones salen ordenadas por etiqueta y sin repetir valor. En las
 * facetas `direct` la etiqueta es el propio valor (las columnas con etiquetas propias las toma el cliente
 * de sus mapas y descartan `resolvedOptions`). `NULL_FILTER_VALUE` nunca es una opción: la agrega el cliente.
 */
export async function runFacet<Where>(config: FacetConfig<Where>, where: Where): Promise<FacetOutput> {
  const rows = await config.group(where);

  if (config.kind === 'direct') {
    const counts = toFacetMap(rows);
    const resolvedOptions = [...counts.keys()]
      .filter((value) => value !== NULL_FILTER_VALUE)
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ value, label: value }));
    return { counts, resolvedOptions };
  }

  const ids = rows.map((r) => r.key).filter((key): key is string => typeof key === 'string');
  const resolved = ids.length ? await config.lookup(ids) : new Map<string, FacetOption>();

  // La clave de los counts es el valor de la opción (sector/área real), no el id del pivote.
  const counts = toFacetMap(
    rows.map((r) => ({
      key: typeof r.key === 'string' ? (resolved.get(r.key)?.value ?? r.key) : r.key,
      count: r.count,
    }))
  );

  const options = new Map<string, FacetOption>();
  for (const id of ids) {
    const option = resolved.get(id) ?? { value: id, label: id };
    options.set(option.value, option);
  }
  const resolvedOptions = [...options.values()].sort((a, b) => a.label.localeCompare(b.label));

  return { counts, resolvedOptions };
}
