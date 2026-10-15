'use server';

import type { Prisma } from '@/generated/prisma/client';
import { document_applies } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  NULL_FILTER_VALUE,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import type { ComplianceType } from '../../shared/compliance';
import { parseDocumentConditions } from '../../shared/compliance/applicability';
import { loadComplianceDataset } from '../../shared/compliance/server/dataset.server';
import {
  assertDocTypeIdPermission,
  assertDocTypePermission,
  hasDocTypePermission,
} from '../lib/document-type-permissions';
import { documentTypeCompanyScope, findScopedDocumentType } from '../lib/document-type-scope';
import {
  BOOLEAN_FILTER_COLUMNS,
  DATE_RANGE_COLUMNS,
  parseDocTypeTableState,
  TEXT_FILTER_COLUMNS,
  type DocTypeTableState,
} from '../lib/table-state';
import { computeApplicabilityDelta } from '../lib/type-coverage';

// NOTE: document_applies is NOT re-exported from 'use server' files.
// Callers must import it directly from '@/generated/prisma/enums'.

const logger = new Logger('features/TiposDocumentos/queries');

// ============================================================================
// CONSTANTS
// ============================================================================

const VALID_SORT_FIELDS = new Set([
  'name',
  'mandatory',
  'explired',
  'special',
  'multiresource',
  'has_policy_number',
  'is_it_montlhy',
  'private',
  'down_document',
  'created_at',
  'equipment_type',
  'applies',
  'is_active',
]);

/** Tope de filas de una exportación a Excel. */
const MAX_EXPORT_ROWS = 10_000;

/** Tope del tamaño de página. */
const MAX_PAGE_SIZE = 100;

type BooleanFilterColumn = (typeof BOOLEAN_FILTER_COLUMNS)[number];

// ============================================================================
// SELECT — excluye 'conditions' (JSON pesado, se carga solo en edición)
// ============================================================================

const DOC_TYPE_SELECT = {
  id: true,
  name: true,
  applies: true,
  multiresource: true,
  has_policy_number: true,
  mandatory: true,
  explired: true,
  special: true,
  is_active: true,
  description: true,
  company_id: true,
  is_it_montlhy: true,
  private: true,
  down_document: true,
  available_for_pre_file: true,
  equipment_type: true,
  created_at: true,
} as const;

/** Select para edición: DOC_TYPE_SELECT + `conditions` (JSON pesado, sólo acá). */
const DOC_TYPE_EDIT_SELECT = { ...DOC_TYPE_SELECT, conditions: true } as const;

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Construye el WHERE compartido entre paginated, export y facets.
 * Todo va dentro de un único `AND` para que ningún filtro pise al perímetro de empresa (`buildFiltersWhere`
 * escribe su propio `AND` cuando mezcla "sin asignar" con valores reales). El estado ya viene restringido
 * a las columnas filtrables (`parseDocTypeTableState`).
 * Filtra tipos privados si el usuario no tiene permiso `view_private`.
 */
async function buildWhereClause(
  applies: document_applies,
  companyId: string,
  state: DocTypeTableState
): Promise<Prisma.document_typesWhereInput> {
  const canViewPrivate = await hasDocTypePermission(applies, 'view_private');

  const filtersWhere = buildFiltersWhere(
    state.filters,
    {},
    {
      exclude: [
        ...TEXT_FILTER_COLUMNS,
        ...BOOLEAN_FILTER_COLUMNS,
        ...DATE_RANGE_COLUMNS.flatMap((c) => [`${c}_from`, `${c}_to`]),
      ],
    }
  );

  // Boolean filters: convert string 'true'/'false' → actual boolean
  const boolFilters: Record<string, boolean | { in: boolean[] }> = {};
  for (const col of BOOLEAN_FILTER_COLUMNS) {
    const values = state.filters[col];
    if (!values?.length) continue;
    const boolValues = values.filter((v) => v === 'true' || v === 'false').map((v) => v === 'true');
    if (boolValues.length === 0) continue;
    boolFilters[col] = boolValues.length === 1 ? boolValues[0] : { in: boolValues };
  }

  // Los helpers del DataTable devuelven objetos sueltos (`Record<string, unknown>`): se tipan al unirlos.
  const clauses: Prisma.document_typesWhereInput[] = [
    documentTypeCompanyScope(companyId),
    { applies },
    buildSearchWhere(state.search, ['name', 'description']) as Prisma.document_typesWhereInput,
    filtersWhere as Prisma.document_typesWhereInput,
    buildTextFiltersWhere(state.filters, [...TEXT_FILTER_COLUMNS]) as Prisma.document_typesWhereInput,
    buildDateRangeFiltersWhere(state.filters, [...DATE_RANGE_COLUMNS]) as Prisma.document_typesWhereInput,
    boolFilters,
    ...(canViewPrivate ? [] : [{ OR: [{ private: false }, { private: null }] }]),
  ];

  return { AND: clauses };
}

// ============================================================================
// PAGINATED QUERY (PRIVATE BASE)
// ============================================================================

async function getDocTypesPaginated(applies: document_applies, searchParams: DataTableSearchParams) {
  await assertDocTypePermission(applies, 'view');
  const companyId = await getActiveCompanyId();
  try {
    const state = parseDocTypeTableState(searchParams);
    const { skip, take } = clampedPageParams(state, { max: MAX_PAGE_SIZE });
    const where = await buildWhereClause(applies, companyId, state);

    // Safe multi-sort, only whitelisted fields
    const resolvedSorts: Record<string, 'asc' | 'desc'>[] = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        resolvedSorts.push({ [s.id]: s.desc ? 'desc' : 'asc' });
      }
    }
    // Inactivos siempre al final, luego por nombre
    const safeOrderBy = [{ is_active: 'desc' as const }, ...resolvedSorts, { name: 'asc' as const }];

    const [rows, total] = await Promise.all([
      prisma.document_types.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: { ...DOC_TYPE_SELECT, conditions: true },
      }),
      prisma.document_types.count({ where }),
    ]);

    // Al cliente solo viaja la cantidad de condiciones efectivas (pill "N condiciones"), no el JSON.
    const data = rows.map(({ conditions, ...rest }) => ({
      ...rest,
      conditions_count: parseDocumentConditions(conditions).length,
    }));

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener tipos de documento paginados', {
      data: { error, applies },
    });
    throw new Error(`Error al obtener tipos de documento: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// PUBLIC WRAPPERS — one per tab
// ============================================================================

export async function getPersonasDocTypesPaginated(searchParams: DataTableSearchParams) {
  return getDocTypesPaginated(document_applies.Persona, searchParams);
}

export async function getEquiposDocTypesPaginated(searchParams: DataTableSearchParams) {
  return getDocTypesPaginated(document_applies.Equipos, searchParams);
}

export async function getEmpresaDocTypesPaginated(searchParams: DataTableSearchParams) {
  return getDocTypesPaginated(document_applies.Empresa, searchParams);
}

// ============================================================================
// EXPORT QUERIES (no skip/take)
// ============================================================================

async function getDocTypesForExport(
  applies: document_applies,
  searchParams: DataTableSearchParams
): Promise<ExportResult<DocumentTypeListItem[]>> {
  if (!(await hasDocTypePermission(applies, 'view'))) {
    return { ok: false, message: 'No tenés permiso para exportar estos tipos de documento.' };
  }
  const companyId = await getActiveCompanyId();
  try {
    const state = parseDocTypeTableState(searchParams);
    const where = await buildWhereClause(applies, companyId, state);

    const total = await prisma.document_types.count({ where });
    if (total > MAX_EXPORT_ROWS) {
      return {
        ok: false,
        message: `La exportación tiene ${total} filas y el máximo es ${MAX_EXPORT_ROWS}. Acote los resultados con filtros.`,
      };
    }

    const rows = await prisma.document_types.findMany({
      orderBy: [{ name: 'asc' }],
      where,
      take: MAX_EXPORT_ROWS,
      select: { ...DOC_TYPE_SELECT, conditions: true },
    });

    // Misma forma que la lista paginada (la tabla tipa sus filas y su export con un único TData).
    return {
      ok: true,
      data: rows.map(({ conditions, ...rest }) => ({
        ...rest,
        conditions_count: parseDocumentConditions(conditions).length,
      })),
    };
  } catch (error) {
    logger.error('Error al exportar tipos de documento', { data: { error, applies } });
    return { ok: false, message: 'Error al exportar tipos de documento' };
  }
}

export async function getPersonasDocTypesForExport(searchParams: DataTableSearchParams) {
  return getDocTypesForExport(document_applies.Persona, searchParams);
}

export async function getEquiposDocTypesForExport(searchParams: DataTableSearchParams) {
  return getDocTypesForExport(document_applies.Equipos, searchParams);
}

export async function getEmpresaDocTypesForExport(searchParams: DataTableSearchParams) {
  return getDocTypesForExport(document_applies.Empresa, searchParams);
}

// ============================================================================
// GET FOR EDIT (loads conditions JSON)
// ============================================================================

/**
 * Obtiene un tipo de documento completo (incluyendo conditions) para edición.
 */
export async function getDocumentTypeForEdit(id: string) {
  logger.debug('Obteniendo tipo de documento para editar', { data: { id } });

  try {
    const companyId = await getActiveCompanyId();
    await assertDocTypeIdPermission(id, companyId, 'view');
    return await findScopedDocumentType(prisma, id, companyId, DOC_TYPE_EDIT_SELECT);
  } catch (error) {
    logger.error('Error al obtener tipo de documento para editar', {
      data: { error, id },
    });
    throw error;
  }
}

// ============================================================================
// COUNT MATCHING RESOURCES — contador en tiempo real para condiciones
// ============================================================================

/**
 * Evalúa las condiciones del borrador del formulario contra los recursos de la empresa activa con el
 * motor de cumplimiento (la misma regla que usa el status). Devuelve cuántos recursos ACTIVOS las
 * cumplen y, si se pasa `documentTypeId` (edición), cuántos empiezan y cuántos dejan de exigirlo
 * respecto de lo guardado.
 */
export async function countMatchingResources(
  applies: string,
  conditionsJson: Prisma.JsonValue[],
  documentTypeId?: string
): Promise<MatchingResourcesResult> {
  const empty: MatchingResourcesResult = { matching: 0, startsRequiring: 0, stopsRequiring: 0 };
  const companyId = await getActiveCompanyId();

  logger.debug('Contando recursos para condiciones', { data: { applies } });

  try {
    if (applies !== 'Persona' && applies !== 'Equipos') return empty;
    await assertDocTypePermission(applies, 'view');
    if (documentTypeId) await assertDocTypeIdPermission(documentTypeId, companyId, 'view');

    const stored = documentTypeId
      ? await findScopedDocumentType(prisma, documentTypeId, companyId, { id: true })
      : null;

    // Sin documentos: sólo hace falta a quién aplica; los pivotes del borrador se cargan igual.
    const draftBase: ComplianceType = {
      id: 'draft',
      companyId,
      applies,
      mandatory: true,
      isActive: true,
      monthly: false,
      hasExpiry: false,
      downDocument: false,
      isPrivate: false,
      multiresource: false,
      scope: { special: true, conditions: conditionsJson },
    };
    const dataset = await loadComplianceDataset(prisma, {
      companyId,
      kind: applies,
      includeDocs: false,
      extraTypes: [draftBase],
    });
    const current = stored ? dataset.types.find((t) => t.id === stored.id) ?? null : null;
    // El borrador hereda del tipo guardado todo menos las condiciones, para que el delta mida sólo ese cambio.
    const draft: ComplianceType = current
      ? { ...current, scope: { special: true, conditions: conditionsJson } }
      : draftBase;

    return computeApplicabilityDelta(draft, current, dataset.resources);
  } catch (error) {
    logger.error('Error al contar recursos para condiciones', { data: { error, applies } });
    return empty;
  }
}

export interface MatchingResourcesResult {
  /** Recursos a los que el borrador les aplica. */
  matching: number;
  /** Recursos a los que el tipo guardado no les aplica y el borrador sí (0 en un alta). */
  startsRequiring: number;
  /** Recursos a los que el tipo guardado les aplica y el borrador no (0 en un alta). */
  stopsRequiring: number;
}

// ============================================================================
// SINGLE FACET (lazy-load con cross-filtering)
// ============================================================================

// ============================================================================
// SINGLE FACET (lazy-load con cross-filtering)
// ============================================================================

/**
 * Obtiene opciones y counts para UN SOLO filtro facetado, con cross-filtering.
 * Diseñado para lazy-load: cada filtro llama a esta función al abrirse.
 */
export async function getDocTypeSingleFacet(
  columnId: string,
  applies: document_applies,
  searchParams?: DataTableSearchParams
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
} | null> {
  if (!(await hasDocTypePermission(applies, 'view'))) return { counts: new Map() };
  const companyId = await getActiveCompanyId();
  const parsedState = parseDocTypeTableState(searchParams);

  // Cross-filter: se quita el filtro de la propia columna. Siempre pasa por `buildWhereClause`, así los
  // counts respetan el perímetro de empresa y ocultan los tipos privados a quien no tiene `view_private`.
  async function crossWhere(excludeColumn: string) {
    const modified = { ...parsedState, filters: { ...parsedState.filters } };
    delete modified.filters[excludeColumn];
    delete modified.filters[`${excludeColumn}_from`];
    delete modified.filters[`${excludeColumn}_to`];
    return await buildWhereClause(applies, companyId, modified);
  }

  function toFacetMap(rows: { key: string | boolean | null | undefined; count: number }[]): Map<string, number> {
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

    // ── Boolean columns ──
    if (BOOLEAN_FILTER_COLUMNS.includes(columnId as BooleanFilterColumn)) {
      const field = columnId as BooleanFilterColumn;
      const rows = await prisma.document_types.groupBy({
        by: [field],
        where,
        _count: true,
      });
      return {
        counts: toFacetMap(
          rows.map((r) => ({
            key: String((r as Record<string, unknown>)[field]),
            count: r._count,
          }))
        ),
      };
    }

    // ── is_active (boolean facet) ──
    if (columnId === 'is_active') {
      const rows = await prisma.document_types.groupBy({
        by: ['is_active'],
        where,
        _count: true,
      });
      return {
        counts: toFacetMap(
          rows.map((r) => ({
            key: String(r.is_active),
            count: r._count,
          }))
        ),
      };
    }

    // ── equipment_type (text facet — treated as enum-like) ──
    if (columnId === 'equipment_type') {
      const rows = await prisma.document_types.groupBy({
        by: ['equipment_type'],
        where,
        _count: true,
      });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.equipment_type, count: r._count }))),
      };
    }

    logger.warn('Facet column not recognized for document_types', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet individual de tipos de documento', {
      data: { error, columnId, applies },
    });
    return null;
  }
}

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type DocumentTypeListItem = Awaited<ReturnType<typeof getDocTypesPaginated>>['data'][number];
export type DocumentTypeExportItem = DocumentTypeListItem;
export type DocumentTypeForEdit = Awaited<ReturnType<typeof getDocumentTypeForEdit>>;
