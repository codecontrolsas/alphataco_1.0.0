import { parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';

/** Columnas de texto libre. */
export const TEXT_FILTER_COLUMNS = ['name', 'description'] as const;

/** Columnas con filtro de rango de fechas. */
export const DATE_RANGE_COLUMNS = ['created_at'] as const;

/** Columnas booleanas (llegan como 'true'/'false' desde los filtros facetados). */
export const BOOLEAN_FILTER_COLUMNS = [
  'mandatory',
  'explired',
  'special',
  'multiresource',
  'has_policy_number',
  'is_it_montlhy',
  'private',
  'down_document',
  'is_active',
] as const;

/** Único filtro facetado que no es booleano ni de texto. */
const EQUIPMENT_TYPE_COLUMN = 'equipment_type';

/**
 * Lista blanca de claves de URL que la tabla puede convertir en filtro. Todo lo demás
 * (`applies`, `company_id`, `id`, `OR`, `tab`, `subtab`…) se descarta: `buildFiltersWhere` las usaría como campo de Prisma.
 */
const ALLOWED_FILTER_KEYS: ReadonlySet<string> = new Set<string>([
  ...TEXT_FILTER_COLUMNS,
  ...BOOLEAN_FILTER_COLUMNS,
  EQUIPMENT_TYPE_COLUMN,
  ...dateRangeKeys(DATE_RANGE_COLUMNS),
]);

/** Estado de la tabla a partir de la URL, con filtros restringidos a la lista blanca. */
export function parseDocTypeTableState(searchParams: DataTableSearchParams | undefined) {
  return sanitizeFilters(parseSearchParams(searchParams ?? {}), ALLOWED_FILTER_KEYS);
}

export type DocTypeTableState = ReturnType<typeof parseDocTypeTableState>;
