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
import { NULL_FILTER_VALUE, parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { exportFailure, fetchExportRowsInBatches, tooManyRowsMessage } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import type { SingleFacetResult } from '@/shared/lib/table-list-query';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { HSE_ASSIGNMENT_STATUS_LABELS, type HseAssignmentStatus } from '../../lib/constants';
import { summarizeExam, summarizeStudy } from '../../lib/study-time';
import { effectiveAssignmentStatus } from '../../lib/training-status';

/**
 * Reporte de tiempos de capacitación: una fila por empleado y capacitación (su asignación vigente) con cuánto estudió
 * el material y cuánto tardó en el examen. Ver `lib/study-time.ts` para qué mide cada número y por qué lo que no se
 * pudo medir es `null` (se muestra "Sin medición"), nunca 0.
 *
 * Mismo permiso y mismo perímetro que el cumplimiento de una capacitación (`hse:capacitaciones:view`, que es también
 * lo que exige la RLS de intentos, lecturas y aperturas). Los tiempos son valores derivados: no se filtran ni se ordenan
 * en la base (no hay columna que los guarde); sí se filtra y ordena por todo lo demás.
 */

const logger = new Logger('features/Hse/Times');

type AssignmentWhere = Prisma.hse_training_assignmentsWhereInput;
type AssignmentOrderBy = Prisma.hse_training_assignmentsOrderByWithRelationInput;
type FilterState = ReturnType<typeof parseSearchParams>;

const STATUS_VALUES = Object.keys(HSE_ASSIGNMENT_STATUS_LABELS) as HseAssignmentStatus[];
const VALID_SORT_FIELDS = new Set(['status', 'attempts_used', 'last_attempt_at']);
const SORT_MAP: Record<string, (dir: 'asc' | 'desc') => AssignmentOrderBy[]> = {
  file: (dir) => [{ employee: { file: dir } }],
  employee: (dir) => [{ employee: { lastname: dir } }, { employee: { firstname: dir } }],
  training: (dir) => [{ training: { title: dir } }],
  position: (dir) => [{ employee: { company_positions: { name: dir } } }],
};
const EXPORT_LIMIT = 20_000;
/** Ids por consulta al completar con lecturas, aperturas e intentos (los del export pueden ser miles). */
const ENRICH_CHUNK = 1_000;
const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

async function resolveCompanyId(): Promise<string | null> {
  if (!(await isModuleEnabled('hse'))) return null;
  if (!(await checkPermissionServer('hse', 'capacitaciones', 'view'))) return null;
  return getActiveCompanyId();
}

const todayDate = () => new Date(`${argentinaDate()}T00:00:00.000Z`);

function statusWhere(value: HseAssignmentStatus): AssignmentWhere {
  if (value === 'expired') return { status: 'passed', valid_until: { lt: todayDate() } };
  if (value === 'passed')
    return { status: 'passed', OR: [{ valid_until: null }, { valid_until: { gte: todayDate() } }] };
  return { status: value };
}

function buildWhereClause(companyId: string, state: FilterState): AssignmentWhere {
  const f = state.filters;
  // Solo asignaciones vigentes de capacitaciones publicadas o retiradas (un borrador no tiene asignaciones).
  const and: AssignmentWhere[] = [{ company_id: companyId, archived_at: null }];

  const search = textValue(state.search);
  if (search) {
    and.push({
      OR: [
        { employee: { file: contains(search) } },
        { employee: { lastname: contains(search) } },
        { employee: { firstname: contains(search) } },
        { training: { title: contains(search) } },
      ],
    });
  }
  const statuses = (f.status ?? []).filter((v): v is HseAssignmentStatus => (STATUS_VALUES as string[]).includes(v));
  if (statuses.length > 0) and.push({ OR: statuses.map(statusWhere) });
  const training = facetWhere('training_id', f.training, { kind: 'uuid', nullable: false });
  if (training) and.push(training as AssignmentWhere);
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
  and.push(buildTreasuryDateRangeWhere(f, { timestampColumns: ['last_attempt_at'] }) as AssignmentWhere);
  return { AND: and };
}

const ASSIGNMENT_SELECT = {
  id: true,
  training_id: true,
  employee_id: true,
  status: true,
  attempts_used: true,
  last_attempt_at: true,
  valid_until: true,
  training: { select: { title: true, max_attempts: true } },
  employee: {
    select: {
      file: true,
      lastname: true,
      firstname: true,
      is_active: true,
      company_positions: { select: { id: true, name: true } },
    },
  },
} as const;
type AssignmentRow = Prisma.hse_training_assignmentsGetPayload<{ select: typeof ASSIGNMENT_SELECT }>;

const pairKey = (employeeId: string, trainingId: string) => `${employeeId}:${trainingId}`;

const chunk = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

/**
 * Completa las filas con las marcas de estudio (aperturas + lecturas) y los intentos cerrados. Tres consultas por
 * tanda, sin importar cuántas filas: nada de una consulta por fila.
 */
async function shape(companyId: string, rows: AssignmentRow[]) {
  const today = argentinaDate();
  const trainingIds = [...new Set(rows.map((r) => r.training_id))];
  const [materialCounts, opens, reads, attempts] = await Promise.all([
    trainingIds.length
      ? prisma.hse_training_materials.groupBy({
          by: ['training_id'],
          where: { company_id: companyId, training_id: { in: trainingIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    Promise.all(
      chunk(rows, ENRICH_CHUNK).map((part) =>
        prisma.hse_training_material_opens.findMany({
          where: {
            company_id: companyId,
            employee_id: { in: part.map((r) => r.employee_id) },
            training_id: { in: [...new Set(part.map((r) => r.training_id))] },
          },
          select: { employee_id: true, training_id: true, material_id: true, first_opened_at: true },
        })
      )
    ).then((parts) => parts.flat()),
    Promise.all(
      chunk(rows, ENRICH_CHUNK).map((part) =>
        prisma.hse_training_material_reads.findMany({
          where: {
            company_id: companyId,
            employee_id: { in: part.map((r) => r.employee_id) },
            training_id: { in: [...new Set(part.map((r) => r.training_id))] },
          },
          select: { employee_id: true, training_id: true, material_id: true, read_at: true },
        })
      )
    ).then((parts) => parts.flat()),
    Promise.all(
      chunk(rows, ENRICH_CHUNK).map((part) =>
        prisma.hse_training_attempts.findMany({
          where: {
            company_id: companyId,
            assignment_id: { in: part.map((r) => r.id) },
            status: { in: ['submitted', 'expired'] },
          },
          select: { assignment_id: true, attempt_number: true, started_at: true, submitted_at: true },
        })
      )
    ).then((parts) => parts.flat()),
  ]);

  const materialsByTraining = new Map(materialCounts.map((m) => [m.training_id, m._count._all]));
  const opensByPair = new Map<string, Map<string, Date>>();
  for (const o of opens) {
    const key = pairKey(o.employee_id, o.training_id);
    opensByPair.set(key, (opensByPair.get(key) ?? new Map()).set(o.material_id, o.first_opened_at));
  }
  const readsByPair = new Map<string, { materialId: string; readAt: Date }[]>();
  for (const r of reads) {
    const key = pairKey(r.employee_id, r.training_id);
    readsByPair.set(key, [...(readsByPair.get(key) ?? []), { materialId: r.material_id, readAt: r.read_at }]);
  }
  const attemptsByAssignment = new Map<string, typeof attempts>();
  for (const a of attempts) {
    attemptsByAssignment.set(a.assignment_id, [...(attemptsByAssignment.get(a.assignment_id) ?? []), a]);
  }

  return rows.map((r) => {
    const key = pairKey(r.employee_id, r.training_id);
    const opened = opensByPair.get(key) ?? new Map<string, Date>();
    const study = summarizeStudy(
      (readsByPair.get(key) ?? []).map((read) => ({
        firstOpenedAt: opened.get(read.materialId) ?? null,
        readAt: read.readAt,
      })),
      materialsByTraining.get(r.training_id) ?? 0
    );
    const exam = summarizeExam(
      (attemptsByAssignment.get(r.id) ?? []).map((a) => ({
        number: a.attempt_number,
        startedAt: a.started_at,
        submittedAt: a.submitted_at,
      }))
    );
    const validUntil = r.valid_until ? r.valid_until.toISOString().slice(0, 10) : null;
    return {
      id: r.id,
      status: effectiveAssignmentStatus(r.status, validUntil, today),
      attempts_used: r.attempts_used,
      max_attempts: r.training.max_attempts,
      last_attempt_at: r.last_attempt_at,
      training: { id: r.training_id, title: r.training.title },
      employee: {
        id: r.employee_id,
        file: r.employee.file,
        name: `${r.employee.lastname} ${r.employee.firstname}`.trim(),
        isActive: r.employee.is_active !== false,
      },
      position: r.employee.company_positions
        ? { id: r.employee.company_positions.id, name: r.employee.company_positions.name }
        : null,
      study_seconds: study.seconds,
      study_measured: study.measured,
      study_total: study.total,
      exam_attempts: exam.attempts,
      exam_last_seconds: exam.lastSeconds,
      exam_total_seconds: exam.totalSeconds,
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
  return [
    ...resolved,
    { last_attempt_at: { sort: 'desc', nulls: 'last' } },
    { employee: { lastname: 'asc' } },
    { id: 'asc' },
  ];
}

export async function getHseTimesPaginated(searchParams: DataTableSearchParams) {
  const companyId = await resolveCompanyId();
  if (!companyId) return { data: [], total: 0 };
  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = safePaging(state);
    const where = buildWhereClause(companyId, state);
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
    return { data: await shape(companyId, rows), total };
  } catch (error) {
    logger.error('Error al obtener el reporte de tiempos', { data: { error } });
    throw new Error('No se pudo obtener el reporte de tiempos');
  }
}

export async function getAllHseTimesForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<HseTimesItem[]>> {
  const companyId = await resolveCompanyId();
  if (!companyId) return { ok: false, message: 'No tiene permiso para exportar el reporte de tiempos.' };
  try {
    const state = parseSearchParams(searchParams);
    const where = buildWhereClause(companyId, state);
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
    return { ok: true, data: await shape(companyId, rows) };
  } catch (error) {
    logger.error('Error al exportar el reporte de tiempos', { data: { error } });
    return exportFailure(error, 'No se pudo exportar el reporte de tiempos. Intente nuevamente.');
  }
}

export async function getHseTimesSingleFacet(
  columnId: string,
  searchParams: DataTableSearchParams | undefined
): Promise<SingleFacetResult> {
  const companyId = await resolveCompanyId();
  if (!companyId) return null;
  const parsed = searchParams && Object.keys(searchParams).length > 0 ? parseSearchParams(searchParams) : null;

  function crossWhere(excludeColumn: string): AssignmentWhere {
    const base: FilterState = parsed ?? parseSearchParams({});
    const filters = { ...base.filters };
    delete filters[excludeColumn];
    return buildWhereClause(companyId as string, { ...base, filters });
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
    if (columnId === 'training') {
      const grouped = await prisma.hse_training_assignments.groupBy({
        by: ['training_id'],
        where: crossWhere('training'),
        _count: { _all: true },
      });
      const ids = grouped.map((g) => g.training_id);
      const trainings = ids.length
        ? await prisma.hse_trainings.findMany({
            where: { id: { in: ids }, company_id: companyId },
            select: { id: true, title: true },
            orderBy: { title: 'asc' },
          })
        : [];
      return {
        counts: new Map(grouped.map((g) => [g.training_id, g._count._all] as [string, number])),
        resolvedOptions: trainings.map((t) => ({ id: t.id, name: t.title })),
      };
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
    logger.error('Error al obtener facet del reporte de tiempos', { data: { error, columnId } });
    return null;
  }
}

export type HseTimesItem = Awaited<ReturnType<typeof getHseTimesPaginated>>['data'][number];
