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

const logger = new Logger('DocumentosEmpleadosPermanentes/actions.server');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Campos directos de documents_employees que se pueden ordenar server-side */
const VALID_SORT_FIELDS = new Set([
  'created_at',
  'validity',
  'state',
  // FK columns (sorted by relation name)
  'employee',
  'document_type',
]);

/** Mapeo de columnId → orderBy de Prisma para columnas FK */
const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  employee: (dir) => ({ employees: { lastname: dir } }),
  document_type: (dir) => ({ document_types: { name: dir } }),
};

/**
 * Columnas con filtro de texto libre.
 * 'employee' se maneja manualmente (búsqueda en relación).
 * 'deny_reason' es campo directo de la tabla.
 * 'fileNumber' se maneja manualmente con coincidencia exacta (equals).
 */
const TEXT_FILTER_COLUMNS: string[] = ['employee', 'deny_reason', 'fileNumber'];

/** Columnas con filtro de rango de fechas */
const DATE_RANGE_COLUMNS = ['created_at', 'validity'];

/**
 * Mapping de columnId (URL) → campo real en Prisma
 */
const COLUMN_MAP: Record<string, string> = {
  state: 'state',
  document_type: 'id_document_types',
};

/** Select común con todas las relaciones resueltas */
const DOCS_EMPLOYEES_PERMANENTES_SELECT = {
  id: true,
  created_at: true,
  validity: true,
  state: true,
  is_active: true,
  archived_at: true,
  deny_reason: true,
  document_path: true,
  applies: true,
  id_document_types: true,
  employees: {
    select: {
      id: true,
      firstname: true,
      lastname: true,
      document_number: true,
      file: true,
    },
  },
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
} as const;

// ============================================================================
// WHERE CLAUSE BUILDER
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
      'mandatory',
      'multiresource',
    ],
  });

  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS);

  // ─── Filtro texto de empleado (busca por nombre y apellido) ──────────────
  const employeeTextConditions: Record<string, unknown>[] = [];
  const employeeTextVal = state.filters['employee']?.[0];
  if (employeeTextVal) {
    employeeTextConditions.push({
      OR: [
        { employees: { lastname: { contains: employeeTextVal, mode: 'insensitive' } } },
        { employees: { firstname: { contains: employeeTextVal, mode: 'insensitive' } } },
      ],
    });
  }

  // ─── Filtro texto de motivo de rechazo ────────────────────────────────────
  const denyReasonTextConditions: Record<string, unknown>[] = [];
  const denyReasonTextVal = state.filters['deny_reason']?.[0];
  if (denyReasonTextVal) {
    denyReasonTextConditions.push({
      deny_reason: { contains: denyReasonTextVal, mode: 'insensitive' },
    });
  }

  // ─── Filtro de legajo (coincidencia exacta) ───────────────────────────────
  const fileNumberConditions: Record<string, unknown>[] = [];
  const fileNumberVal = state.filters['fileNumber']?.[0];
  if (fileNumberVal) {
    fileNumberConditions.push({
      employees: { file: { equals: fileNumberVal } },
    });
  }

  // ─── Filtros de document_types (mandatory y multiresource son campos de document_types) ─
  // Construir el objeto document_types combinando is_it_montlhy + filtros opcionales.
  const documentTypesConditions: Record<string, unknown> = {
    is_it_montlhy: false,
    ...(!canViewPrivate && { private: { not: true } }),
  };

  const mandatoryValues = state.filters['mandatory'];
  if (mandatoryValues?.length) {
    const boolValues = mandatoryValues.map((v) => v === 'true');
    documentTypesConditions.mandatory = { in: boolValues };
  }

  const multiresourceValues = state.filters['multiresource'];
  if (multiresourceValues?.length) {
    const boolValues = multiresourceValues.map((v) => v === 'true');
    documentTypesConditions.multiresource = { in: boolValues };
  }

  // Búsqueda global: legajo (coincidencia exacta), nombre del empleado o nombre del documento
  const searchConditions: Record<string, unknown>[] = [];
  if (state.search) {
    searchConditions.push({
      OR: [
        { employees: { file: { equals: state.search } } },
        { employees: { lastname: { contains: state.search, mode: 'insensitive' } } },
        { employees: { firstname: { contains: state.search, mode: 'insensitive' } } },
        { document_types: { name: { contains: state.search, mode: 'insensitive' } } },
      ],
    });
  }

  const andConditions = [
    ...searchConditions,
    ...employeeTextConditions,
    ...denyReasonTextConditions,
    ...fileNumberConditions,
  ];

  return {
    // Solo documentos permanentes (no mensuales) con empleados activos de la compañía
    ...(employeeId ? { applies: employeeId } : {}),
    // Excluir documentos archivados (historial / no vigente) salvo en la vista de detalle
    ...(showArchived ? {} : { archived_at: null }),
    employees: {
      company_id: companyId,
      is_active: true,
    },
    document_types: documentTypesConditions,
    ...filtersWhere,
    ...dateFiltersWhere,
    ...(andConditions.length > 0 ? { AND: andConditions } : {}),
  };
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getEmployeePermanentDocumentsPaginated(searchParams: DataTableSearchParams, employeeId?: string) {
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
        select: DOCS_EMPLOYEES_PERMANENTES_SELECT,
      }),
      prisma.documents_employees.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener documentos permanentes de empleados paginados', { data: { error } });
    throw new Error('Error al obtener los documentos permanentes de empleados');
  }
}

export type EmployeePermanentDocumentListItem = Awaited<
  ReturnType<typeof getEmployeePermanentDocumentsPaginated>
>['data'][number];

// ============================================================================
// EXPORT QUERY (sin paginación)
// ============================================================================

export async function getAllEmployeePermanentDocumentsForExport(
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
      select: DOCS_EMPLOYEES_PERMANENTES_SELECT,
    });

    return data;
  } catch (error) {
    logger.error('Error al exportar documentos permanentes de empleados', { data: { error } });
    throw new Error('Error al exportar los documentos permanentes de empleados');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load individual)
// ============================================================================

/**
 * Obtiene opciones y counts para UN SOLO filtro facetado, con cross-filtering.
 * Diseñado para lazy-load: cada filtro llama a esta función al abrirse.
 */
export async function getEmployeePermanentDocumentsSingleFacet(
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
        ...(employeeId ? { applies: employeeId } : {}),
        ...(employeeId ? {} : { archived_at: null }),
        employees: { company_id: companyId, is_active: true },
        document_types: { is_it_montlhy: false, ...(!canViewPrivate && { private: { not: true } }) },
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

    // ── Estado (enum directo en documents_employees) ──────────────────────
    if (columnId === 'state') {
      const rows = await prisma.documents_employees.groupBy({
        by: ['state'],
        where,
        _count: true,
      });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.state as string | null, count: r._count }))),
      };
    }

    // ── Empleado (FK via campo applies) ────────────────────────────────────
    if (columnId === 'employee') {
      const rows = await prisma.documents_employees.groupBy({
        by: ['applies'],
        where,
        _count: true,
      });
      const employeeIds = rows.map((r) => r.applies).filter(Boolean) as string[];
      const employeeRecords =
        employeeIds.length > 0
          ? await prisma.employees.findMany({
              where: { id: { in: employeeIds } },
              select: { id: true, firstname: true, lastname: true, file: true },
            })
          : [];

      const counts = toFacetMap(rows.map((r) => ({ key: r.applies, count: r._count })));
      const resolvedOptions = employeeRecords.map((e) => ({
        id: e.id,
        name: `[${e.file}] ${e.lastname} ${e.firstname}`,
      }));

      return { counts, resolvedOptions };
    }

    // ── Tipo de documento (FK UUID → document_types) ──────────────────────
    if (columnId === 'document_type') {
      const rows = await prisma.documents_employees.groupBy({
        by: ['id_document_types'],
        where,
        _count: true,
      });
      const documentTypeIds = rows.map((r) => r.id_document_types).filter(Boolean) as string[];
      const documentTypeRecords =
        documentTypeIds.length > 0
          ? await prisma.document_types.findMany({
              where: { id: { in: documentTypeIds } },
              select: { id: true, name: true },
            })
          : [];

      const counts = toFacetMap(rows.map((r) => ({ key: r.id_document_types, count: r._count })));
      const resolvedOptions = documentTypeRecords.map((dt) => ({ id: dt.id, name: dt.name }));

      return { counts, resolvedOptions };
    }

    // ── Mandatory (booleano en document_types) ────────────────────────────
    if (columnId === 'mandatory') {
      const rows = await prisma.document_types
        .findMany({
          where: {
            is_it_montlhy: false,
            documents_employees: { some: where },
          },
          select: {
            mandatory: true,
            _count: { select: { documents_employees: true } },
          },
          distinct: ['mandatory'],
        })
        .then((r) => r.map((row) => ({ key: String(row.mandatory), count: row._count.documents_employees })));
      return { counts: toFacetMap(rows) };
    }

    // ── Multiresource (booleano en document_types) ────────────────────────
    if (columnId === 'multiresource') {
      const rows = await prisma.document_types
        .findMany({
          where: {
            is_it_montlhy: false,
            documents_employees: { some: where },
          },
          select: {
            multiresource: true,
            _count: { select: { documents_employees: true } },
          },
          distinct: ['multiresource'],
        })
        .then((r) => r.map((row) => ({ key: String(row.multiresource), count: row._count.documents_employees })));
      return { counts: toFacetMap(rows) };
    }

    logger.warn('getEmployeePermanentDocumentsSingleFacet: columnId no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet de documentos permanentes de empleados', { data: { error, columnId } });
    return null;
  }
}
