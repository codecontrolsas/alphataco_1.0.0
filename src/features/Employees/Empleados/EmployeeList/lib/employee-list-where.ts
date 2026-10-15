import type { Prisma } from '@/generated/prisma/client';
import {
  affiliate_status_enum,
  cost_type_enum,
  document_type_enum,
  gender_enum,
  level_of_education_enum,
  marital_status_enum,
  nationality_enum,
  reason_for_termination_enum,
  status_type,
} from '@/generated/prisma/enums';
import {
  NULL_FILTER_VALUE,
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';

// ============================================================================
// CONSTANTES
// ============================================================================

/** Campos directos de `employees` que se pueden ordenar server-side. */
export const VALID_SORT_FIELDS: ReadonlySet<string> = new Set([
  'lastname',
  'firstname',
  'email',
  'cuil',
  'document_number',
  'file',
  'born_date',
  'street',
  'street_number',
  'postal_code',
  'phone',
  'normal_hours',
  'date_of_admission',
  'created_at',
  'termination_date',
  'status',
  'gender',
  'nationality',
  'document_type',
  'marital_status',
  'level_of_education',
  'cost_type',
  'affiliate_status',
  'reason_for_termination',
  'is_active',
  // FK (se ordenan por el nombre de la relación, vía FK_SORT_MAP)
  'hierarchy',
  'company_positions',
  'types_of_contract',
  'work_diagram',
  'category',
  'covenant',
  'guild',
  'cost_center',
  'countries',
  'province',
  'city',
]);

type SortDirection = 'asc' | 'desc';

/** columnId → orderBy de Prisma para las columnas FK (ordenan por el nombre de la relación). */
export const FK_SORT_MAP: Record<string, (dir: SortDirection) => Prisma.employeesOrderByWithRelationInput> = {
  hierarchy: (dir) => ({ hierarchy: { name: dir } }),
  company_positions: (dir) => ({ company_positions: { name: dir } }),
  types_of_contract: (dir) => ({ types_of_contract: { name: dir } }),
  work_diagram: (dir) => ({ work_diagram: { name: dir } }),
  category: (dir) => ({ category: { name: dir } }),
  covenant: (dir) => ({ covenant: { name: dir } }),
  guild: (dir) => ({ guild: { name: dir } }),
  cost_center: (dir) => ({ cost_center: { name: dir } }),
  countries: (dir) => ({ countries: { name: dir } }),
  province: (dir) => ({ provinces: { name: dir } }),
  city: (dir) => ({ cities: { name: dir } }),
};

/**
 * Columnas de texto libre (contains insensitive). `born_date` es `String?` en la BD (no una fecha), por eso es
 * un filtro de texto y no de rango. El legajo (`file`) NO está acá: se filtra aparte, por coincidencia parcial.
 */
export const TEXT_FILTER_COLUMNS = [
  'fullName',
  'email',
  'cuil',
  'document_number',
  'phone',
  'street',
  'street_number',
  'postal_code',
  'normal_hours',
  'born_date',
];

/** Legajo: coincidencia exacta (con "1" no deben aparecer "10", "100"...). */
const FILE_COLUMN = 'file';

/** Columnas con filtro de rango de fechas (`@db.Date` / `timestamptz`, no strings). */
export const DATE_RANGE_COLUMNS = ['date_of_admission', 'created_at', 'termination_date'];

/** columnId (URL) → campo de Prisma, solo para las columnas cuyo id difiere del campo. */
const COLUMN_MAP: Record<string, string> = {
  hierarchy: 'hierarchical_position',
  company_positions: 'company_position',
  types_of_contract: 'type_of_contract',
  work_diagram: 'workflow_diagram',
  category: 'category_id',
  covenant: 'covenants_id',
  guild: 'guild_id',
  cost_center: 'cost_center_id',
  countries: 'birthplace',
};

/** Columnas enum: el id de la columna es el campo y los valores se validan contra el enum. */
const ENUM_VALUES: Record<string, readonly string[]> = {
  status: Object.values(status_type),
  gender: Object.values(gender_enum),
  nationality: Object.values(nationality_enum),
  document_type: Object.values(document_type_enum),
  marital_status: Object.values(marital_status_enum),
  level_of_education: Object.values(level_of_education_enum),
  cost_type: Object.values(cost_type_enum),
  affiliate_status: Object.values(affiliate_status_enum),
  reason_for_termination: Object.values(reason_for_termination_enum),
};

/** FK BigInt (provincia y ciudad): se filtran a mano. */
const BIGINT_COLUMNS = ['province', 'city'] as const;

/** M:M: columnId → relación de `employees` y campo de la pivote que apunta al catálogo. */
const M2M_COLUMNS = {
  contractor_employee: { relation: 'contractor_employee', field: 'contractor_id' },
  empleado_aptitudes: { relation: 'empleado_aptitudes', field: 'aptitud_id' },
  workshop_sectors: { relation: 'employee_workshop_sectors', field: 'workshop_sector_id' },
} as const;

type M2mColumn = keyof typeof M2M_COLUMNS;

/**
 * Únicas claves de URL que filtran el listado. El resto (`tab`, `subtab`, `company_id`, `is_active`...) se
 * descarta: `is_active` lo fija la pestaña (Activos/Bajas) y no puede venir del filtro.
 */
const ALLOWED_FILTER_KEYS: ReadonlySet<string> = new Set([
  ...Object.keys(COLUMN_MAP),
  ...Object.keys(ENUM_VALUES),
  ...BIGINT_COLUMNS,
  ...Object.keys(M2M_COLUMNS),
  ...TEXT_FILTER_COLUMNS,
  FILE_COLUMN,
  ...dateRangeKeys(DATE_RANGE_COLUMNS),
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTEGER_PATTERN = /^\d{1,18}$/;

export type EmployeeListState = ReturnType<typeof parseSearchParams>;

// ============================================================================
// ESTADO
// ============================================================================

/** Valida los valores de una faceta: descarta lo que no sea un id/enum válido (evita errores de Prisma por tipo). */
function validFacetValues(columnId: string, values: string[]): string[] {
  const enumValues = ENUM_VALUES[columnId];
  const isUuidColumn = columnId in COLUMN_MAP || columnId in M2M_COLUMNS;
  const isIntColumn = (BIGINT_COLUMNS as readonly string[]).includes(columnId);

  return values.filter((value) => {
    if (value === NULL_FILTER_VALUE) return true;
    if (enumValues) return enumValues.includes(value);
    if (isUuidColumn) return UUID_PATTERN.test(value);
    if (isIntColumn) return INTEGER_PATTERN.test(value);
    return true;
  });
}

/** Parsea los params de la URL y deja solo los filtros permitidos y con valores válidos. */
export function parseEmployeeListState(searchParams: DataTableSearchParams | undefined): EmployeeListState {
  const state = sanitizeFilters(parseSearchParams(searchParams ?? {}), ALLOWED_FILTER_KEYS);

  const filters: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(state.filters)) {
    const valid = validFacetValues(key, values);
    if (valid.length > 0) filters[key] = valid;
  }
  return { ...state, filters };
}

// ============================================================================
// WHERE
// ============================================================================

/** "Sin asignar" mezclado con valores reales: OR entre ambos; solo null: `isNull`; solo valores: `in`. */
function bigintCondition(field: 'province' | 'city', values: string[] | undefined): Prisma.employeesWhereInput | null {
  if (!values?.length) return null;
  const hasNull = values.includes(NULL_FILTER_VALUE);
  const ids = values.filter((v) => v !== NULL_FILTER_VALUE).map((v) => BigInt(v));

  const inIds = { [field]: { in: ids } } as Prisma.employeesWhereInput;
  const isNull = { [field]: null } as Prisma.employeesWhereInput;

  if (hasNull && ids.length > 0) return { OR: [inIds, isNull] };
  if (hasNull) return isNull;
  return inIds;
}

function m2mCondition(column: M2mColumn, values: string[] | undefined): Prisma.employeesWhereInput | null {
  if (!values?.length) return null;
  const { relation, field } = M2M_COLUMNS[column];
  const hasNull = values.includes(NULL_FILTER_VALUE);
  const ids = values.filter((v) => v !== NULL_FILTER_VALUE);

  const some = { [relation]: { some: { [field]: { in: ids } } } } as Prisma.employeesWhereInput;
  const none = { [relation]: { none: {} } } as Prisma.employeesWhereInput;

  if (hasNull && ids.length > 0) return { OR: [some, none] };
  if (hasNull) return none;
  return some;
}

/**
 * WHERE compartido por la lista paginada, el export, las métricas y las facetas. Todo (perímetro de empresa,
 * Activos/Bajas, búsqueda y cada filtro) va dentro de UN único `AND`: ningún filtro puede pisar el perímetro
 * ni a otro filtro.
 */
export function buildEmployeeWhere(
  companyId: string,
  isActive: boolean,
  state: EmployeeListState
): Prisma.employeesWhereInput {
  const manuallyHandled = [...BIGINT_COLUMNS, ...Object.keys(M2M_COLUMNS)];

  const conditions: Prisma.employeesWhereInput[] = [
    { company_id: companyId },
    { is_active: isActive },
    buildSearchWhere(state.search, ['lastname', 'firstname', 'cuil', 'file']) as Prisma.employeesWhereInput,
    buildFiltersWhere(state.filters, COLUMN_MAP, {
      exclude: [...TEXT_FILTER_COLUMNS, FILE_COLUMN, ...manuallyHandled, ...dateRangeKeys(DATE_RANGE_COLUMNS)],
    }) as Prisma.employeesWhereInput,
    buildTextFiltersWhere(
      state.filters,
      TEXT_FILTER_COLUMNS.filter((column) => column !== 'fullName')
    ) as Prisma.employeesWhereInput,
    buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS) as Prisma.employeesWhereInput,
  ];

  // El nombre completo busca en apellido, nombre y nombre completo.
  const fullName = state.filters['fullName']?.[0];
  if (fullName) {
    conditions.push({
      OR: [
        { lastname: { contains: fullName, mode: 'insensitive' } },
        { firstname: { contains: fullName, mode: 'insensitive' } },
        { full_name: { contains: fullName, mode: 'insensitive' } },
      ],
    });
  }

  const file = state.filters[FILE_COLUMN]?.[0]?.trim();
  if (file) conditions.push({ file: { contains: file, mode: 'insensitive' } });

  for (const field of BIGINT_COLUMNS) {
    const condition = bigintCondition(field, state.filters[field]);
    if (condition) conditions.push(condition);
  }

  for (const column of Object.keys(M2M_COLUMNS) as M2mColumn[]) {
    const condition = m2mCondition(column, state.filters[column]);
    if (condition) conditions.push(condition);
  }

  return { AND: conditions };
}

/** orderBy multi-columna: solo campos de la lista blanca, FK por nombre y desempate estable por apellido e id. */
export function buildEmployeeOrderBy(
  sorting: EmployeeListState['sorting']
): Prisma.employeesOrderByWithRelationInput[] {
  const resolved: Prisma.employeesOrderByWithRelationInput[] = [];

  for (const sort of sorting) {
    if (!VALID_SORT_FIELDS.has(sort.id)) continue;
    const dir: SortDirection = sort.desc ? 'desc' : 'asc';
    const fkMapper = FK_SORT_MAP[sort.id];
    resolved.push(fkMapper ? fkMapper(dir) : ({ [sort.id]: dir } as Prisma.employeesOrderByWithRelationInput));
  }

  return [...resolved, { lastname: 'asc' }, { id: 'asc' }];
}
