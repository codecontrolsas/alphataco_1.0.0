'use server';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildTextFiltersWhere,
  NULL_FILTER_VALUE,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('MonthlyEquipmentDocs/actions.server');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Campos directos de documents_equipment que se pueden ordenar server-side */
const VALID_SORT_FIELDS = new Set([
  'created_at',
  'state',
  'period',
  // FK columns resueltas via FK_SORT_MAP
  'vehicle',
  'documentType',
]);

/** Mapeo de columnId → orderBy de Prisma para columnas FK */
const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  vehicle: (dir) => ({ vehicles: { domain: dir } }),
  documentType: (dir) => ({ document_types: { name: dir } }),
};

/** Columnas con filtro de texto libre */
const TEXT_FILTER_COLUMNS: string[] = ['vehicle', 'period', 'deny_reason'];

/** Columnas con filtro de rango de fechas */
const DATE_RANGE_COLUMNS = ['created_at'];

/**
 * Mapping de columnId (URL) → campo real en Prisma para buildFiltersWhere
 */
const COLUMN_MAP: Record<string, string> = {
  state: 'state',
  documentType: 'id_document_types',
};

/** Select común con todas las relaciones resueltas */
const MONTHLY_EQUIPMENT_DOCS_SELECT = {
  id: true,
  created_at: true,
  state: true,
  period: true,
  document_path: true,
  deny_reason: true,
  applies: true,
  archived_at: true,
  id_document_types: true,
  // Vehículo / Equipo (FK → vehicles)
  vehicles: {
    select: {
      id: true,
      domain: true,
      serie: true,
      intern_number: true,
      // Marca, modelo y tipo (celda "Equipo")
      brand_vehicles: { select: { id: true, name: true } },
      model_vehicles: { select: { id: true, name: true } },
      type_vehicles_typeTotype: { select: { id: true, name: true } },
      // Afectaciones del equipo (M:M → customers)
      contractor_equipment: {
        select: {
          customers: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  },
  // Tipo de documento (FK → document_types)
  document_types: {
    select: {
      id: true,
      name: true,
      mandatory: true,
      multiresource: true,
      explired: true,
      is_it_montlhy: true,
      private: true,
    },
  },
  // Logs para fecha de última actualización
  documents_equipment_logs: {
    orderBy: { updated_at: 'desc' as const },
    take: 1,
    select: {
      updated_at: true,
    },
  },
} as const;

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

async function buildWhereClause(
  companyId: string,
  state: ReturnType<typeof parseSearchParams>,
  equipmentId?: string,
  includeArchived = false
) {
  // En la vista de detalle de un equipo (equipmentId presente) se incluyen los
  // documentos archivados como historial; en la tabla general del módulo se ocultan.
  const showArchived = includeArchived || !!equipmentId;
  const canViewPrivate = await checkPermissionServer('documentacion', 'documentos-de-equipos', 'view_private');
  const filtersWhere = buildFiltersWhere(state.filters, COLUMN_MAP, {
    exclude: [
      ...TEXT_FILTER_COLUMNS,
      ...DATE_RANGE_COLUMNS.flatMap((c) => [`${c}_from`, `${c}_to`]),
      // Excluir columnas manejadas manualmente
      'mandatory',
      'multiresource',
      'contractor',
    ],
  });

  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS);

  // Filtros de texto para period y deny_reason (campos directos en la tabla)
  const textFiltersWhere = buildTextFiltersWhere(state.filters, ['period', 'deny_reason']);

  // ─── Filtro mandatory (campo booleano en document_types) ──────────────────
  const mandatoryValues = state.filters['mandatory'];
  const mandatoryFilter: Record<string, unknown> = {};
  if (mandatoryValues?.length) {
    const hasNull = mandatoryValues.includes(NULL_FILTER_VALUE);
    const realValues = mandatoryValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      // mixto → se maneja en extraAndConditions
    } else if (hasNull) {
      mandatoryFilter.document_types = { mandatory: null };
    } else {
      const boolValues = realValues.map((v) => v === 'true');
      mandatoryFilter.document_types = { mandatory: { in: boolValues } };
    }
  }

  // ─── Filtro multiresource (campo booleano en document_types) ──────────────
  const multiresourceValues = state.filters['multiresource'];
  const multiresourceFilter: Record<string, unknown> = {};
  if (multiresourceValues?.length) {
    const hasNull = multiresourceValues.includes(NULL_FILTER_VALUE);
    const realValues = multiresourceValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      // mixto → se maneja en extraAndConditions
    } else if (hasNull) {
      multiresourceFilter.document_types = { multiresource: null };
    } else {
      const boolValues = realValues.map((v) => v === 'true');
      multiresourceFilter.document_types = { multiresource: { in: boolValues } };
    }
  }

  // ─── Filtro contractor (afectación M:M a través de vehicles) ──────────────
  const contractorValues = state.filters['contractor'];
  const contractorFilter: Record<string, unknown> = {};
  if (contractorValues?.length) {
    const hasNull = contractorValues.includes(NULL_FILTER_VALUE);
    const realValues = contractorValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      // mixto → se maneja en extraAndConditions
    } else if (hasNull) {
      contractorFilter.vehicles = { contractor_equipment: { none: {} } };
    } else {
      contractorFilter.vehicles = {
        contractor_equipment: {
          some: { customers: { id: { in: realValues } } },
        },
      };
    }
  }

  // ─── Condiciones AND para casos mixtos (null + reales) ────────────────────
  const extraAndConditions: Record<string, unknown>[] = [];

  if (mandatoryValues?.length) {
    const hasNull = mandatoryValues.includes(NULL_FILTER_VALUE);
    const realValues = mandatoryValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      const boolValues = realValues.map((v) => v === 'true');
      extraAndConditions.push({
        OR: [{ document_types: { mandatory: { in: boolValues } } }, { document_types: { mandatory: null } }],
      });
    }
  }

  if (multiresourceValues?.length) {
    const hasNull = multiresourceValues.includes(NULL_FILTER_VALUE);
    const realValues = multiresourceValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      const boolValues = realValues.map((v) => v === 'true');
      extraAndConditions.push({
        OR: [{ document_types: { multiresource: { in: boolValues } } }, { document_types: { multiresource: null } }],
      });
    }
  }

  if (contractorValues?.length) {
    const hasNull = contractorValues.includes(NULL_FILTER_VALUE);
    const realValues = contractorValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      extraAndConditions.push({
        OR: [
          {
            vehicles: {
              contractor_equipment: { some: { customers: { id: { in: realValues } } } },
            },
          },
          { vehicles: { contractor_equipment: { none: {} } } },
        ],
      });
    }
  }

  // Construir condiciones base + filtros adicionales en AND para evitar colisiones de claves
  const andConditions: Record<string, unknown>[] = [
    // Filtro base: equipos de la compañía (a través de vehicles)
    { vehicles: { company_id: companyId } },
    // Filtro base: solo tipos de documento mensuales y activos
    { document_types: { is_it_montlhy: true, is_active: true, ...(!canViewPrivate && { private: { not: true } }) } },
    // Filtro base: solo vehículos activos
    { vehicles: { is_active: true } },
    // Excluir documentos archivados (historial / no vigente) salvo en la vista de detalle
    ...(showArchived ? [] : [{ archived_at: null }]),
    // Filtro opcional por equipo específico (para vista de detalle)
    ...(equipmentId ? [{ applies: equipmentId }] : []),
  ];

  // Búsqueda global por dominio / serie / número interno del equipo
  if (state.search) {
    andConditions.push({
      OR: [
        { vehicles: { domain: { contains: state.search, mode: 'insensitive' as const } } },
        { vehicles: { serie: { contains: state.search, mode: 'insensitive' as const } } },
        { vehicles: { intern_number: { contains: state.search, mode: 'insensitive' as const } } },
        { document_types: { name: { contains: state.search, mode: 'insensitive' as const } } },
      ],
    });
  }

  // Filtro texto de equipo (busca por dominio, serie o N° interno)
  const vehicleTextVal = state.filters['vehicle']?.[0];
  if (vehicleTextVal) {
    andConditions.push({
      OR: [
        { vehicles: { domain: { contains: vehicleTextVal, mode: 'insensitive' as const } } },
        { vehicles: { serie: { contains: vehicleTextVal, mode: 'insensitive' as const } } },
        { vehicles: { intern_number: { contains: vehicleTextVal, mode: 'insensitive' as const } } },
      ],
    });
  }

  // Filtro por state / vehicle / documentType (via buildFiltersWhere)
  if (Object.keys(filtersWhere).length > 0) {
    andConditions.push(filtersWhere);
  }

  // Filtro por fechas
  if (Object.keys(dateFiltersWhere).length > 0) {
    andConditions.push(dateFiltersWhere);
  }

  // Filtros de texto para period y deny_reason
  if (Object.keys(textFiltersWhere).length > 0) {
    andConditions.push(textFiltersWhere);
  }

  // Filtros booleanos de document_types (mandatory, multiresource)
  if (Object.keys(mandatoryFilter).length > 0) {
    andConditions.push(mandatoryFilter);
  }
  if (Object.keys(multiresourceFilter).length > 0) {
    andConditions.push(multiresourceFilter);
  }

  // Filtro contractor (afectación)
  if (Object.keys(contractorFilter).length > 0) {
    andConditions.push(contractorFilter);
  }

  // Condiciones AND extra (casos mixtos null + valores reales)
  andConditions.push(...extraAndConditions);

  return {
    AND: andConditions,
  };
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getMonthlyEquipmentDocumentsPaginated(searchParams: DataTableSearchParams, equipmentId?: string) {
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = await buildWhereClause(companyId, state, equipmentId);

    // Safe orderBy: multi-sort, solo campos válidos
    const resolvedSorts: Record<string, unknown>[] = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
        const fkMapper = FK_SORT_MAP[s.id];
        resolvedSorts.push(fkMapper ? fkMapper(dir) : { [s.id]: dir });
      }
    }

    const safeOrderBy = [...resolvedSorts, { vehicles: { domain: 'asc' as const } }];

    const [data, total] = await Promise.all([
      prisma.documents_equipment.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: MONTHLY_EQUIPMENT_DOCS_SELECT,
      }),
      prisma.documents_equipment.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener documentos mensuales de equipos paginados', { data: { error } });
    throw new Error('Error al obtener los documentos mensuales de equipos');
  }
}

export type MonthlyEquipmentDocumentListItem = Awaited<
  ReturnType<typeof getMonthlyEquipmentDocumentsPaginated>
>['data'][number];

// ============================================================================
// EXPORT QUERY (sin paginación)
// ============================================================================

export async function getAllMonthlyEquipmentDocumentsForExport(
  searchParams: DataTableSearchParams,
  equipmentId?: string
) {
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    const where = await buildWhereClause(companyId, state, equipmentId);

    const data = await prisma.documents_equipment.findMany({
      orderBy: [{ vehicles: { domain: 'asc' } }],
      where,
      select: MONTHLY_EQUIPMENT_DOCS_SELECT,
    });

    return data;
  } catch (error) {
    logger.error('Error al exportar documentos mensuales de equipos', { data: { error } });
    throw new Error('Error al exportar los documentos mensuales de equipos');
  }
}

// ============================================================================
// FACETS (con cross-filtering)
// ============================================================================

/**
 * Facets con cross-filtering: los counts de cada columna excluyen su propio filtro.
 */
export async function getMonthlyEquipmentDocumentsFacets(searchParams?: DataTableSearchParams, equipmentId?: string) {
  const companyId = await getActiveCompanyId();

  let parsedState: ReturnType<typeof parseSearchParams> | null = null;
  if (searchParams && Object.keys(searchParams).length > 0) {
    parsedState = parseSearchParams(searchParams);
  }

  const hasActiveFilters = parsedState && (Object.keys(parsedState.filters).length > 0 || parsedState.search);

  async function crossWhere(excludeColumn: string) {
    if (!parsedState || !hasActiveFilters) {
      const canViewPrivate = await checkPermissionServer('documentacion', 'documentos-de-equipos', 'view_private');
      // Sin filtros activos: solo condiciones base
      return {
        AND: [
          { vehicles: { company_id: companyId } },
          {
            document_types: {
              is_it_montlhy: true,
              is_active: true,
              ...(!canViewPrivate && { private: { not: true } }),
            },
          },
          { vehicles: { is_active: true } },
          ...(equipmentId ? [] : [{ archived_at: null }]),
          ...(equipmentId ? [{ applies: equipmentId }] : []),
        ],
      };
    }
    const modified = { ...parsedState, filters: { ...parsedState.filters } };
    delete modified.filters[excludeColumn];
    delete modified.filters[`${excludeColumn}_from`];
    delete modified.filters[`${excludeColumn}_to`];
    return buildWhereClause(companyId, modified, equipmentId);
  }

  // Helper: construir Map<string, count> con soporte para null → NULL_FILTER_VALUE
  function toFacetMap(rows: { key: string | null | undefined; count: number }[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const { key, count } of rows) {
      if (key == null) {
        map.set(NULL_FILTER_VALUE, (map.get(NULL_FILTER_VALUE) ?? 0) + count);
      } else {
        map.set(String(key), count);
      }
    }
    return map;
  }

  try {
    const [
      crossWhereState,
      crossWhereVehicle,
      crossWhereDocType,
      crossWhereMandatory,
      crossWhereMultiresource,
      crossWhereContractor,
    ] = await Promise.all([
      crossWhere('state'),
      crossWhere('vehicle'),
      crossWhere('documentType'),
      crossWhere('mandatory'),
      crossWhere('multiresource'),
      crossWhere('contractor'),
    ]);

    const [stateCounts, vehicleGroups, docTypeGroups, mandatoryGroups, multiresourceGroups, contractorGroups] =
      await Promise.all([
        // Estado (enum)
        prisma.documents_equipment.groupBy({
          by: ['state'],
          where: crossWhereState,
          _count: { state: true },
        }),

        // Vehículo / Equipo (FK UUID → vehicles)
        prisma.documents_equipment.groupBy({
          by: ['applies'],
          where: crossWhereVehicle,
          _count: { applies: true },
        }),

        // Tipo de documento (FK UUID → document_types)
        prisma.documents_equipment.groupBy({
          by: ['id_document_types'],
          where: crossWhereDocType,
          _count: { id_document_types: true },
        }),

        // Mandatorio (booleano en document_types) — agrupamos por id_document_types para luego cruzar
        prisma.documents_equipment.groupBy({
          by: ['id_document_types'],
          where: crossWhereMandatory,
          _count: { id_document_types: true },
        }),

        // Multirecurso (booleano en document_types) — agrupamos por id_document_types
        prisma.documents_equipment.groupBy({
          by: ['id_document_types'],
          where: crossWhereMultiresource,
          _count: { id_document_types: true },
        }),

        // Contractor / Afectación (M:M a través de vehicles)
        prisma.documents_equipment.findMany({
          where: crossWhereContractor,
          select: {
            vehicles: {
              select: {
                contractor_equipment: {
                  select: {
                    customers: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        }),
      ]);

    // ─── state map ────────────────────────────────────────────────────────
    const stateMap = toFacetMap(stateCounts.map((r) => ({ key: r.state as string | null, count: r._count.state })));

    // ─── vehicle map + options ────────────────────────────────────────────
    const vehicleIds = vehicleGroups.map((r) => r.applies).filter((id): id is string => id != null);

    const vehicleRecords = vehicleIds.length
      ? await prisma.vehicles.findMany({
          where: { id: { in: vehicleIds } },
          select: { id: true, domain: true, serie: true, intern_number: true },
        })
      : [];

    const vehicleMap = toFacetMap(vehicleGroups.map((r) => ({ key: r.applies, count: r._count.applies })));

    const vehicleOptions = vehicleRecords.map((v) => ({
      id: v.id,
      label: v.domain ?? v.serie ?? v.intern_number ?? v.id,
    }));

    // ─── documentType map + options ────────────────────────────────────────
    const docTypeIds = docTypeGroups.map((r) => r.id_document_types).filter((id): id is string => id != null);

    const docTypeRecords = docTypeIds.length
      ? await prisma.document_types.findMany({
          where: { id: { in: docTypeIds } },
          select: { id: true, name: true },
        })
      : [];

    const docTypeMap = toFacetMap(
      docTypeGroups.map((r) => ({
        key: r.id_document_types,
        count: r._count.id_document_types,
      }))
    );

    const docTypeOptions = docTypeRecords.map((dt) => ({
      id: dt.id,
      name: dt.name,
    }));

    // ─── Lookup de document_types para mandatory y multiresource ─────────────
    // mandatoryGroups y multiresourceGroups son groupBy results (id_document_types + _count)
    // Necesitamos cruzar con document_types para obtener los valores booleanos
    const mandatoryDtIds = mandatoryGroups.map((r) => r.id_document_types).filter((id): id is string => id != null);
    const multiresourceDtIds = multiresourceGroups
      .map((r) => r.id_document_types)
      .filter((id): id is string => id != null);
    const allBoolDtIds = [...new Set([...mandatoryDtIds, ...multiresourceDtIds])];

    const boolDocTypeRecords = allBoolDtIds.length
      ? await prisma.document_types.findMany({
          where: { id: { in: allBoolDtIds } },
          select: { id: true, mandatory: true, multiresource: true },
        })
      : [];

    const boolDtMap = new Map(boolDocTypeRecords.map((dt) => [dt.id, dt]));

    // ─── mandatory map ────────────────────────────────────────────────────
    const mandatoryCountMap = new Map<string, number>();
    for (const row of mandatoryGroups) {
      const count = row._count.id_document_types;
      if (row.id_document_types == null) {
        mandatoryCountMap.set(NULL_FILTER_VALUE, (mandatoryCountMap.get(NULL_FILTER_VALUE) ?? 0) + count);
      } else {
        const dt = boolDtMap.get(row.id_document_types);
        const val = dt?.mandatory;
        const key = val == null ? NULL_FILTER_VALUE : String(val);
        mandatoryCountMap.set(key, (mandatoryCountMap.get(key) ?? 0) + count);
      }
    }

    // ─── multiresource map ────────────────────────────────────────────────
    const multiresourceCountMap = new Map<string, number>();
    for (const row of multiresourceGroups) {
      const count = row._count.id_document_types;
      if (row.id_document_types == null) {
        multiresourceCountMap.set(NULL_FILTER_VALUE, (multiresourceCountMap.get(NULL_FILTER_VALUE) ?? 0) + count);
      } else {
        const dt = boolDtMap.get(row.id_document_types);
        const val = dt?.multiresource;
        const key = val == null ? NULL_FILTER_VALUE : String(val);
        multiresourceCountMap.set(key, (multiresourceCountMap.get(key) ?? 0) + count);
      }
    }

    // ─── contractor map + options ─────────────────────────────────────────
    const contractorCountMap = new Map<string, number>();
    const contractorOptionsMap = new Map<string, string>();

    for (const row of contractorGroups) {
      const contractors = row.vehicles?.contractor_equipment ?? [];
      if (contractors.length === 0) {
        contractorCountMap.set(NULL_FILTER_VALUE, (contractorCountMap.get(NULL_FILTER_VALUE) ?? 0) + 1);
      } else {
        for (const ce of contractors) {
          if (ce.customers?.id) {
            contractorCountMap.set(ce.customers.id, (contractorCountMap.get(ce.customers.id) ?? 0) + 1);
            contractorOptionsMap.set(ce.customers.id, ce.customers.name);
          }
        }
      }
    }

    const contractorOptions = Array.from(contractorOptionsMap.entries()).map(([id, name]) => ({
      id,
      name,
    }));

    return {
      state: stateMap,
      vehicle: vehicleMap,
      vehicleOptions,
      documentType: docTypeMap,
      docTypeOptions,
      mandatory: mandatoryCountMap,
      multiresource: multiresourceCountMap,
      contractor: contractorCountMap,
      contractorOptions,
    };
  } catch (error) {
    logger.error('Error al obtener facets de documentos mensuales de equipos', {
      data: { error },
    });
    throw new Error('Error al obtener los facets de documentos mensuales de equipos');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load — un facet por columnId)
// ============================================================================

/**
 * Retorna counts (y opciones resueltas para FK) para UNA sola columna.
 * Aplica cross-filtering: excluye el filtro propio de la columna solicitada.
 * Usado por el patrón lazy-load de facets en el Client Component.
 */
export async function getMonthlyEquipmentDocumentsSingleFacet(
  columnId: string,
  searchParams: DataTableSearchParams,
  equipmentId?: string
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
} | null> {
  const companyId = await getActiveCompanyId();

  let parsedState: ReturnType<typeof parseSearchParams> | null = null;
  if (searchParams && Object.keys(searchParams).length > 0) {
    parsedState = parseSearchParams(searchParams);
  }

  async function crossWhere(excludeColumn: string) {
    if (!parsedState) {
      const canViewPrivate = await checkPermissionServer('documentacion', 'documentos-de-equipos', 'view_private');
      return {
        AND: [
          { vehicles: { company_id: companyId } },
          {
            document_types: {
              is_it_montlhy: true,
              is_active: true,
              ...(!canViewPrivate && { private: { not: true } }),
            },
          },
          { vehicles: { is_active: true } },
          ...(equipmentId ? [] : [{ archived_at: null }]),
          ...(equipmentId ? [{ applies: equipmentId }] : []),
        ],
      };
    }
    const modified = { ...parsedState, filters: { ...parsedState.filters } };
    delete modified.filters[excludeColumn];
    delete modified.filters[`${excludeColumn}_from`];
    delete modified.filters[`${excludeColumn}_to`];
    return buildWhereClause(companyId, modified, equipmentId);
  }

  function toFacetMap(rows: { key: string | null | undefined; count: number }[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const { key, count } of rows) {
      if (key == null) {
        map.set(NULL_FILTER_VALUE, (map.get(NULL_FILTER_VALUE) ?? 0) + count);
      } else {
        map.set(String(key), count);
      }
    }
    return map;
  }

  try {
    const where = await crossWhere(columnId);

    // ── Estado (enum directo en documents_equipment) ──────────────────────────
    if (columnId === 'state') {
      const rows = await prisma.documents_equipment.groupBy({ by: ['state'], where, _count: { state: true } });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.state as string | null, count: r._count.state }))) };
    }

    // ── Tipo de Documento (FK UUID → document_types) ──────────────────────────
    if (columnId === 'documentType') {
      const rows = await prisma.documents_equipment.groupBy({
        by: ['id_document_types'],
        where,
        _count: { id_document_types: true },
      });
      const counts = toFacetMap(rows.map((r) => ({ key: r.id_document_types, count: r._count.id_document_types })));
      const ids = rows.map((r) => r.id_document_types).filter((id): id is string => id != null);
      const resolvedOptions =
        ids.length > 0
          ? await prisma.document_types.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
          : [];
      return { counts, resolvedOptions };
    }

    // ── Mandatorio (booleano en document_types) ────────────────────────────────
    if (columnId === 'mandatory') {
      const rows = await prisma.documents_equipment.groupBy({
        by: ['id_document_types'],
        where,
        _count: { id_document_types: true },
      });
      const dtIds = rows.map((r) => r.id_document_types).filter((id): id is string => id != null);
      const dtRecords =
        dtIds.length > 0
          ? await prisma.document_types.findMany({
              where: { id: { in: dtIds } },
              select: { id: true, mandatory: true },
            })
          : [];
      const dtMap = new Map(dtRecords.map((dt) => [dt.id, dt.mandatory]));
      const mandatoryCountMap = new Map<string, number>();
      for (const row of rows) {
        const count = row._count.id_document_types;
        if (row.id_document_types == null) {
          mandatoryCountMap.set(NULL_FILTER_VALUE, (mandatoryCountMap.get(NULL_FILTER_VALUE) ?? 0) + count);
        } else {
          const val = dtMap.get(row.id_document_types);
          const key = val == null ? NULL_FILTER_VALUE : String(val);
          mandatoryCountMap.set(key, (mandatoryCountMap.get(key) ?? 0) + count);
        }
      }
      return { counts: mandatoryCountMap };
    }

    // ── Multirecurso (booleano en document_types) ──────────────────────────────
    if (columnId === 'multiresource') {
      const rows = await prisma.documents_equipment.groupBy({
        by: ['id_document_types'],
        where,
        _count: { id_document_types: true },
      });
      const dtIds = rows.map((r) => r.id_document_types).filter((id): id is string => id != null);
      const dtRecords =
        dtIds.length > 0
          ? await prisma.document_types.findMany({
              where: { id: { in: dtIds } },
              select: { id: true, multiresource: true },
            })
          : [];
      const dtMap = new Map(dtRecords.map((dt) => [dt.id, dt.multiresource]));
      const multiresourceCountMap = new Map<string, number>();
      for (const row of rows) {
        const count = row._count.id_document_types;
        if (row.id_document_types == null) {
          multiresourceCountMap.set(NULL_FILTER_VALUE, (multiresourceCountMap.get(NULL_FILTER_VALUE) ?? 0) + count);
        } else {
          const val = dtMap.get(row.id_document_types);
          const key = val == null ? NULL_FILTER_VALUE : String(val);
          multiresourceCountMap.set(key, (multiresourceCountMap.get(key) ?? 0) + count);
        }
      }
      return { counts: multiresourceCountMap };
    }

    // ── Contractor / Afectación (M:M a través de vehicles) ────────────────────
    if (columnId === 'contractor') {
      const rows = await prisma.documents_equipment.findMany({
        where,
        select: {
          vehicles: {
            select: {
              contractor_equipment: {
                select: { customers: { select: { id: true, name: true } } },
              },
            },
          },
        },
      });
      const contractorCountMap = new Map<string, number>();
      const contractorOptionsMap = new Map<string, string>();
      for (const row of rows) {
        const contractors = row.vehicles?.contractor_equipment ?? [];
        if (contractors.length === 0) {
          contractorCountMap.set(NULL_FILTER_VALUE, (contractorCountMap.get(NULL_FILTER_VALUE) ?? 0) + 1);
        } else {
          for (const ce of contractors) {
            if (ce.customers?.id) {
              contractorCountMap.set(ce.customers.id, (contractorCountMap.get(ce.customers.id) ?? 0) + 1);
              contractorOptionsMap.set(ce.customers.id, ce.customers.name);
            }
          }
        }
      }
      const resolvedOptions = Array.from(contractorOptionsMap.entries()).map(([id, name]) => ({ id, name }));
      return { counts: contractorCountMap, resolvedOptions };
    }

    logger.warn('getMonthlyEquipmentDocumentsSingleFacet: columnId no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet individual de documentos mensuales de equipos', {
      data: { error, columnId },
    });
    throw new Error('Error al obtener el facet de documentos mensuales de equipos');
  }
}
