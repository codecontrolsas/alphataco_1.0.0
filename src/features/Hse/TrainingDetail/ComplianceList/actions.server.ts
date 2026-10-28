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
import { UUID_RE } from '@/shared/lib/storage-buckets';
import type { SingleFacetResult } from '@/shared/lib/table-list-query';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { HSE_ASSIGNMENT_STATUS_LABELS, type HseAssignmentStatus } from '../../lib/constants';
import { isHseEnabled } from '../../lib/feature-gate';
import { effectiveAssignmentStatus, toPercent } from '../../lib/training-status';

/**
 * Cumplimiento de UNA capacitación: una fila por empleado con su asignación VIGENTE (sin archivar) y su resultado:
 * estado (pendiente, rindiendo, aprobada, vencida, sin intentos), intentos, último puntaje, aprobada el y vigente hasta.
 * `trainingId` viene del servidor que arma la página y se valida igual. Bajo RLS exige `hse:capacitaciones:view`.
 */

const logger = new Logger('features/Hse/TrainingCompliance');

type AssignmentWhere = Prisma.hse_training_assignmentsWhereInput;
type AssignmentOrderBy = Prisma.hse_training_assignmentsOrderByWithRelationInput;
type FilterState = ReturnType<typeof parseSearchParams>;

const STATUS_VALUES = Object.keys(HSE_ASSIGNMENT_STATUS_LABELS) as HseAssignmentStatus[];
const VALID_SORT_FIELDS = new Set(['status', 'attempts_used', 'last_score_percent', 'passed_at', 'valid_until']);
const SORT_MAP: Record<string, (dir: 'asc' | 'desc') => AssignmentOrderBy[]> = {
  file: (dir) => [{ employee: { file: dir } }],
  employee: (dir) => [{ employee: { lastname: dir } }, { employee: { firstname: dir } }],
  position: (dir) => [{ employee: { company_positions: { name: dir } } }],
};
const EXPORT_LIMIT = 20_000;
const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

async function resolveCompanyId(): Promise<string | null> {
  if (!(await isHseEnabled())) return null;
  if (!(await checkPermissionServer('hse', 'capacitaciones', 'view'))) return null;
  return getActiveCompanyId();
}

const todayDate = () => new Date(`${argentinaDate()}T00:00:00.000Z`);

/** Estado efectivo como condición: "vencida" = aprobada con la vigencia ya pasada. */
function statusWhere(value: HseAssignmentStatus): AssignmentWhere {
  if (value === 'expired') return { status: 'passed', valid_until: { lt: todayDate() } };
  if (value === 'passed')
    return { status: 'passed', OR: [{ valid_until: null }, { valid_until: { gte: todayDate() } }] };
  return { status: value };
}

function buildWhereClause(companyId: string, state: FilterState, trainingId: string): AssignmentWhere {
  const f = state.filters;
  const and: AssignmentWhere[] = [{ company_id: companyId, training_id: trainingId, archived_at: null }];

  const search = textValue(state.search);
  if (search) {
    and.push({
      OR: [
        { employee: { file: contains(search) } },
        { employee: { lastname: contains(search) } },
        { employee: { firstname: contains(search) } },
      ],
    });
  }
  const statuses = (f.status ?? []).filter((v): v is HseAssignmentStatus => (STATUS_VALUES as string[]).includes(v));
  if (statuses.length > 0) and.push({ OR: statuses.map(statusWhere) });
  const position = facetWhere('company_position', f.position, { kind: 'uuid', nullable: true });
  if (position) and.push({ employee: position as Prisma.employeesWhereInput });

  const file = textValue(f.file?.[0]);
  if (file) and.push({ employee: { file: contains(file) } });
  const employee = textValue(f.employee?.[0]);
  if (employee) {
    and.push({ OR: [{ employee: { lastname: contains(employee) } }, { employee: { firstname: contains(employee) } }] });
  }
  const attemptsText = textValue(f.attempts_used?.[0]);
  if (attemptsText) {
    const value = parseBoundedInt(attemptsText);
    and.push(value !== null ? { attempts_used: value } : { id: { in: [] } });
  }
  const scoreText = textValue(f.last_score_percent?.[0]);
  if (scoreText) {
    const value = parseBoundedInt(scoreText);
    // Puntaje entero: "70" encuentra de 70 a 70,99.
    and.push(value !== null ? { last_score_percent: { gte: value, lt: value + 1 } } : { id: { in: [] } });
  }
  and.push(
    buildTreasuryDateRangeWhere(f, { timestampColumns: ['passed_at'], dateColumns: ['valid_until'] }) as AssignmentWhere
  );
  return { AND: and };
}

const ASSIGNMENT_SELECT = {
  id: true,
  status: true,
  attempts_used: true,
  attempts_total: true,
  last_attempt_at: true,
  last_score_percent: true,
  passed_at: true,
  valid_until: true,
  training: { select: { max_attempts: true } },
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
type AssignmentRow = Prisma.hse_training_assignmentsGetPayload<{ select: typeof ASSIGNMENT_SELECT }>;

function shape(rows: AssignmentRow[]) {
  const today = argentinaDate();
  return rows.map((r) => {
    const validUntil = r.valid_until ? r.valid_until.toISOString().slice(0, 10) : null;
    return {
      id: r.id,
      status: effectiveAssignmentStatus(r.status, validUntil, today),
      attempts_used: r.attempts_used,
      attempts_total: r.attempts_total,
      max_attempts: r.training.max_attempts,
      last_attempt_at: r.last_attempt_at,
      last_score_percent: toPercent(r.last_score_percent),
      passed_at: r.passed_at,
      valid_until: validUntil,
      employee: {
        id: r.employee.id,
        file: r.employee.file,
        name: `${r.employee.lastname} ${r.employee.firstname}`.trim(),
        isActive: r.employee.is_active !== false,
      },
      position: r.employee.company_positions
        ? { id: r.employee.company_positions.id, name: r.employee.company_positions.name }
        : null,
    };
  });
}

function orderByFor(state: FilterState): AssignmentOrderBy[] {
  const resolved: AssignmentOrderBy[] = [];
  for (const s of state.sorting) {
    const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
    const mapper = ownEntry(SORT_MAP, s.id);
    if (mapper) resolved.push(...mapper(dir));
    else if (VALID_SORT_FIELDS.has(s.id)) resolved.push({ [s.id]: dir });
  }
  // Lo pendiente primero (orden del enum: pendiente, rindiendo, aprobada, sin intentos).
  return [...resolved, { status: 'asc' }, { employee: { lastname: 'asc' } }, { id: 'asc' }];
}

const validTrainingId = (trainingId: string) => (UUID_RE.test(trainingId) ? trainingId : null);

export async function getHseTrainingCompliancePaginated(searchParams: DataTableSearchParams, trainingId: string) {
  const companyId = await resolveCompanyId();
  const scope = validTrainingId(trainingId);
  if (!companyId || !scope) return { data: [], total: 0 };
  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = safePaging(state);
    const where = buildWhereClause(companyId, state, scope);
    const [rows, total] = await Promise.all([
      prisma.hse_training_assignments.findMany({
        where,
        orderBy: orderByFor(state),
        skip,
        take,
        select: ASSIGNMENT_SELECT,
      }),
      prisma.hse_training_assignments.count({ where }),
    ]);
    return { data: shape(rows), total };
  } catch (error) {
    logger.error('Error al obtener el cumplimiento de la capacitación', { data: { error, trainingId } });
    throw new Error('No se pudo obtener el cumplimiento');
  }
}

export async function getAllHseTrainingComplianceForExport(
  searchParams: DataTableSearchParams,
  trainingId: string
): Promise<ExportResult<HseTrainingComplianceItem[]>> {
  const companyId = await resolveCompanyId();
  const scope = validTrainingId(trainingId);
  if (!companyId || !scope) return { ok: false, message: 'No tiene permiso para exportar el cumplimiento.' };
  try {
    const state = parseSearchParams(searchParams);
    const where = buildWhereClause(companyId, state, scope);
    const rows = await fetchExportRowsInBatches({
      maxRows: EXPORT_LIMIT,
      listIds: (take) =>
        prisma.hse_training_assignments.findMany({ where, orderBy: orderByFor(state), select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.hse_training_assignments.findMany({
          where: { id: { in: ids }, company_id: companyId },
          select: ASSIGNMENT_SELECT,
        }),
      tooLargeMessage: tooManyRowsMessage('filas'),
    });
    return { ok: true, data: shape(rows) };
  } catch (error) {
    logger.error('Error al exportar el cumplimiento de la capacitación', { data: { error } });
    return exportFailure(error, 'No se pudo exportar el cumplimiento. Intente nuevamente.');
  }
}

export async function getHseTrainingComplianceSingleFacet(
  columnId: string,
  searchParams: DataTableSearchParams | undefined,
  trainingId: string
): Promise<SingleFacetResult> {
  const companyId = await resolveCompanyId();
  const scope = validTrainingId(trainingId);
  if (!companyId || !scope) return null;
  const parsed = searchParams && Object.keys(searchParams).length > 0 ? parseSearchParams(searchParams) : null;

  function crossWhere(excludeColumn: string): AssignmentWhere {
    const base: FilterState = parsed ?? parseSearchParams({});
    const filters = { ...base.filters };
    delete filters[excludeColumn];
    return buildWhereClause(companyId as string, { ...base, filters }, scope as string);
  }

  try {
    if (columnId === 'status') {
      const where = crossWhere('status');
      const counts = await Promise.all(
        STATUS_VALUES.map((value) =>
          prisma.hse_training_assignments.count({ where: { AND: [where, statusWhere(value)] } })
        )
      );
      return { counts: new Map(STATUS_VALUES.map((value, i) => [value, counts[i] ?? 0] as [string, number])) };
    }
    if (columnId === 'position') {
      const rows = await prisma.hse_training_assignments.findMany({
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
    logger.error('Error al obtener facet del cumplimiento de la capacitación', { data: { error, columnId } });
    return null;
  }
}

export type HseTrainingComplianceItem = Awaited<ReturnType<typeof getHseTrainingCompliancePaginated>>['data'][number];
