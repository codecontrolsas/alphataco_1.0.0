/**
 * Helpers para DataTable - Funciones puras que pueden ejecutarse en servidor o cliente
 * NO incluye 'use client' para que puedan ser importadas desde server actions
 */

import type { DataTableSearchParams, DataTableState, SortItem } from './types';

// ============================================================================
// CONSTANTES
// ============================================================================

export const DEFAULT_PAGE_SIZE = 10;
export const DEFAULT_PAGE = 0;

/** Sentinel value used in faceted filters to represent "field is null / unassigned" */
export const NULL_FILTER_VALUE = '__null__';

/** Separator used to namespace URL params per table (e.g. "vehicles__condition") */
export const PARAM_SEPARATOR = '__';

// ============================================================================
// PARSE HELPERS
// ============================================================================

/**
 * Parsea los searchParams de la URL a un estado estructurado
 */
/**
 * Parsea el formato compacto de sorting ("name.asc,status.desc") a array de SortItem.
 * Un string vacío representa "sin ordenamiento".
 */
export function parseSortString(sort: string): SortItem[] {
  if (!sort) return [];

  return sort
    .split(',')
    .map((s) => {
      const lastDot = s.lastIndexOf('.');
      if (lastDot === -1) return { id: s, desc: false };
      const id = s.substring(0, lastDot);
      const dir = s.substring(lastDot + 1);
      return { id, desc: dir === 'desc' };
    })
    .filter((s) => s.id);
}

/** Tope de filas por página aceptado desde la URL. */
export const MAX_PAGE_SIZE = 200;

export function parseSearchParams(searchParams: DataTableSearchParams): DataTableState {
  // Parsear página (1-indexed en URL, 0-indexed internamente)
  const rawPage = searchParams.page ? Number(searchParams.page) - 1 : DEFAULT_PAGE;
  const page = Number.isFinite(rawPage) ? Math.max(0, Math.trunc(rawPage)) : DEFAULT_PAGE;

  // Parsear pageSize: valor no numérico → default; se acota a [1, MAX_PAGE_SIZE] para que una URL
  // manipulada (`?pageSize=1000000`) no pueda pedir la tabla entera.
  const rawPageSize = searchParams.pageSize ? Number(searchParams.pageSize) : DEFAULT_PAGE_SIZE;
  const pageSize = Number.isFinite(rawPageSize)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(rawPageSize)))
    : DEFAULT_PAGE_SIZE;

  // Parsear sorting: nuevo formato "sort=name.asc,status.desc"
  let sorting: SortItem[] = [];
  if (searchParams.sort) {
    sorting = parseSortString(String(searchParams.sort));
  } else if (searchParams.sortBy) {
    // Backward compat: legacy format "sortBy=name&sortOrder=asc"
    sorting = [{ id: String(searchParams.sortBy), desc: searchParams.sortOrder === 'desc' }];
  }

  // Parsear búsqueda
  const search = (searchParams.search as string) || '';

  // Parsear filtros (todos los params que no son los estándar)
  // Los params _from y _to son parte del sistema de date range y se procesan por separado
  const reservedKeys = ['page', 'pageSize', 'sort', 'sortBy', 'sortOrder', 'search'];
  const filters: Record<string, string[]> = {};

  Object.entries(searchParams).forEach(([key, value]) => {
    if (!reservedKeys.includes(key) && value) {
      // Si es un array, usar directo; si es string, convertir a array
      filters[key] = Array.isArray(value) ? value : String(value).split(',');
    }
  });

  return { page, pageSize, sorting, search, filters };
}

/**
 * Serializa un array de sorting al formato compacto de URL ("name.asc,status.desc").
 * Retorna string vacío cuando no hay ordenamiento.
 */
export function serializeSorting(sorting: SortItem[] | undefined): string {
  if (!sorting || sorting.length === 0) return '';
  return sorting.map((s) => `${s.id}.${s.desc ? 'desc' : 'asc'}`).join(',');
}

/**
 * Opciones para serializar el estado a URL.
 *
 * Los defaults representan los valores que la tabla aplica cuando el param NO está
 * en la URL (los guardados en las preferencias del usuario, o los del sistema).
 * Un valor que coincide con su default se omite de la URL; uno que difiere se
 * escribe SIEMPRE, incluso si es vacío (`sort=`), para poder distinguir
 * "sin ordenamiento" de "usar el default guardado".
 */
export interface StateToSearchParamsOptions {
  /** Tamaño de página que se aplica cuando `pageSize` no está en la URL */
  defaultPageSize?: number;
  /** Sorting serializado que se aplica cuando `sort` no está en la URL */
  defaultSort?: string;
}

/**
 * Convierte el estado a searchParams de URL
 */
export function stateToSearchParams(
  state: Partial<DataTableState>,
  options: StateToSearchParamsOptions = {}
): URLSearchParams {
  const { defaultPageSize = DEFAULT_PAGE_SIZE, defaultSort = '' } = options;
  const params = new URLSearchParams();

  // Página (convertir de 0-indexed a 1-indexed para URL)
  if (state.page !== undefined && state.page > 0) {
    params.set('page', String(state.page + 1));
  }

  // PageSize (solo si es diferente al default efectivo de la tabla)
  if (state.pageSize !== undefined && state.pageSize !== defaultPageSize) {
    params.set('pageSize', String(state.pageSize));
  }

  // Multi-sort: "name.asc,status.desc" (solo si difiere del default efectivo).
  // Cuando el usuario limpia un orden que venía por default, se escribe `sort=`
  // para que el default guardado no vuelva a aplicarse.
  if (state.sorting !== undefined) {
    const sortStr = serializeSorting(state.sorting);
    if (sortStr !== defaultSort) {
      params.set('sort', sortStr);
    }
  }

  // Búsqueda
  if (state.search) {
    params.set('search', state.search);
  }

  // Filtros
  if (state.filters) {
    Object.entries(state.filters).forEach(([key, values]) => {
      if (values.length > 0) {
        params.set(key, values.join(','));
      }
    });
  }

  return params;
}

/**
 * Strips a tableId prefix from search params, returning only the params
 * belonging to that table (without the prefix).
 *
 * @example
 * ```tsx
 * // URL: ?vehicles__condition=GOOD&vehicles__page=2&tab=equipos&subtab=vehicles
 * const raw = { 'vehicles__condition': 'GOOD', 'vehicles__page': '2', tab: 'equipos', subtab: 'vehicles' };
 * const clean = stripPrefixFromSearchParams(raw, 'vehicles');
 * // Result: { condition: 'GOOD', page: '2' }
 * ```
 */
export function stripPrefixFromSearchParams(
  searchParams: DataTableSearchParams,
  prefix: string
): DataTableSearchParams {
  const fullPrefix = `${prefix}${PARAM_SEPARATOR}`;
  const result: DataTableSearchParams = {};

  Object.entries(searchParams).forEach(([key, value]) => {
    if (key.startsWith(fullPrefix)) {
      result[key.slice(fullPrefix.length)] = value;
    }
  });

  return result;
}

// ============================================================================
// PREFERENCIAS DE TABLA POR USUARIO
// ============================================================================

/**
 * Preferencias de una tabla persistidas por usuario (tabla `user_table_preferences`).
 * Todo es opcional: una tabla sin preferencias guardadas usa los defaults del sistema.
 */
export type TablePreferences = {
  /** Columnas visibles/ocultas */
  columnVisibility?: Record<string, boolean>;
  /** Filtros visibles/ocultos en el toolbar */
  filterVisibility?: Record<string, boolean>;
  /** Filas por página elegidas por el usuario */
  pageSize?: number;
  /** Ordenamiento (multi-sort) elegido por el usuario */
  sorting?: { id: string; desc: boolean }[];
  /** Orden de las columnas elegido por el usuario (ids de columna, de izquierda a derecha) */
  columnOrder?: string[];
};

/**
 * Reconcilia el orden guardado con las columnas que existen hoy.
 *
 * Necesario porque el orden se persiste como una lista de ids: si después se agrega
 * una columna nueva al sistema, no está en la preferencia del usuario y quedaría
 * fuera; y si se elimina una, quedaría un id fantasma. Las columnas nuevas se
 * agregan al final, respetando el orden que el usuario ya había elegido.
 */
export function reconcileColumnOrder(savedOrder: string[] | undefined, currentColumnIds: string[]): string[] {
  if (!savedOrder?.length) return currentColumnIds;

  const current = new Set(currentColumnIds);
  const kept = savedOrder.filter((id) => current.has(id));
  const added = currentColumnIds.filter((id) => !kept.includes(id));

  return [...kept, ...added];
}

/**
 * Aplica las preferencias guardadas del usuario a los searchParams de la tabla.
 * La URL SIEMPRE gana: solo se completan los params ausentes.
 *
 * Se usa en el Server Component para que el render inicial (SSR) coincida con el
 * estado que el cliente va a reconstruir, evitando un doble fetch con distinta forma.
 *
 * @example
 * ```tsx
 * const preferences = await getTablePreferences(tableId);
 * const tableParams = applyTablePreferences(stripPrefixFromSearchParams(searchParams, tableId), preferences);
 * const { data, total } = await getEntitiesPaginated(tableParams);
 * ```
 */
export function applyTablePreferences(
  searchParams: DataTableSearchParams,
  preferences: TablePreferences
): DataTableSearchParams {
  const result: DataTableSearchParams = { ...searchParams };

  if (result.pageSize === undefined && preferences.pageSize) {
    result.pageSize = String(preferences.pageSize);
  }

  if (result.sort === undefined && result.sortBy === undefined && preferences.sorting?.length) {
    result.sort = serializeSorting(preferences.sorting);
  }

  return result;
}

// ============================================================================
// PRISMA HELPERS
// ============================================================================

/**
 * Convierte DataTableState a parámetros de Prisma
 *
 * @example
 * ```tsx
 * // En un server action
 * export async function getEmployees(searchParams: DataTableSearchParams) {
 *   const state = parseSearchParams(searchParams);
 *   const prismaParams = stateToPrismaParams(state);
 *
 *   const [data, total] = await Promise.all([
 *     prisma.employee.findMany({
 *       ...prismaParams,
 *       where: {
 *         ...prismaParams.where,
 *         companyId,
 *       },
 *     }),
 *     prisma.employee.count({ where: { ...prismaParams.where, companyId } }),
 *   ]);
 *
 *   return { data, total };
 * }
 * ```
 */
export function stateToPrismaParams(state: DataTableState) {
  const params: {
    skip: number;
    take: number;
    orderBy?: Record<string, 'asc' | 'desc'>[];
  } = {
    skip: state.page * state.pageSize,
    take: state.pageSize,
  };

  if (state.sorting.length > 0) {
    params.orderBy = state.sorting.map((s) => ({
      [s.id]: (s.desc ? 'desc' : 'asc') as 'asc' | 'desc',
    }));
  }

  return params;
}

/**
 * Construye cláusula where para búsqueda en múltiples campos
 *
 * @example
 * ```tsx
 * const searchWhere = buildSearchWhere(state.search, ['name', 'email', 'documentNumber']);
 * // Resultado: { OR: [{ name: { contains: 'juan', mode: 'insensitive' } }, ...] }
 * ```
 */
export function buildSearchWhere(search: string, fields: string[]) {
  if (!search) return {};

  return {
    OR: fields.map((field) => ({
      [field]: {
        contains: search,
        mode: 'insensitive' as const,
      },
    })),
  };
}

/**
 * Construye cláusula where para filtros de columnas
 *
 * @example
 * ```tsx
 * const filtersWhere = buildFiltersWhere(state.filters, {
 *   status: 'status',           // directo
 *   department: 'departmentId', // mapeo a otro campo
 * });
 * ```
 */
/**
 * Claves de la URL que NUNCA se aceptan como filtro de columna salvo que el `columnMap` de la tabla las
 * declare explícitamente: pisarían el perímetro de empresa (`company_id`) o la estructura del `where`.
 */
const FORBIDDEN_FILTER_KEYS = new Set(['company_id', 'AND', 'OR', 'NOT']);

export function buildFiltersWhere(
  filters: Record<string, string[]>,
  columnMap: Record<string, string> = {},
  options?: { exclude?: string[] }
) {
  const excluded = new Set(options?.exclude ?? []);
  const where: Record<string, unknown> = {};
  const orConditions: Record<string, unknown>[] = [];

  Object.entries(filters).forEach(([columnId, values]) => {
    // Ignorar los params _from/_to aquí: se procesan con buildDateRangeFiltersWhere
    if (columnId.endsWith('_from') || columnId.endsWith('_to')) return;
    // Ignorar columnas excluidas (ej. columnas de texto que se procesan con buildTextFiltersWhere)
    if (excluded.has(columnId)) return;
    if (FORBIDDEN_FILTER_KEYS.has(columnId) && !(columnId in columnMap)) return;

    if (values.length > 0) {
      const field = columnMap[columnId] || columnId;
      const hasNull = values.includes(NULL_FILTER_VALUE);
      const realValues = hasNull ? values.filter((v) => v !== NULL_FILTER_VALUE) : values;

      if (hasNull && realValues.length > 0) {
        // Mixed: null + real values → OR at root level
        orConditions.push({
          OR: [{ [field]: realValues.length === 1 ? realValues[0] : { in: realValues } }, { [field]: null }],
        });
      } else if (hasNull) {
        // Only null
        where[field] = null;
      } else {
        // Only real values (original logic)
        where[field] = realValues.length === 1 ? realValues[0] : { in: realValues };
      }
    }
  });

  // If we have OR conditions, wrap them in AND at root level
  if (orConditions.length > 0) {
    where.AND = orConditions;
  }

  return where;
}

/**
 * Construye cláusula where para filtros de texto libre (contains insensitive)
 * Usar para columnas de tipo texto donde el filtro es un substring, NO un valor exacto.
 *
 * @example
 * ```tsx
 * // filters: { phone: ['123'] }
 * const textWhere = buildTextFiltersWhere(state.filters, ['phone', 'email']);
 * // Resultado: { phone: { contains: '123', mode: 'insensitive' } }
 * ```
 */
export function buildTextFiltersWhere(
  filters: Record<string, string[]>,
  textColumns: string[],
  columnMap: Record<string, string> = {}
) {
  const where: Record<string, unknown> = {};

  textColumns.forEach((columnId) => {
    const values = filters[columnId];
    if (values?.length && values[0]) {
      const field = columnMap[columnId] || columnId;
      where[field] = { contains: values[0], mode: 'insensitive' };
    }
  });

  return where;
}

/**
 * Construye cláusula where para filtros de rango de fechas
 * Lee los params _from y _to del objeto de filtros
 *
 * @example
 * ```tsx
 * // filters: { createdAt_from: ['2024-01-01'], createdAt_to: ['2024-12-31'] }
 * const dateWhere = buildDateRangeFiltersWhere(state.filters, ['createdAt']);
 * // Resultado: { createdAt: { gte: new Date('2024-01-01'), lte: new Date('2024-12-31') } }
 *
 * // Con mapeo a otro campo de Prisma:
 * const dateWhere = buildDateRangeFiltersWhere(state.filters, ['hireDate'], { hireDate: 'startDate' });
 * ```
 */
export function buildDateRangeFiltersWhere(
  filters: Record<string, string[]>,
  dateColumns: string[],
  columnMap: Record<string, string> = {}
) {
  const where: Record<string, unknown> = {};

  dateColumns.forEach((columnId) => {
    const fromValues = filters[`${columnId}_from`];
    const toValues = filters[`${columnId}_to`];

    const fromStr = fromValues?.[0];
    const toStr = toValues?.[0];

    if (!fromStr && !toStr) return;

    const field = columnMap[columnId] || columnId;
    const rangeFilter: Record<string, Date> = {};

    if (fromStr) {
      const fromDate = new Date(fromStr);
      if (!isNaN(fromDate.getTime())) {
        fromDate.setUTCHours(0, 0, 0, 0);
        rangeFilter.gte = fromDate;
      }
    }

    if (toStr) {
      const toDate = new Date(toStr);
      if (!isNaN(toDate.getTime())) {
        toDate.setUTCHours(23, 59, 59, 999);
        rangeFilter.lte = toDate;
      }
    }

    if (Object.keys(rangeFilter).length > 0) {
      where[field] = rangeFilter;
    }
  });

  return where;
}
