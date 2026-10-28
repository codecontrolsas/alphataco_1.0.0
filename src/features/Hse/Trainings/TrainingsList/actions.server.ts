'use server';

import { isModuleEnabled } from '@/features/Modules/server/modules.server';
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
import { HSE_TRAINING_KIND_LABELS, HSE_TRAINING_STATUS_LABELS } from '../../lib/constants';

const logger = new Logger('features/Hse/Trainings/TrainingsList');

type TrainingWhere = Prisma.hse_trainingsWhereInput;
type TrainingOrderBy = Prisma.hse_trainingsOrderByWithRelationInput;
type FilterState = ReturnType<typeof parseSearchParams>;

const STATUS_VALUES = Object.keys(HSE_TRAINING_STATUS_LABELS);
const KIND_VALUES = Object.keys(HSE_TRAINING_KIND_LABELS);
/** Avance (derivado de las asignaciones vigentes). */
export type TrainingProgressFacet = 'with_pending' | 'complete' | 'none';
const PROGRESS_VALUES: TrainingProgressFacet[] = ['with_pending', 'complete', 'none'];

const VALID_SORT_FIELDS = new Set(['title', 'status', 'kind', 'passing_score', 'updated_at', 'published_at']);
const SORT_MAP: Record<string, (dir: 'asc' | 'desc') => TrainingOrderBy[]> = {};
const EXPORT_LIMIT = 5_000;

const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });
const activeAssignment = { archived_at: null };
const notPassed = { archived_at: null, status: { not: 'passed' as const } };

async function resolveCompanyId(): Promise<string | null> {
  if (!(await isModuleEnabled('hse'))) return null;
  if (!(await checkPermissionServer('hse', 'capacitaciones', 'view'))) return null;
  return getActiveCompanyId();
}

function progressWhere(value: TrainingProgressFacet): TrainingWhere {
  if (value === 'with_pending') return { status: 'published', assignments: { some: notPassed } };
  if (value === 'complete') return { status: 'published', assignments: { some: activeAssignment, none: notPassed } };
  return { assignments: { none: activeAssignment } };
}

/** WHERE compartido entre la página, el export y los facets. */
function buildWhereClause(companyId: string, state: FilterState): TrainingWhere {
  const f = state.filters;
  const and: TrainingWhere[] = [{ company_id: companyId }];

  const search = textValue(state.search);
  if (search) and.push({ OR: [{ title: contains(search) }, { description: contains(search) }] });

  const status = facetWhere('status', f.status, { kind: 'enum', allowed: STATUS_VALUES });
  if (status) and.push(status as TrainingWhere);
  const kind = facetWhere('kind', f.kind, { kind: 'enum', allowed: KIND_VALUES });
  if (kind) and.push(kind as TrainingWhere);

  const title = textValue(f.title?.[0]);
  if (title) and.push({ title: contains(title) });
  const passingText = textValue(f.passing_score?.[0]);
  if (passingText) {
    const value = parseBoundedInt(passingText);
    and.push(value !== null ? { passing_score: value } : { id: { in: [] } });
  }
  and.push(buildTreasuryDateRangeWhere(f, { timestampColumns: ['updated_at', 'published_at'] }) as TrainingWhere);

  const progress = (f.progress ?? []).filter((v): v is TrainingProgressFacet =>
    (PROGRESS_VALUES as string[]).includes(v)
  );
  if (progress.length > 0 && progress.length < PROGRESS_VALUES.length) {
    and.push({ OR: progress.map(progressWhere) });
  }
  return { AND: and };
}

const TRAINING_SELECT = {
  id: true,
  title: true,
  kind: true,
  status: true,
  passing_score: true,
  max_attempts: true,
  time_limit_minutes: true,
  validity_months: true,
  published_at: true,
  updated_at: true,
  _count: { select: { questions: true, materials: true } },
} as const;
type TrainingRow = Prisma.hse_trainingsGetPayload<{ select: typeof TRAINING_SELECT }>;

/** Avance por capacitación: asignaciones vigentes por estado (una consulta agrupada para la página). */
async function progressByTraining(ids: string[]) {
  const byTraining = new Map<string, { passed: number; total: number }>();
  if (ids.length === 0) return byTraining;
  const groups = await prisma.hse_training_assignments.groupBy({
    by: ['training_id', 'status'],
    where: { training_id: { in: ids }, archived_at: null },
    _count: true,
  });
  for (const g of groups) {
    const current = byTraining.get(g.training_id) ?? { passed: 0, total: 0 };
    current.total += g._count;
    if (g.status === 'passed') current.passed += g._count;
    byTraining.set(g.training_id, current);
  }
  return byTraining;
}

function shape(rows: TrainingRow[], progress: Map<string, { passed: number; total: number }>) {
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
    status: r.status,
    passing_score: r.passing_score,
    max_attempts: r.max_attempts,
    time_limit_minutes: r.time_limit_minutes,
    validity_months: r.validity_months,
    questions: r._count.questions,
    materials: r._count.materials,
    published_at: r.published_at,
    updated_at: r.updated_at,
    progress: progress.get(r.id) ?? { passed: 0, total: 0 },
  }));
}

function orderByFor(state: FilterState): TrainingOrderBy[] {
  const resolved: TrainingOrderBy[] = [];
  for (const s of state.sorting) {
    const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
    const mapper = ownEntry(SORT_MAP, s.id);
    if (mapper) resolved.push(...mapper(dir));
    else if (VALID_SORT_FIELDS.has(s.id)) resolved.push({ [s.id]: dir });
  }
  return [...resolved, { updated_at: 'desc' }, { id: 'asc' }];
}

export async function getHseTrainingsPaginated(searchParams: DataTableSearchParams) {
  const companyId = await resolveCompanyId();
  if (!companyId) return { data: [], total: 0 };
  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = safePaging(state);
    const where = buildWhereClause(companyId, state);
    const [rows, total] = await Promise.all([
      prisma.hse_trainings.findMany({ where, orderBy: orderByFor(state), skip, take, select: TRAINING_SELECT }),
      prisma.hse_trainings.count({ where }),
    ]);
    return { data: shape(rows, await progressByTraining(rows.map((r) => r.id))), total };
  } catch (error) {
    logger.error('Error al obtener capacitaciones HSE', { data: { error } });
    throw new Error('No se pudo obtener la lista de capacitaciones');
  }
}

export async function getAllHseTrainingsForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<HseTrainingListItem[]>> {
  const companyId = await resolveCompanyId();
  if (!companyId) return { ok: false, message: 'No tiene permiso para exportar las capacitaciones.' };
  try {
    const state = parseSearchParams(searchParams);
    const where = buildWhereClause(companyId, state);
    const rows = await fetchExportRowsInBatches({
      maxRows: EXPORT_LIMIT,
      listIds: (take) =>
        prisma.hse_trainings.findMany({ where, orderBy: orderByFor(state), select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.hse_trainings.findMany({ where: { id: { in: ids }, company_id: companyId }, select: TRAINING_SELECT }),
      tooLargeMessage: tooManyRowsMessage('capacitaciones'),
    });
    return { ok: true, data: shape(rows, await progressByTraining(rows.map((r) => r.id))) };
  } catch (error) {
    logger.error('Error al exportar capacitaciones HSE', { data: { error } });
    return exportFailure(error, 'No se pudo exportar la lista de capacitaciones. Intente nuevamente.');
  }
}

export async function getHseTrainingSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<SingleFacetResult> {
  const companyId = await resolveCompanyId();
  if (!companyId) return null;
  const parsed = searchParams && Object.keys(searchParams).length > 0 ? parseSearchParams(searchParams) : null;

  function crossWhere(excludeColumn: string): TrainingWhere {
    const base: FilterState = parsed ?? parseSearchParams({});
    const filters = { ...base.filters };
    delete filters[excludeColumn];
    return buildWhereClause(companyId as string, { ...base, filters });
  }

  try {
    if (columnId === 'status') {
      const rows = await prisma.hse_trainings.groupBy({ by: ['status'], where: crossWhere('status'), _count: true });
      return { counts: new Map(rows.map((r) => [r.status, r._count] as [string, number])) };
    }
    if (columnId === 'kind') {
      const rows = await prisma.hse_trainings.groupBy({ by: ['kind'], where: crossWhere('kind'), _count: true });
      return { counts: new Map(rows.map((r) => [r.kind, r._count] as [string, number])) };
    }
    if (columnId === 'progress') {
      const where = crossWhere('progress');
      const counts = await Promise.all(
        PROGRESS_VALUES.map((value) => prisma.hse_trainings.count({ where: { AND: [where, progressWhere(value)] } }))
      );
      return { counts: new Map(PROGRESS_VALUES.map((value, i) => [value, counts[i] ?? 0] as [string, number])) };
    }
    logger.warn('Facet no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet de capacitaciones', { data: { error, columnId } });
    return null;
  }
}

export type HseTrainingListItem = Awaited<ReturnType<typeof getHseTrainingsPaginated>>['data'][number];
