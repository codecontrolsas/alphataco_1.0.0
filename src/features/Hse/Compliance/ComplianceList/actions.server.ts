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
import { exportFailure, fetchExportRowsInBatches, tooManyRowsMessage } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { UUID_RE } from '@/shared/lib/storage-buckets';
import type { SingleFacetResult } from '@/shared/lib/table-list-query';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { HSE_ACK_STATUS_LABELS } from '../../lib/constants';
import { isHseEnabled } from '../../lib/feature-gate';

/**
 * Cumplimiento: una fila por empleado y documento con la aceptación VIGENTE (versión actual de un documento publicado,
 * sin archivar). `documentId` acota la tabla a un documento (vista del detalle); viene del servidor que arma la página
 * y se valida igual. Bajo RLS exige `hse:cumplimiento:view`.
 */

const logger = new Logger('features/Hse/Compliance');

type AckWhere = Prisma.hse_document_acknowledgementsWhereInput;
type AckOrderBy = Prisma.hse_document_acknowledgementsOrderByWithRelationInput;
type FilterState = ReturnType<typeof parseSearchParams>;

const STATUS_VALUES = Object.keys(HSE_ACK_STATUS_LABELS);
const VALID_SORT_FIELDS = new Set(['status', 'responded_at', 'created_at']);
const SORT_MAP: Record<string, (dir: 'asc' | 'desc') => AckOrderBy[]> = {
  file: (dir) => [{ employee: { file: dir } }],
  employee: (dir) => [{ employee: { lastname: dir } }, { employee: { firstname: dir } }],
  position: (dir) => [{ employee: { company_positions: { name: dir } } }],
  document: (dir) => [{ document: { title: dir } }],
  version: (dir) => [{ version: { version: dir } }],
};
const EXPORT_LIMIT = 20_000;
const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

async function resolveCompanyId(): Promise<string | null> {
  if (!(await isHseEnabled())) return null;
  if (!(await checkPermissionServer('hse', 'cumplimiento', 'view'))) return null;
  return getActiveCompanyId();
}

function buildWhereClause(companyId: string, state: FilterState, documentId: string | null): AckWhere {
  const f = state.filters;
  const and: AckWhere[] = [
    { company_id: companyId, archived_at: null, document: { status: 'published' } },
    ...(documentId ? [{ document_id: documentId }] : []),
  ];

  const search = textValue(state.search);
  if (search) {
    and.push({
      OR: [
        { employee: { file: contains(search) } },
        { employee: { lastname: contains(search) } },
        { employee: { firstname: contains(search) } },
        { document: { title: contains(search) } },
      ],
    });
  }

  const status = facetWhere('status', f.status, { kind: 'enum', allowed: STATUS_VALUES });
  if (status) and.push(status as AckWhere);
  const document = facetWhere('document_id', f.document, { kind: 'uuid' });
  if (document) and.push(document as AckWhere);
  const position = facetWhere('company_position', f.position, { kind: 'uuid', nullable: true });
  if (position) and.push({ employee: position as Prisma.employeesWhereInput });

  const file = textValue(f.file?.[0]);
  if (file) and.push({ employee: { file: contains(file) } });
  const employee = textValue(f.employee?.[0]);
  if (employee) {
    and.push({ OR: [{ employee: { lastname: contains(employee) } }, { employee: { firstname: contains(employee) } }] });
  }
  const reason = textValue(f.reject_reason?.[0]);
  if (reason) and.push({ reject_reason: contains(reason) });
  const versionText = textValue(f.version?.[0]);
  if (versionText) {
    const version = parseBoundedInt(versionText);
    and.push(version !== null ? { version: { version } } : { id: { in: [] } });
  }
  and.push(buildTreasuryDateRangeWhere(f, { timestampColumns: ['responded_at', 'created_at'] }) as AckWhere);
  return { AND: and };
}

const ACK_SELECT = {
  id: true,
  status: true,
  responded_at: true,
  reject_reason: true,
  signer_name: true,
  signer_position: true,
  created_at: true,
  document: { select: { id: true, title: true } },
  version: { select: { version: true } },
  employee: {
    select: {
      id: true,
      file: true,
      lastname: true,
      firstname: true,
      is_active: true,
      company_positions: { select: { id: true, name: true } },
    },
  },
} as const;
type AckRow = Prisma.hse_document_acknowledgementsGetPayload<{ select: typeof ACK_SELECT }>;

function shape(rows: AckRow[]) {
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    responded_at: r.responded_at,
    reject_reason: r.reject_reason,
    created_at: r.created_at,
    /** Puesto con el que respondió (constancia), si respondió. */
    signer_position: r.signer_position,
    document: { id: r.document.id, title: r.document.title },
    version: r.version.version,
    employee: {
      id: r.employee.id,
      file: r.employee.file,
      name: `${r.employee.lastname} ${r.employee.firstname}`.trim(),
      isActive: r.employee.is_active !== false,
    },
    position: r.employee.company_positions
      ? { id: r.employee.company_positions.id, name: r.employee.company_positions.name }
      : null,
  }));
}

function orderByFor(state: FilterState): AckOrderBy[] {
  const resolved: AckOrderBy[] = [];
  for (const s of state.sorting) {
    const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
    const mapper = ownEntry(SORT_MAP, s.id);
    if (mapper) resolved.push(...mapper(dir));
    else if (VALID_SORT_FIELDS.has(s.id)) resolved.push({ [s.id]: dir });
  }
  // Pendientes primero: es lo que hay que perseguir.
  return [...resolved, { status: 'asc' }, { employee: { lastname: 'asc' } }, { id: 'asc' }];
}

const validDocumentId = (documentId: string | null | undefined) =>
  documentId && UUID_RE.test(documentId) ? documentId : null;

export async function getHseCompliancePaginated(searchParams: DataTableSearchParams, documentId?: string | null) {
  const companyId = await resolveCompanyId();
  if (!companyId) return { data: [], total: 0 };
  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = safePaging(state);
    const where = buildWhereClause(companyId, state, validDocumentId(documentId));
    const [rows, total] = await Promise.all([
      prisma.hse_document_acknowledgements.findMany({
        where,
        orderBy: orderByFor(state),
        skip,
        take,
        select: ACK_SELECT,
      }),
      prisma.hse_document_acknowledgements.count({ where }),
    ]);
    return { data: shape(rows), total };
  } catch (error) {
    logger.error('Error al obtener el cumplimiento HSE', { data: { error } });
    throw new Error('No se pudo obtener el cumplimiento');
  }
}

export async function getAllHseComplianceForExport(
  searchParams: DataTableSearchParams,
  documentId?: string | null
): Promise<ExportResult<HseComplianceListItem[]>> {
  const companyId = await resolveCompanyId();
  if (!companyId) return { ok: false, message: 'No tiene permiso para exportar el cumplimiento.' };
  try {
    const state = parseSearchParams(searchParams);
    const where = buildWhereClause(companyId, state, validDocumentId(documentId));
    const rows = await fetchExportRowsInBatches({
      maxRows: EXPORT_LIMIT,
      listIds: (take) =>
        prisma.hse_document_acknowledgements.findMany({
          where,
          orderBy: orderByFor(state),
          select: { id: true },
          take,
        }),
      fetchByIds: (ids) =>
        prisma.hse_document_acknowledgements.findMany({
          where: { id: { in: ids }, company_id: companyId },
          select: ACK_SELECT,
        }),
      tooLargeMessage: tooManyRowsMessage('filas'),
    });
    return { ok: true, data: shape(rows) };
  } catch (error) {
    logger.error('Error al exportar el cumplimiento HSE', { data: { error } });
    return exportFailure(error, 'No se pudo exportar el cumplimiento. Intente nuevamente.');
  }
}

export async function getHseComplianceSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams,
  documentId?: string | null
): Promise<SingleFacetResult> {
  const companyId = await resolveCompanyId();
  if (!companyId) return null;
  const parsed = searchParams && Object.keys(searchParams).length > 0 ? parseSearchParams(searchParams) : null;
  const scopeId = validDocumentId(documentId);

  function crossWhere(excludeColumn: string): AckWhere {
    const base: FilterState = parsed ?? parseSearchParams({});
    const filters = { ...base.filters };
    delete filters[excludeColumn];
    return buildWhereClause(companyId as string, { ...base, filters }, scopeId);
  }

  try {
    if (columnId === 'status') {
      const rows = await prisma.hse_document_acknowledgements.groupBy({
        by: ['status'],
        where: crossWhere('status'),
        _count: true,
      });
      return { counts: new Map(rows.map((r) => [r.status, r._count] as [string, number])) };
    }
    if (columnId === 'document') {
      const rows = await prisma.hse_document_acknowledgements.groupBy({
        by: ['document_id'],
        where: crossWhere('document'),
        _count: true,
      });
      const ids = rows.map((r) => r.document_id);
      const documents = ids.length
        ? await prisma.hse_documents.findMany({
            where: { id: { in: ids } },
            select: { id: true, title: true },
            orderBy: { title: 'asc' },
          })
        : [];
      return {
        counts: new Map(rows.map((r) => [r.document_id, r._count] as [string, number])),
        resolvedOptions: documents.map((d) => ({ id: d.id, name: d.title })),
      };
    }
    if (columnId === 'position') {
      // El puesto es del empleado: se cuenta agrupando los empleados de las filas filtradas.
      const rows = await prisma.hse_document_acknowledgements.findMany({
        where: crossWhere('position'),
        select: { employee: { select: { company_position: true } } },
      });
      const counts = new Map<string, number>();
      for (const r of rows) {
        const key = r.employee.company_position ?? NULL_FILTER_VALUE;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const ids = [...counts.keys()].filter((k) => k !== NULL_FILTER_VALUE);
      const positions = ids.length
        ? await prisma.company_positions.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : [];
      return { counts, resolvedOptions: positions };
    }
    logger.warn('Facet no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet de cumplimiento HSE', { data: { error, columnId } });
    return null;
  }
}

export type HseComplianceListItem = Awaited<ReturnType<typeof getHseCompliancePaginated>>['data'][number];
