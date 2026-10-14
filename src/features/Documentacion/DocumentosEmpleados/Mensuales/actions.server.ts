'use server';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  NULL_FILTER_VALUE,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('MonthlyEmployeeDocs/actions.server');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Campos directos de documents_employees que se pueden ordenar server-side */
const VALID_SORT_FIELDS = new Set([
  'created_at',
  'state',
  'period',
  // FK columns resueltas via FK_SORT_MAP
  'employee',
  'documentType',
]);

/** Mapeo de columnId → orderBy de Prisma para columnas FK */
const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  employee: (dir) => ({ employees: { lastname: dir } }),
  documentType: (dir) => ({ document_types: { name: dir } }),
};

/** Columnas con filtro de texto libre */
const TEXT_FILTER_COLUMNS: string[] = ['employee', 'period', 'deny_reason', 'fileNumber'];

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
const MONTHLY_DOCS_SELECT = {
  id: true,
  created_at: true,
  state: true,
  period: true,
  document_path: true,
  deny_reason: true,
  applies: true,
  archived_at: true,
  id_document_types: true,
  // Empleado (FK → employees)
  employees: {
    select: {
      id: true,
      firstname: true,
      lastname: true,
      document_number: true,
      file: true,
      // Afectaciones del empleado (M:M → customers)
      contractor_employee: {
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
  documents_employees_logs: {
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
  employeeId?: string,
  includeArchived = false
) {
  // En la vista de detalle de un empleado (employeeId presente) se incluyen los
  // documentos archivados como historial; en la tabla general del módulo se ocultan.
  const showArchived = includeArchived || !!employeeId;
  const canViewPrivate = await checkPermissionServer('documentacion', 'documentos-de-empleados', 'view_private');
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

  // ─── Filtro mandatory (campo booleano en document_types) ──────────────────
  const mandatoryValues = state.filters['mandatory'];
  const mandatoryFilter: Record<string, unknown> = {};
  if (mandatoryValues?.length) {
    const hasNull = mandatoryValues.includes(NULL_FILTER_VALUE);
    const realValues = mandatoryValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      // mixto se maneja en extraAndConditions
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
      // mixto
    } else if (hasNull) {
      multiresourceFilter.document_types = { multiresource: null };
    } else {
      const boolValues = realValues.map((v) => v === 'true');
      multiresourceFilter.document_types = { multiresource: { in: boolValues } };
    }
  }

  // ─── Filtro contractor (afectación M:M a través de employees) ─────────────
  const contractorValues = state.filters['contractor'];
  const contractorFilter: Record<string, unknown> = {};
  if (contractorValues?.length) {
    const hasNull = contractorValues.includes(NULL_FILTER_VALUE);
    const realValues = contractorValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      // mixto
    } else if (hasNull) {
      contractorFilter.employees = { contractor_employee: { none: {} } };
    } else {
      contractorFilter.employees = {
        contractor_employee: {
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
          { employees: { contractor_employee: { some: { customers: { id: { in: realValues } } } } } },
          { employees: { contractor_employee: { none: {} } } },
        ],
      });
    }
  }

  // Construir condiciones base + filtros adicionales en AND para evitar colisiones de claves
  const andConditions: Record<string, unknown>[] = [
    // Filtro base: compañía del empleado
    { employees: { company_id: companyId } },
    // Filtro base: solo tipos de documento mensuales y activos
    { document_types: { is_it_montlhy: true, is_active: true, ...(!canViewPrivate && { private: { not: true } }) } },
    // Excluir documentos archivados (historial / no vigente) salvo en la vista de detalle
    ...(showArchived ? [] : [{ archived_at: null }]),
    // Filtro opcional por empleado específico (para vista de detalle)
    ...(employeeId ? [{ applies: employeeId }] : []),
  ];

  // Búsqueda global: legajo (coincidencia exacta), nombre del empleado o nombre del documento
  if (state.search) {
    andConditions.push({
      OR: [
        { employees: { file: { equals: state.search } } },
        { document_types: { name: { contains: state.search, mode: 'insensitive' as const } } },
        { employees: { lastname: { contains: state.search, mode: 'insensitive' as const } } },
        { employees: { firstname: { contains: state.search, mode: 'insensitive' as const } } },
      ],
    });
  }

  // Filtro texto de empleado (busca por nombre y apellido)
  const employeeTextVal = state.filters['employee']?.[0];
  if (employeeTextVal) {
    andConditions.push({
      OR: [
        { employees: { lastname: { contains: employeeTextVal, mode: 'insensitive' as const } } },
        { employees: { firstname: { contains: employeeTextVal, mode: 'insensitive' as const } } },
      ],
    });
  }

  // Filtro texto de período (campo directo en documents_employees)
  const periodTextVal = state.filters['period']?.[0];
  if (periodTextVal) {
    andConditions.push({ period: { contains: periodTextVal, mode: 'insensitive' as const } });
  }

  // Filtro texto de razón de rechazo (campo directo en documents_employees)
  const denyReasonTextVal = state.filters['deny_reason']?.[0];
  if (denyReasonTextVal) {
    andConditions.push({ deny_reason: { contains: denyReasonTextVal, mode: 'insensitive' as const } });
  }

  // Filtro de legajo (coincidencia exacta para evitar que "1" devuelva "10", "100", etc.)
  const fileNumberVal = state.filters['fileNumber']?.[0];
  if (fileNumberVal) {
    andConditions.push({ employees: { file: { equals: fileNumberVal } } });
  }

  // Filtro por state (enum)
  if (Object.keys(filtersWhere).length > 0) {
    andConditions.push(filtersWhere);
  }

  // Filtro por fechas
  if (Object.keys(dateFiltersWhere).length > 0) {
    andConditions.push(dateFiltersWhere);
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

export async function getMonthlyEmployeeDocumentsPaginated(searchParams: DataTableSearchParams, employeeId?: string) {
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);

    const { skip, take } = stateToPrismaParams(state);

    const where = await buildWhereClause(companyId, state, employeeId);

    // Safe orderBy: multi-sort, solo campos válidos
    const resolvedSorts: Record<string, unknown>[] = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
        const fkMapper = FK_SORT_MAP[s.id];
        resolvedSorts.push(fkMapper ? fkMapper(dir) : { [s.id]: dir });
      }
    }

    const safeOrderBy = [...resolvedSorts, { employees: { lastname: 'asc' as const } }];

    const [data, total] = await Promise.all([
      prisma.documents_employees.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: MONTHLY_DOCS_SELECT,
      }),
      prisma.documents_employees.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener documentos mensuales de empleados paginados', { data: { error } });
    throw new Error('Error al obtener los documentos mensuales de empleados');
  }
}

export type MonthlyEmployeeDocumentListItem = Awaited<
  ReturnType<typeof getMonthlyEmployeeDocumentsPaginated>
>['data'][number];

// ============================================================================
// EXPORT QUERY (sin paginación)
// ============================================================================

export async function getAllMonthlyEmployeeDocumentsForExport(
  searchParams: DataTableSearchParams,
  employeeId?: string
) {
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    const where = await buildWhereClause(companyId, state, employeeId);

    const data = await prisma.documents_employees.findMany({
      orderBy: [{ employees: { lastname: 'asc' } }],
      where,
      select: MONTHLY_DOCS_SELECT,
    });

    return data;
  } catch (error) {
    logger.error('Error al exportar documentos mensuales de empleados', { data: { error } });
    throw new Error('Error al exportar los documentos mensuales de empleados');
  }
}

// ============================================================================
// FACETS
// ============================================================================

/**
 * Facets con cross-filtering: los counts de cada columna excluyen su propio filtro.
 */
export async function getMonthlyEmployeeDocumentsFacets(searchParams?: DataTableSearchParams, employeeId?: string) {
  const companyId = await getActiveCompanyId();

  const baseDocumentTypesWhere = {
    is_it_montlhy: true,
    is_active: true,
  };

  let parsedState: ReturnType<typeof parseSearchParams> | null = null;
  if (searchParams && Object.keys(searchParams).length > 0) {
    parsedState = parseSearchParams(searchParams);
  }

  const hasActiveFilters = parsedState && (Object.keys(parsedState.filters).length > 0 || parsedState.search);

  async function crossWhere(excludeColumn: string) {
    if (!parsedState || !hasActiveFilters) {
      const canViewPrivate = await checkPermissionServer('documentacion', 'documentos-de-empleados', 'view_private');
      // Sin filtros activos: solo condiciones base
      return {
        AND: [
          { employees: { company_id: companyId } },
          { document_types: { ...baseDocumentTypesWhere, ...(!canViewPrivate && { private: { not: true } }) } },
          ...(employeeId ? [] : [{ archived_at: null }]),
          ...(employeeId ? [{ applies: employeeId }] : []),
        ],
      };
    }
    const modified = { ...parsedState, filters: { ...parsedState.filters } };
    delete modified.filters[excludeColumn];
    delete modified.filters[`${excludeColumn}_from`];
    delete modified.filters[`${excludeColumn}_to`];
    return buildWhereClause(companyId, modified, employeeId);
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
      crossWhereEmployee,
      crossWhereDocType,
      crossWhereMandatory,
      crossWhereMultiresource,
      crossWhereContractor,
    ] = await Promise.all([
      Promise.resolve(crossWhere('state')),
      Promise.resolve(crossWhere('employee')),
      Promise.resolve(crossWhere('documentType')),
      Promise.resolve(crossWhere('mandatory')),
      Promise.resolve(crossWhere('multiresource')),
      Promise.resolve(crossWhere('contractor')),
    ]);

    const [stateCounts, employeeGroups, docTypeGroups, mandatoryGroups, multiresourceGroups, contractorGroups] =
      await Promise.all([
        // Estado (enum)
        prisma.documents_employees.groupBy({
          by: ['state'],
          where: crossWhereState,
          _count: { state: true },
        }),

        // Empleado (FK UUID → employees)
        prisma.documents_employees.groupBy({
          by: ['applies'],
          where: crossWhereEmployee,
          _count: { applies: true },
        }),

        // Tipo de documento (FK UUID → document_types)
        prisma.documents_employees.groupBy({
          by: ['id_document_types'],
          where: crossWhereDocType,
          _count: { id_document_types: true },
        }),

        // Mandatorio (booleano en document_types) — agrupamos por id_document_types para luego cruzar
        prisma.documents_employees.groupBy({
          by: ['id_document_types'],
          where: crossWhereMandatory,
          _count: { id_document_types: true },
        }),

        // Multirecurso (booleano en document_types) — agrupamos por id_document_types
        prisma.documents_employees.groupBy({
          by: ['id_document_types'],
          where: crossWhereMultiresource,
          _count: { id_document_types: true },
        }),

        // Contractor / Afectación (M:M)
        prisma.documents_employees.findMany({
          where: crossWhereContractor,
          select: {
            employees: {
              select: {
                contractor_employee: {
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

    // ─── employee map + options ───────────────────────────────────────────
    const employeeIds = employeeGroups.map((r) => r.applies).filter((id): id is string => id != null);

    const employeeRecords = employeeIds.length
      ? await prisma.employees.findMany({
          where: { id: { in: employeeIds } },
          select: { id: true, firstname: true, lastname: true, file: true },
        })
      : [];

    const employeeMap = toFacetMap(employeeGroups.map((r) => ({ key: r.applies, count: r._count.applies })));

    const employeeOptions = employeeRecords.map((e) => ({
      id: e.id,
      label: `[${e.file}] ${e.lastname} ${e.firstname}`,
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
      docTypeGroups.map((r) => ({ key: r.id_document_types, count: r._count.id_document_types }))
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
    // mandatoryGroups: { id_document_types: string | null, _count: { id_document_types: number } }[]
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
    // multiresourceGroups: { id_document_types: string | null, _count: { id_document_types: number } }[]
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
      const contractors = row.employees?.contractor_employee ?? [];
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
      employee: employeeMap,
      employeeOptions,
      documentType: docTypeMap,
      docTypeOptions,
      mandatory: mandatoryCountMap,
      multiresource: multiresourceCountMap,
      contractor: contractorCountMap,
      contractorOptions,
    };
  } catch (error) {
    logger.error('Error al obtener facets de documentos mensuales', { data: { error } });
    throw new Error('Error al obtener los facets de documentos mensuales');
  }
}

// ============================================================================
// SINGLE FACET — lazy-load on-demand por columna
// ============================================================================

/**
 * Retorna counts + opciones resueltas para UNA sola columna.
 * Usa crossWhere(columnId) para cross-filtering: aplica todos los filtros activos
 * excepto el de la propia columna, de modo que los counts sean correctos.
 */
export async function getMonthlyEmployeeDocumentsSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams,
  employeeId?: string
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
} | null> {
  const companyId = await getActiveCompanyId();

  let parsedState: ReturnType<typeof parseSearchParams> | null = null;
  if (searchParams && Object.keys(searchParams).length > 0) {
    parsedState = parseSearchParams(searchParams);
  }

  const hasActiveFilters = parsedState && (Object.keys(parsedState.filters).length > 0 || parsedState.search);

  async function crossWhere(excludeColumn: string) {
    if (!parsedState || !hasActiveFilters) {
      const canViewPrivate = await checkPermissionServer('documentacion', 'documentos-de-empleados', 'view_private');
      return {
        AND: [
          { employees: { company_id: companyId } },
          {
            document_types: {
              is_it_montlhy: true,
              is_active: true,
              ...(!canViewPrivate && { private: { not: true } }),
            },
          },
          ...(employeeId ? [] : [{ archived_at: null }]),
          ...(employeeId ? [{ applies: employeeId }] : []),
        ],
      };
    }
    const modified = { ...parsedState, filters: { ...parsedState.filters } };
    delete modified.filters[excludeColumn];
    delete modified.filters[`${excludeColumn}_from`];
    delete modified.filters[`${excludeColumn}_to`];
    return buildWhereClause(companyId, modified, employeeId);
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

    // ── state (enum directo) ──────────────────────────────────────────────────
    if (columnId === 'state') {
      const rows = await prisma.documents_employees.groupBy({
        by: ['state'],
        where,
        _count: { state: true },
      });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.state as string | null, count: r._count.state }))),
      };
    }

    // ── documentType (FK UUID → document_types) ───────────────────────────────
    if (columnId === 'documentType') {
      const rows = await prisma.documents_employees.groupBy({
        by: ['id_document_types'],
        where,
        _count: { id_document_types: true },
      });
      const counts = toFacetMap(rows.map((r) => ({ key: r.id_document_types, count: r._count.id_document_types })));
      const ids = rows.map((r) => r.id_document_types).filter((id): id is string => id != null);
      const resolvedOptions = ids.length
        ? await prisma.document_types.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
        : [];
      return { counts, resolvedOptions };
    }

    // ── mandatory (booleano en document_types) ────────────────────────────────
    if (columnId === 'mandatory') {
      const rows = await prisma.documents_employees.groupBy({
        by: ['id_document_types'],
        where,
        _count: { id_document_types: true },
      });
      const dtIds = rows.map((r) => r.id_document_types).filter((id): id is string => id != null);
      const dtRecords = dtIds.length
        ? await prisma.document_types.findMany({
            where: { id: { in: dtIds } },
            select: { id: true, mandatory: true },
          })
        : [];
      const dtMap = new Map(dtRecords.map((dt) => [dt.id, dt.mandatory]));
      const countMap = new Map<string, number>();
      for (const row of rows) {
        const count = row._count.id_document_types;
        if (row.id_document_types == null) {
          countMap.set(NULL_FILTER_VALUE, (countMap.get(NULL_FILTER_VALUE) ?? 0) + count);
        } else {
          const val = dtMap.get(row.id_document_types);
          const key = val == null ? NULL_FILTER_VALUE : String(val);
          countMap.set(key, (countMap.get(key) ?? 0) + count);
        }
      }
      return { counts: countMap };
    }

    // ── multiresource (booleano en document_types) ────────────────────────────
    if (columnId === 'multiresource') {
      const rows = await prisma.documents_employees.groupBy({
        by: ['id_document_types'],
        where,
        _count: { id_document_types: true },
      });
      const dtIds = rows.map((r) => r.id_document_types).filter((id): id is string => id != null);
      const dtRecords = dtIds.length
        ? await prisma.document_types.findMany({
            where: { id: { in: dtIds } },
            select: { id: true, multiresource: true },
          })
        : [];
      const dtMap = new Map(dtRecords.map((dt) => [dt.id, dt.multiresource]));
      const countMap = new Map<string, number>();
      for (const row of rows) {
        const count = row._count.id_document_types;
        if (row.id_document_types == null) {
          countMap.set(NULL_FILTER_VALUE, (countMap.get(NULL_FILTER_VALUE) ?? 0) + count);
        } else {
          const val = dtMap.get(row.id_document_types);
          const key = val == null ? NULL_FILTER_VALUE : String(val);
          countMap.set(key, (countMap.get(key) ?? 0) + count);
        }
      }
      return { counts: countMap };
    }

    // ── contractor (M:M a través de employees) ────────────────────────────────
    if (columnId === 'contractor') {
      const docs = await prisma.documents_employees.findMany({
        where,
        select: {
          employees: {
            select: {
              contractor_employee: {
                select: { customers: { select: { id: true, name: true } } },
              },
            },
          },
        },
      });
      const countMap = new Map<string, number>();
      const optionsMap = new Map<string, string>();
      for (const doc of docs) {
        const contractors = doc.employees?.contractor_employee ?? [];
        if (contractors.length === 0) {
          countMap.set(NULL_FILTER_VALUE, (countMap.get(NULL_FILTER_VALUE) ?? 0) + 1);
        } else {
          for (const ce of contractors) {
            if (ce.customers?.id) {
              countMap.set(ce.customers.id, (countMap.get(ce.customers.id) ?? 0) + 1);
              optionsMap.set(ce.customers.id, ce.customers.name);
            }
          }
        }
      }
      const resolvedOptions = Array.from(optionsMap.entries()).map(([id, name]) => ({ id, name }));
      return { counts: countMap, resolvedOptions };
    }

    logger.warn('getMonthlyEmployeeDocumentsSingleFacet: columnId no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet individual de documentos mensuales', { data: { error, columnId } });
    throw new Error('Error al obtener el facet de documentos mensuales');
  }
}
