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
import { parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { exportFailure, fetchExportRowsInBatches, tooManyRowsMessage } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import type { SingleFacetResult } from '@/shared/lib/table-list-query';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { isHseEnabled } from '../../lib/feature-gate';
import { HSE_RECORD_MODALITY_LABELS, HSE_RECORD_STATUS_LABELS } from '../../lib/pdf-content';

const logger = new Logger('features/Hse/Records/RecordsList');

type RecordWhere = Prisma.hse_training_recordsWhereInput;
type RecordOrderBy = Prisma.hse_training_recordsOrderByWithRelationInput;
type FilterState = ReturnType<typeof parseSearchParams>;

const STATUS_VALUES = Object.keys(HSE_RECORD_STATUS_LABELS);
const MODALITY_VALUES = Object.keys(HSE_RECORD_MODALITY_LABELS);

const VALID_SORT_FIELDS = new Set(['number', 'held_on', 'modality', 'status', 'closed_at']);
const SORT_MAP: Record<string, (dir: 'asc' | 'desc') => RecordOrderBy[]> = {
  training: (dir) => [{ training: { title: dir } }],
  attendees: (dir) => [{ attendees: { _count: dir } }],
};
const EXPORT_LIMIT = 5_000;

const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

async function resolveCompanyId(): Promise<string | null> {
  if (!isHseEnabled()) return null;
  if (!(await checkPermissionServer('hse', 'actas', 'view'))) return null;
  return getActiveCompanyId();
}

/** WHERE compartido entre la página, el export y los facets. */
function buildWhereClause(companyId: string, state: FilterState): RecordWhere {
  const f = state.filters;
  const and: RecordWhere[] = [{ company_id: companyId }];

  const search = textValue(state.search);
  if (search) {
    const number = parseBoundedInt(search);
    and.push({
      OR: [
        { training: { title: contains(search) } },
        { topics: contains(search) },
        { location: contains(search) },
        ...(number !== null ? [{ number }] : []),
      ],
    });
  }

  const status = facetWhere('status', f.status, { kind: 'enum', allowed: STATUS_VALUES });
  if (status) and.push(status as RecordWhere);
  const modality = facetWhere('modality', f.modality, { kind: 'enum', allowed: MODALITY_VALUES });
  if (modality) and.push(modality as RecordWhere);

  const numberText = textValue(f.number?.[0]);
  if (numberText) {
    const value = parseBoundedInt(numberText);
    and.push(value !== null ? { number: value } : { id: { in: [] } });
  }
  const training = textValue(f.training?.[0]);
  if (training) and.push({ training: { title: contains(training) } });
  const location = textValue(f.location?.[0]);
  if (location) and.push({ location: contains(location) });
  // "Asistentes" (cantidad exacta de presentes) se aplica en `whereFor`: necesita contar.
  if (textValue(f.attendees?.[0]) && parseBoundedInt(textValue(f.attendees?.[0]) ?? '') === null) {
    and.push({ id: { in: [] } });
  }
  and.push(
    buildTreasuryDateRangeWhere(f, { dateColumns: ['held_on'], timestampColumns: ['closed_at'] }) as RecordWhere
  );
  return { AND: and };
}

const RECORD_SELECT = {
  id: true,
  number: true,
  held_on: true,
  modality: true,
  location: true,
  status: true,
  closed_at: true,
  training: { select: { id: true, title: true } },
  _count: { select: { attendees: { where: { attended: true } }, instructors: true } },
} as const;
type RecordRow = Prisma.hse_training_recordsGetPayload<{ select: typeof RECORD_SELECT }>;

function shape(rows: RecordRow[]) {
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    held_on: r.held_on.toISOString().slice(0, 10),
    modality: r.modality,
    location: r.location,
    status: r.status,
    closed_at: r.closed_at,
    training: r.training,
    attendees: r._count.attendees,
    instructors: r._count.instructors,
  }));
}

/** Filtro por cantidad de presentes: se aplica después de contar (Prisma no filtra por `_count` con condición). */
function attendeesFilter(state: FilterState) {
  const value = parseBoundedInt(textValue(state.filters.attendees?.[0]) ?? '');
  return value;
}

function orderByFor(state: FilterState): RecordOrderBy[] {
  const resolved: RecordOrderBy[] = [];
  for (const s of state.sorting) {
    const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
    const mapper = ownEntry(SORT_MAP, s.id);
    if (mapper) resolved.push(...mapper(dir));
    else if (VALID_SORT_FIELDS.has(s.id)) resolved.push({ [s.id]: dir });
  }
  return [...resolved, { number: 'desc' }, { id: 'asc' }];
}

/** Ids del filtro por cantidad de presentes (una consulta agrupada acotada a la empresa). */
async function idsWithAttendees(companyId: string, count: number): Promise<string[]> {
  const groups = await prisma.hse_training_record_attendees.groupBy({
    by: ['record_id'],
    where: { company_id: companyId, attended: true },
    _count: true,
  });
  const ids = groups.filter((g) => g._count === count).map((g) => g.record_id);
  if (count !== 0) return ids;
  const withAny = new Set(groups.map((g) => g.record_id));
  const all = await prisma.hse_training_records.findMany({ where: { company_id: companyId }, select: { id: true } });
  return all.filter((r) => !withAny.has(r.id)).map((r) => r.id);
}

async function whereFor(companyId: string, state: FilterState): Promise<RecordWhere> {
  const base = buildWhereClause(companyId, state);
  const attendees = attendeesFilter(state);
  if (attendees === null) return base;
  return { AND: [base, { id: { in: await idsWithAttendees(companyId, attendees) } }] };
}

export async function getHseRecordsPaginated(searchParams: DataTableSearchParams) {
  const companyId = await resolveCompanyId();
  if (!companyId) return { data: [], total: 0 };
  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = safePaging(state);
    const where = await whereFor(companyId, state);
    const [rows, total] = await Promise.all([
      prisma.hse_training_records.findMany({ where, orderBy: orderByFor(state), skip, take, select: RECORD_SELECT }),
      prisma.hse_training_records.count({ where }),
    ]);
    return { data: shape(rows), total };
  } catch (error) {
    logger.error('Error al obtener actas HSE', { data: { error } });
    throw new Error('No se pudo obtener la lista de actas');
  }
}

export async function getAllHseRecordsForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<HseRecordListItem[]>> {
  const companyId = await resolveCompanyId();
  if (!companyId) return { ok: false, message: 'No tiene permiso para exportar las actas.' };
  try {
    const state = parseSearchParams(searchParams);
    const where = await whereFor(companyId, state);
    const rows = await fetchExportRowsInBatches({
      maxRows: EXPORT_LIMIT,
      listIds: (take) =>
        prisma.hse_training_records.findMany({ where, orderBy: orderByFor(state), select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.hse_training_records.findMany({
          where: { id: { in: ids }, company_id: companyId },
          select: RECORD_SELECT,
        }),
      tooLargeMessage: tooManyRowsMessage('actas'),
    });
    return { ok: true, data: shape(rows) };
  } catch (error) {
    logger.error('Error al exportar actas HSE', { data: { error } });
    return exportFailure(error, 'No se pudo exportar la lista de actas. Intente nuevamente.');
  }
}

export async function getHseRecordSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<SingleFacetResult> {
  const companyId = await resolveCompanyId();
  if (!companyId) return null;
  const parsed = searchParams && Object.keys(searchParams).length > 0 ? parseSearchParams(searchParams) : null;

  async function crossWhere(excludeColumn: string): Promise<RecordWhere> {
    const base: FilterState = parsed ?? parseSearchParams({});
    const filters = { ...base.filters };
    delete filters[excludeColumn];
    return whereFor(companyId as string, { ...base, filters });
  }

  try {
    if (columnId === 'status') {
      const rows = await prisma.hse_training_records.groupBy({
        by: ['status'],
        where: await crossWhere('status'),
        _count: true,
      });
      return { counts: new Map(rows.map((r) => [r.status, r._count] as [string, number])) };
    }
    if (columnId === 'modality') {
      const rows = await prisma.hse_training_records.groupBy({
        by: ['modality'],
        where: await crossWhere('modality'),
        _count: true,
      });
      return { counts: new Map(rows.map((r) => [r.modality, r._count] as [string, number])) };
    }
    logger.warn('Facet no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet de actas', { data: { error, columnId } });
    return null;
  }
}

export type HseRecordListItem = Awaited<ReturnType<typeof getHseRecordsPaginated>>['data'][number];
