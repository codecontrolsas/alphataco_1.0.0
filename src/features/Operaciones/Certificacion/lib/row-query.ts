import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import {
  buildFiltersWhere,
  buildTextFiltersWhere,
  NULL_FILTER_VALUE,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { dailyReportRowStatusLabels, dailyReportTypeServiceLabels } from '@/shared/utils/mappers';
import moment from 'moment';

type RowWhere = Prisma.dailyreportrowsWhereInput;
type RowOrderBy = Prisma.dailyreportrowsOrderByWithRelationInput;
type TableState = ReturnType<typeof parseSearchParams>;

// ============================================================================
// CONSTANTES
// ============================================================================

/** Tope de filas por página: el `pageSize` viaja en la URL y no hay que confiar en él. */
export const MAX_PAGE_SIZE = 200;

/** Campos directos de `dailyreportrows` que se pueden ordenar server-side. */
export const VALID_SORT_FIELDS = new Set(['status', 'type_service', 'working_day', 'description', 'created_at']);

/** Columnas FK / relacionadas → `orderBy` de Prisma con la relación. */
export const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => RowOrderBy> = {
  date: (dir) => ({ dailyreport: { date: dir } }),
  customer: (dir) => ({ customers: { name: dir } }),
  service: (dir) => ({ customer_services: { service_name: dir } }),
  item: (dir) => ({ service_items: { item_name: dir } }),
  item_description: (dir) => ({ service_items: { item_description: dir } }),
  sector: (dir) => ({ service_sectors: { sectors: { name: dir } } }),
  area: (dir) => ({ service_areas: { areas_cliente: { nombre: dir } } }),
};

/** Columnas de enum / texto directo que resuelve `buildFiltersWhere`. */
const COLUMN_MAP: Record<string, string> = {
  status: 'status',
  type_service: 'type_service',
  working_day: 'working_day',
};

/** Columnas con filtro de rango de fechas (`date_from` / `date_to`). */
const DATE_COLUMNS = ['date'];

/**
 * Lista blanca de claves de filtro que acepta la tabla. `parseSearchParams` convierte CUALQUIER clave de la URL
 * en un filtro: las desconocidas se descartan antes de armar el `where` (si no, rompen la consulta o pisan el
 * perímetro de empresa).
 */
const ALLOWED_FILTER_KEYS = new Set<string>([
  ...Object.keys(COLUMN_MAP),
  'customer',
  'service',
  'item',
  'sector',
  'area',
  'customer_equipment',
  'employees',
  'equipment',
  'description',
  'item_description',
  'remit_number',
  ...dateRangeKeys(DATE_COLUMNS),
]);

/** Filtros que se resuelven a mano (relaciones, M:M y textos de relaciones). */
const MANUALLY_HANDLED = [
  'customer',
  'service',
  'item',
  'sector',
  'area',
  'customer_equipment',
  'employees',
  'equipment',
  'description',
  'item_description',
  'remit_number',
  'date',
];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_STATUSES = new Set(Object.keys(dailyReportRowStatusLabels));
const VALID_TYPE_SERVICES = new Set(Object.keys(dailyReportTypeServiceLabels));

// ============================================================================
// WHERE COMPARTIDO (paginada, export y facetas)
// ============================================================================

/**
 * Cláusula de un filtro de FK / M:M que admite la opción "Sin asignar" (`NULL_FILTER_VALUE`).
 * Los ids que no son UUID se descartan: llegan por la URL y una columna `uuid` los rechaza con error.
 */
function withNull(
  values: string[] | undefined,
  inClause: (ids: string[]) => RowWhere,
  nullClause: RowWhere
): RowWhere | null {
  if (!values?.length) return null;
  const hasNull = values.includes(NULL_FILTER_VALUE);
  const ids = values.filter((value) => UUID_PATTERN.test(value));
  if (hasNull && ids.length > 0) return { OR: [inClause(ids), nullClause] };
  if (hasNull) return nullClause;
  if (ids.length === 0) return null;
  return inClause(ids);
}

/** Rango de fechas del parte (`date_from` / `date_to`, `YYYY-MM-DD`). La fecha del parte es `@db.Date`. */
function buildReportDateRange(filters: TableState['filters']): Prisma.DateTimeFilter | null {
  const from = moment.utc(filters['date_from']?.[0], 'YYYY-MM-DD', true);
  const to = moment.utc(filters['date_to']?.[0], 'YYYY-MM-DD', true);
  if (!from.isValid() && !to.isValid()) return null;
  return {
    ...(from.isValid() ? { gte: from.toDate() } : {}),
    ...(to.isValid() ? { lte: to.toDate() } : {}),
  };
}

/** Filtro de texto "contiene" sin distinguir mayúsculas. */
function contains(value: string) {
  return { contains: value, mode: 'insensitive' as const };
}

/**
 * WHERE compartido por la tabla paginada, el export y las facetas.
 *
 * Perímetro: SIEMPRE acotado por `dailyreport.company_id` (con Prisma no hay RLS: sin esto, la
 * tabla mostraría líneas de otras empresas).
 */
export function buildWhereClause(rawState: TableState, companyId: string): RowWhere {
  // Solo las claves conocidas llegan al where (la URL es input del usuario).
  const state = sanitizeFilters(rawState, ALLOWED_FILTER_KEYS);
  const { filters } = state;
  // El perímetro de empresa va en el AND: nada de lo que viene de la URL puede pisarlo.
  const and: RowWhere[] = [{ dailyreport: { company_id: companyId } }];

  // Búsqueda global: cliente, servicio, ítem, descripción, remitos, empleados (legajo/nombre) y equipos propios.
  if (state.search) {
    const term = state.search.trim();
    and.push({
      OR: [
        { description: contains(term) },
        { remit_number: contains(term) },
        { remitos: { some: { remit_number: contains(term) } } },
        { customers: { name: contains(term) } },
        { customer_services: { service_name: contains(term) } },
        { service_items: { item_name: contains(term) } },
        {
          dailyreportemployeerelations: {
            some: {
              employees: { OR: [{ file: contains(term) }, { firstname: contains(term) }, { lastname: contains(term) }] },
            },
          },
        },
        {
          dailyreportequipmentrelations: {
            some: { vehicles: { OR: [{ intern_number: contains(term) }, { domain: contains(term) }] } },
          },
        },
      ],
    });
  }

  // Enums y texto directo (estado, tipo de servicio, jornada). Se validan contra el enum: un valor
  // inválido en la URL rompería la consulta, y si ninguno es válido el filtro no devuelve nada
  // (descartarlo devolvería todo).
  const sanitizedFilters: Record<string, string[]> = { ...filters };
  if (sanitizedFilters['status']) {
    const valid = sanitizedFilters['status'].filter((value) => VALID_STATUSES.has(value));
    if (valid.length > 0) sanitizedFilters['status'] = valid;
    else {
      delete sanitizedFilters['status'];
      and.push({ id: { in: [] } });
    }
  }
  if (sanitizedFilters['type_service']) {
    const valid = sanitizedFilters['type_service'].filter(
      (value) => value === NULL_FILTER_VALUE || VALID_TYPE_SERVICES.has(value)
    );
    if (valid.length > 0) sanitizedFilters['type_service'] = valid;
    else {
      delete sanitizedFilters['type_service'];
      and.push({ id: { in: [] } });
    }
  }
  and.push(
    buildFiltersWhere(sanitizedFilters, COLUMN_MAP, {
      exclude: [...MANUALLY_HANDLED, 'date_from', 'date_to'],
    }) as RowWhere
  );

  // Textos
  and.push(buildTextFiltersWhere(filters, ['description']) as RowWhere);

  const itemDescription = filters['item_description']?.[0];
  if (itemDescription) and.push({ service_items: { item_description: contains(itemDescription) } });

  const remit = filters['remit_number']?.[0]?.trim();
  if (remit) {
    and.push({ OR: [{ remitos: { some: { remit_number: contains(remit) } } }, { remit_number: contains(remit) }] });
  }

  // FK y M:M (con "Sin asignar")
  const manual = [
    withNull(filters['customer'], (ids) => ({ customer_id: { in: ids } }), { customer_id: null }),
    withNull(filters['service'], (ids) => ({ service_id: { in: ids } }), { service_id: null }),
    withNull(filters['item'], (ids) => ({ item_id: { in: ids } }), { item_id: null }),
    withNull(filters['sector'], (ids) => ({ service_sectors: { sector_id: { in: ids } } }), {
      sector_service_id: null,
    }),
    withNull(filters['area'], (ids) => ({ service_areas: { area_id: { in: ids } } }), { areas_service_id: null }),
    withNull(
      filters['employees'],
      (ids) => ({ dailyreportemployeerelations: { some: { employee_id: { in: ids } } } }),
      { dailyreportemployeerelations: { none: {} } }
    ),
    // Solo vehículos propios: son los que muestra la tabla.
    withNull(
      filters['equipment'],
      (ids) => ({ dailyreportequipmentrelations: { some: { equipment_id: { in: ids } } } }),
      { dailyreportequipmentrelations: { none: { equipment_id: { not: null } } } }
    ),
    withNull(
      filters['customer_equipment'],
      (ids) => ({ dailyreport_customer_equipment_relations: { some: { customer_equipment_id: { in: ids } } } }),
      { dailyreport_customer_equipment_relations: { none: {} } }
    ),
  ];
  for (const clause of manual) if (clause) and.push(clause);

  const dateRange = buildReportDateRange(filters);

  if (dateRange) and.push({ dailyreport: { date: dateRange } });

  return { AND: and };
}

/**
 * Orden de la tabla: lo que elige el usuario, después la fecha del parte descendente (más recientes
 * primero) y `id` como desempate para que la paginación sea estable.
 */
export function buildOrderBy(sorting: TableState['sorting']): RowOrderBy[] {
  const resolved: RowOrderBy[] = [];
  let sortsByDate = false;

  for (const sort of sorting) {
    const dir: 'asc' | 'desc' = sort.desc ? 'desc' : 'asc';
    const fkMapper = FK_SORT_MAP[sort.id];
    if (fkMapper) {
      resolved.push(fkMapper(dir));
      if (sort.id === 'date') sortsByDate = true;
    } else if (VALID_SORT_FIELDS.has(sort.id)) {
      resolved.push({ [sort.id]: dir });
    }
  }

  return [...resolved, ...(sortsByDate ? [] : [{ dailyreport: { date: 'desc' as const } }]), { id: 'asc' as const }];
}

// ============================================================================
// SELECT MÍNIMO
// ============================================================================

/**
 * Lo que muestra la tabla, más lo que consume el formulario de edición. Los datos personales de empleados y
 * equipos (DNI, mail, teléfono, cargo, marca…) NO viajan en cada fila: el modal de detalle los pide bajo
 * demanda (`getCertificationRowPersonalDetail`). Sin `updated_at`, `document_path`, `cancel_reason` ni ids de FK que
 * no se usan; y una sola consulta por relación (ver `map-row.ts`).
 */
export const CERTIFICATION_ROW_SELECT = {
  id: true,
  customer_id: true,
  service_id: true,
  item_id: true,
  sector_service_id: true,
  areas_service_id: true,
  start_time: true,
  end_time: true,
  description: true,
  status: true,
  working_day: true,
  remit_number: true,
  type_service: true,
  completed_day: true,
  completed_night: true,
  last_comercial_edit_at: true,
  created_at: true,
  dailyreport: { select: { date: true, status: true } },
  customers: { select: { name: true } },
  customer_services: { select: { service_name: true } },
  service_items: { select: { item_name: true, item_description: true } },
  preparte: { select: { id: true, numero_pedido: true, confirmed_by: true } },
  remitos: { select: { remit_number: true }, orderBy: { created_at: 'asc' } },
  service_sectors: { select: { sectors: { select: { id: true, name: true } } } },
  service_areas: { select: { areas_cliente: { select: { id: true, nombre: true } } } },
  dailyreport_customer_equipment_relations: {
    select: { id: true, equipos_clientes: { select: { id: true, name: true, type: true } } },
  },
  dailyreportemployeerelations: {
    select: {
      employees: {
        select: {
          id: true,
          firstname: true,
          lastname: true,
          file: true,
        },
      },
    },
  },
  dailyreportequipmentrelations: {
    select: {
      vehicles: {
        select: {
          id: true,
          intern_number: true,
          domain: true,
        },
      },
    },
  },
} satisfies Prisma.dailyreportrowsSelect;

export type CertificationDbRow = Prisma.dailyreportrowsGetPayload<{ select: typeof CERTIFICATION_ROW_SELECT }>;
