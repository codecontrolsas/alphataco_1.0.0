import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';

/**
 * Consulta de accesos externos (ticket 671): `where`, orden y select ÚNICOS para lista, export y facetas.
 *
 * REGLA DE SEGURIDAD DURA: `secret_hash` NUNCA debe aparecer en ningún `select`, columna ni export.
 */

/** Campos ordenables server-side. `status` y `creator` se resuelven via mapeo */
const VALID_SORT_FIELDS = new Set(['name', 'client_id', 'status', 'last_used_at', 'created_at', 'creator', 'notes']);

/** columnId → campo real de Prisma, para columnas directas cuyo nombre difiere */
const SORT_FIELD_MAP: Record<string, string> = {
  status: 'revoked_at',
};

/** columnId → orderBy de Prisma con relacion, para columnas FK */
const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  creator: (dir) => ({ creator: { fullname: dir } }),
};

/** Columnas con filtro de texto libre (contains insensitive) */
const TEXT_FILTER_COLUMNS = ['name', 'client_id', 'notes'];

/** Columnas con filtro de rango de fechas */
const DATE_RANGE_COLUMNS = ['last_used_at', 'created_at'];

/** columnId (URL) → campo real en Prisma. `status` es derivado de `revoked_at` y se maneja a mano. */
const COLUMN_MAP: Record<string, string> = {
  creator: 'created_by',
};

/** Claves de filtro que la tabla realmente usa; el resto de la URL se descarta antes de armar el where. */
const CLIENT_FILTER_KEYS = new Set(['status', 'creator', ...TEXT_FILTER_COLUMNS, ...dateRangeKeys(DATE_RANGE_COLUMNS)]);

export function parseClientsState(searchParams: DataTableSearchParams | undefined) {
  return sanitizeFilters(parseSearchParams(searchParams ?? {}), CLIENT_FILTER_KEYS);
}

export type ClientsState = ReturnType<typeof parseClientsState>;

/**
 * Select común — NUNCA agregar `secret_hash` aquí.
 * `secret_prefix` no se pide en esta tabla (no hay columna que lo muestre).
 */
export const EXTERNAL_API_CLIENT_SELECT = {
  id: true,
  name: true,
  client_id: true,
  revoked_at: true,
  last_used_at: true,
  notes: true,
  created_at: true,
  creator: { select: { id: true, fullname: true } },
} as const;

/** Mismo where para lista, export y facetas. Cada fragmento con OR va en `AND` para que no se pisen. */
export function buildWhereClause(companyId: string, state: ClientsState): Prisma.external_api_clientsWhereInput {
  // `status` es derivado de `revoked_at` — se maneja a mano, nunca via buildFiltersWhere
  const filtersWhere = buildFiltersWhere(state.filters, COLUMN_MAP, {
    exclude: [...TEXT_FILTER_COLUMNS, 'status', ...dateRangeKeys(DATE_RANGE_COLUMNS)],
  });

  // Estado (activo/revocado) → revoked_at null / not null. Con ambas opciones (o ninguna) no se filtra.
  const statusValues = state.filters['status'];
  const statusWhere: Prisma.external_api_clientsWhereInput =
    statusValues?.length === 1 ? { revoked_at: statusValues[0] === 'active' ? null : { not: null } } : {};

  return {
    AND: [
      { company_id: companyId },
      buildSearchWhere(state.search, ['name', 'client_id']),
      filtersWhere,
      buildTextFiltersWhere(state.filters, TEXT_FILTER_COLUMNS),
      buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS),
      statusWhere,
    ] as Prisma.external_api_clientsWhereInput[],
  };
}

export function resolveSafeOrderBy(state: ClientsState) {
  const resolvedSorts: Record<string, unknown>[] = [];
  for (const s of state.sorting) {
    if (!VALID_SORT_FIELDS.has(s.id)) continue;
    const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
    const fkMapper = FK_SORT_MAP[s.id];
    if (fkMapper) {
      resolvedSorts.push(fkMapper(dir));
      continue;
    }
    resolvedSorts.push({ [SORT_FIELD_MAP[s.id] ?? s.id]: dir });
  }
  // Los accesos revocados (is_active: false) siempre quedan al final, sin importar el orden elegido.
  return [{ is_active: 'desc' as const }, ...resolvedSorts, { created_at: 'desc' as const }];
}
