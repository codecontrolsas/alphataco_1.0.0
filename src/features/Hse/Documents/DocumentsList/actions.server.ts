'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import {
  buildTreasuryDateRangeWhere,
  facetWhere,
  ownEntry,
  parseBoundedInt,
  safePaging,
  textValue,
} from '@/features/Treasury/lib/filter-values';
import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { NULL_FILTER_VALUE, parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { exportFailure, fetchExportRowsInBatches, tooManyRowsMessage } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import type { SingleFacetResult } from '@/shared/lib/table-list-query';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { HSE_DOCUMENT_STATUS_LABELS } from '../../lib/constants';
import { isHseEnabled } from '../../lib/feature-gate';

const logger = new Logger('features/Hse/Documents/DocumentsList');

type DocumentWhere = Prisma.hse_documentsWhereInput;
type DocumentOrderBy = Prisma.hse_documentsOrderByWithRelationInput;
type FilterState = ReturnType<typeof parseSearchParams>;

const STATUS_VALUES = Object.keys(HSE_DOCUMENT_STATUS_LABELS);
/** Cumplimiento (derivado de las aceptaciones vigentes). */
export type ComplianceFacet = 'with_pending' | 'complete' | 'none';
const COMPLIANCE_VALUES: ComplianceFacet[] = ['with_pending', 'complete', 'none'];

const VALID_SORT_FIELDS = new Set(['title', 'status', 'updated_at', 'created_at']);
const SORT_MAP: Record<string, (dir: 'asc' | 'desc') => DocumentOrderBy[]> = {
  type: (dir) => [{ type: { name: dir } }],
  version: (dir) => [{ current_version: { version: dir } }],
  expires_at: (dir) => [{ current_version: { expires_at: { sort: dir, nulls: 'last' } } }],
};
const EXPORT_LIMIT = 5_000;

const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

/** Empresa si el usuario puede ver la tabla; `null` = sin acceso → lista vacía. */
async function resolveCompanyId(): Promise<string | null> {
  if (!isHseEnabled()) return null;
  if (!(await checkPermissionServer('hse', 'documentos-hse', 'view'))) return null;
  return getActiveCompanyId();
}

const pendingAck = { archived_at: null, status: 'pending' as const };

/** WHERE compartido entre la página, el export y los facets. */
function buildWhereClause(companyId: string, state: FilterState): DocumentWhere {
  const f = state.filters;
  const and: DocumentWhere[] = [{ company_id: companyId }];

  const search = textValue(state.search);
  if (search) {
    and.push({
      OR: [{ title: contains(search) }, { description: contains(search) }, { type: { name: contains(search) } }],
    });
  }

  const status = facetWhere('status', f.status, { kind: 'enum', allowed: STATUS_VALUES });
  if (status) and.push(status as DocumentWhere);
  const type = facetWhere('type_id', f.type, { kind: 'uuid', nullable: true });
  if (type) and.push(type as DocumentWhere);

  const title = textValue(f.title?.[0]);
  if (title) and.push({ title: contains(title) });

  const versionText = textValue(f.version?.[0]);
  if (versionText) {
    const version = parseBoundedInt(versionText);
    and.push(version !== null ? { current_version: { version } } : { id: { in: [] } });
  }

  // Vencimiento: es de la versión vigente (columna @db.Date).
  const expires = buildTreasuryDateRangeWhere(f, { dateColumns: ['expires_at'] }).expires_at;
  if (expires) and.push({ current_version: { expires_at: expires } });
  and.push(buildTreasuryDateRangeWhere(f, { timestampColumns: ['updated_at'] }) as DocumentWhere);

  const compliance = (f.compliance ?? []).filter((v): v is ComplianceFacet =>
    (COMPLIANCE_VALUES as string[]).includes(v)
  );
  if (compliance.length > 0 && compliance.length < COMPLIANCE_VALUES.length) {
    and.push({ OR: compliance.map(complianceWhere) });
  }

  return { AND: and };
}

function complianceWhere(value: ComplianceFacet): DocumentWhere {
  if (value === 'with_pending') return { status: 'published', acknowledgements: { some: pendingAck } };
  if (value === 'complete') {
    return { status: 'published', acknowledgements: { some: { archived_at: null }, none: pendingAck } };
  }
  return { acknowledgements: { none: { archived_at: null } } };
}

const DOCUMENT_SELECT = {
  id: true,
  title: true,
  status: true,
  created_at: true,
  updated_at: true,
  type: { select: { id: true, name: true } },
  current_version: { select: { version: true, expires_at: true, published_at: true } },
  _count: { select: { targets: true } },
} as const;

type DocumentRow = Prisma.hse_documentsGetPayload<{ select: typeof DOCUMENT_SELECT }>;

/**
 * Cumplimiento de cada documento: aceptaciones VIGENTES (sin archivar) por estado. Una sola consulta agrupada para la
 * página. Bajo RLS exige `hse:cumplimiento:view`: sin ese permiso no hay conteos y la tabla muestra "—".
 */
async function complianceByDocument(ids: string[], canSeeCompliance: boolean) {
  const byDoc = new Map<string, { pending: number; accepted: number; rejected: number }>();
  if (!canSeeCompliance || ids.length === 0) return byDoc;
  const groups = await prisma.hse_document_acknowledgements.groupBy({
    by: ['document_id', 'status'],
    where: { document_id: { in: ids }, archived_at: null },
    _count: true,
  });
  for (const g of groups) {
    const current = byDoc.get(g.document_id) ?? { pending: 0, accepted: 0, rejected: 0 };
    current[g.status] = g._count;
    byDoc.set(g.document_id, current);
  }
  return byDoc;
}

function shape(
  rows: DocumentRow[],
  compliance: Map<string, { pending: number; accepted: number; rejected: number }> | null
) {
  const today = argentinaDate();
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    type: r.type ? { id: r.type.id, name: r.type.name } : null,
    version: r.current_version?.version ?? null,
    // @db.Date: el día tal cual, sin correr zona horaria.
    expires_at: r.current_version?.expires_at ? r.current_version.expires_at.toISOString().slice(0, 10) : null,
    /** Vencido: la fecha de vencimiento de la versión vigente ya pasó (hoy en hora argentina). */
    expired:
      r.status === 'published' &&
      !!r.current_version?.expires_at &&
      r.current_version.expires_at.toISOString().slice(0, 10) < today,
    published_at: r.current_version?.published_at ?? null,
    targets: r._count.targets,
    updated_at: r.updated_at,
    compliance: compliance ? compliance.get(r.id) ?? { pending: 0, accepted: 0, rejected: 0 } : null,
  }));
}

function orderByFor(state: FilterState): DocumentOrderBy[] {
  const resolved: DocumentOrderBy[] = [];
  for (const s of state.sorting) {
    const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
    const mapper = ownEntry(SORT_MAP, s.id);
    if (mapper) resolved.push(...mapper(dir));
    else if (VALID_SORT_FIELDS.has(s.id)) resolved.push({ [s.id]: dir });
  }
  return [...resolved, { updated_at: 'desc' }, { id: 'asc' }];
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getHseDocumentsPaginated(searchParams: DataTableSearchParams) {
  const companyId = await resolveCompanyId();
  if (!companyId) return { data: [], total: 0 };

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = safePaging(state);
    const where = buildWhereClause(companyId, state);
    const [rows, total, canSeeCompliance] = await Promise.all([
      prisma.hse_documents.findMany({ where, orderBy: orderByFor(state), skip, take, select: DOCUMENT_SELECT }),
      prisma.hse_documents.count({ where }),
      checkPermissionServer('hse', 'cumplimiento', 'view'),
    ]);
    const compliance = await complianceByDocument(
      rows.map((r) => r.id),
      canSeeCompliance
    );
    return { data: shape(rows, canSeeCompliance ? compliance : null), total };
  } catch (error) {
    logger.error('Error al obtener documentos HSE', { data: { error } });
    throw new Error('No se pudo obtener la lista de documentos');
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export async function getAllHseDocumentsForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<HseDocumentListItem[]>> {
  const companyId = await resolveCompanyId();
  if (!companyId) return { ok: false, message: 'No tiene permiso para exportar los documentos.' };

  try {
    const state = parseSearchParams(searchParams);
    const where = buildWhereClause(companyId, state);
    const canSeeCompliance = await checkPermissionServer('hse', 'cumplimiento', 'view');
    const rows = await fetchExportRowsInBatches({
      maxRows: EXPORT_LIMIT,
      listIds: (take) =>
        prisma.hse_documents.findMany({ where, orderBy: orderByFor(state), select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.hse_documents.findMany({ where: { id: { in: ids }, company_id: companyId }, select: DOCUMENT_SELECT }),
      tooLargeMessage: tooManyRowsMessage('documentos'),
    });
    const compliance = await complianceByDocument(
      rows.map((r) => r.id),
      canSeeCompliance
    );
    return { ok: true, data: shape(rows, canSeeCompliance ? compliance : null) };
  } catch (error) {
    logger.error('Error al exportar documentos HSE', { data: { error } });
    return exportFailure(error, 'No se pudo exportar la lista de documentos. Intente nuevamente.');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filter)
// ============================================================================

export async function getHseDocumentSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<SingleFacetResult> {
  const companyId = await resolveCompanyId();
  if (!companyId) return null;
  const parsed = searchParams && Object.keys(searchParams).length > 0 ? parseSearchParams(searchParams) : null;

  function crossWhere(excludeColumn: string): DocumentWhere {
    const base: FilterState = parsed ?? parseSearchParams({});
    const filters = { ...base.filters };
    delete filters[excludeColumn];
    return buildWhereClause(companyId as string, { ...base, filters });
  }

  try {
    if (columnId === 'status') {
      const rows = await prisma.hse_documents.groupBy({ by: ['status'], where: crossWhere('status'), _count: true });
      return { counts: new Map(rows.map((r) => [r.status, r._count] as [string, number])) };
    }
    if (columnId === 'type') {
      const rows = await prisma.hse_documents.groupBy({ by: ['type_id'], where: crossWhere('type'), _count: true });
      const ids = rows.flatMap((r) => (r.type_id ? [r.type_id] : []));
      const types = ids.length
        ? await prisma.hse_document_types.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : [];
      return {
        counts: new Map(rows.map((r) => [r.type_id ?? NULL_FILTER_VALUE, r._count] as [string, number])),
        resolvedOptions: types,
      };
    }
    if (columnId === 'compliance') {
      const where = crossWhere('compliance');
      const counts = await Promise.all(
        COMPLIANCE_VALUES.map((value) =>
          prisma.hse_documents.count({ where: { AND: [where, complianceWhere(value)] } })
        )
      );
      return { counts: new Map(COMPLIANCE_VALUES.map((value, i) => [value, counts[i] ?? 0] as [string, number])) };
    }
    logger.warn('Facet no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet de documentos HSE', { data: { error, columnId } });
    return null;
  }
}

export type HseDocumentListItem = Awaited<ReturnType<typeof getHseDocumentsPaginated>>['data'][number];
