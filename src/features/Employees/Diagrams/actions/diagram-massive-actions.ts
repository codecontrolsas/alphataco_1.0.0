'use server';

import { Logger } from '@/lib/logger';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getSessionUserId } from '@/shared/lib/session';
import { callScalar } from '@/shared/lib/sql';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { z } from 'zod';

import { assertDiagramAccess, assertDiagramAction } from '../lib/diagram-access';
import { buildDiagramDayRangeWhere, isActiveDayInCycle, toDiagramDay, type DiagramDay } from '../lib/diagram-dates';
import {
  computeMassiveConflicts,
  normalizeProcessingResult,
  operationDayKey,
  type ConflictEmployee,
  type ExistingDiagramEntry,
  type NoveltyInfo,
} from '../lib/massive-diagrams';
import { MASSIVE_MAX_EMPLOYEES, MASSIVE_MAX_RANGES, MASSIVE_MAX_TOTAL_DAYS } from '../lib/massive-limits';
import { mergeProcessingResults } from '../lib/massive-merge';
import { findRangesIssue, inclusiveDays, sortRanges } from '../lib/massive-ranges';
import { massiveLoadParamsSchema, type MassiveConflictResolution, type MassiveLoadParams } from '../load/schemas';
import type { ConflictCheckResult, ProcessingResult } from '../types/massive-diagram';

const logger = new Logger('features/Employees/Diagrams/massive');

/**
 * Timeout ampliado de la transacción: la función SQL itera empleados × días con un trigger por fila
 * (`diagrams_logs`); con 100 empleados × 1 mes supera los 5 s del default de Prisma y abortaría con P2028.
 * `maxWait` 5 s para tomar la conexión bajo carga.
 */
const MASSIVE_TX_OPTIONS = { timeout: 120_000, maxWait: 5_000 } as const;

// ─── Perímetro ──────────────────────────────────────────────────────────────

interface ParsedRange {
  from: DiagramDay;
  to: DiagramDay;
  fromKey: string;
  toKey: string;
}

/**
 * Valida los parámetros de una carga masiva y deja los rangos ordenados. El diagrama de trabajo admite un
 * solo rango (el ciclo se cuenta desde su primer día) y, entre todos los rangos, el tope de días es el mismo
 * que ve el usuario en el formulario.
 */
function parseLoadParams(raw: MassiveLoadParams): { params: MassiveLoadParams; ranges: ParsedRange[] } {
  const params = massiveLoadParamsSchema.parse(raw);
  if (params.mode === 'diagram' && params.ranges.length !== 1) {
    throw new Error('El diagrama de trabajo admite un solo rango de fechas');
  }
  const issue = findRangesIssue(params.ranges, { maxRanges: MASSIVE_MAX_RANGES, maxTotalDays: MASSIVE_MAX_TOTAL_DAYS });
  if (issue) throw new Error(issue.message);

  const ranges = sortRanges(params.ranges).map((range) => ({
    from: toDiagramDay(range.from),
    to: toDiagramDay(range.to),
    fromKey: range.from,
    toKey: range.to,
  }));
  return { params, ranges };
}

async function requireActor(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) throw new Error('Sesión requerida');
  return userId;
}

/**
 * Empleados de la lista que pertenecen a la empresa activa, en el orden recibido.
 * Si alguno no existe o es de otra empresa se corta: una carga masiva no debe tocar
 * empleados ajenos ni procesar "los que se pueda" en silencio.
 */
async function resolveOwnedEmployees(employeeIds: string[], companyId: string): Promise<ConflictEmployee[]> {
  const unique = [...new Set(employeeIds)];
  if (unique.length === 0) throw new Error('Debe seleccionar al menos un empleado');
  if (unique.length > MASSIVE_MAX_EMPLOYEES) throw new Error(`Máximo ${MASSIVE_MAX_EMPLOYEES} empleados permitidos`);

  const rows = await prisma.employees.findMany({
    where: withCompany({ id: { in: unique } }, companyId),
    select: { id: true, firstname: true, lastname: true },
  });
  if (rows.length !== unique.length) {
    logger.warn('Carga masiva con empleados ajenos a la empresa activa', {
      data: { requested: unique.length, owned: rows.length },
    });
    throw new Error('Alguno de los empleados seleccionados no pertenece a la empresa activa');
  }

  const byId = new Map(rows.map((row) => [row.id, row]));
  return unique.map((id) => byId.get(id)!);
}

async function findOwnedWorkDiagram(workDiagramId: string, companyId: string) {
  const workDiagram = await prisma.work_diagram.findFirst({
    where: withCompany({ id: workDiagramId }, companyId),
    select: {
      id: true,
      active_working_days: true,
      inactive_working_days: true,
      inactive_novelty: true,
      diagram_type: { select: { id: true, name: true, color: true } },
      work_diagram_active_novelties: {
        select: { diagram_type_id: true, diagram_type: { select: { id: true, name: true, color: true } } },
        orderBy: { created_at: 'asc' },
      },
    },
  });
  if (!workDiagram) throw new Error('Diagrama de trabajo no encontrado');
  return workDiagram;
}

type OwnedWorkDiagram = Awaited<ReturnType<typeof findOwnedWorkDiagram>>;

/**
 * Novedad activa a usar: la elegida (si es de la empresa) o, como hacía la función SQL
 * legacy, la única/primera configurada en el diagrama de trabajo.
 */
async function resolveActiveNovelty(
  workDiagram: OwnedWorkDiagram,
  activeNoveltyId: string | undefined,
  companyId: string
) {
  if (activeNoveltyId) {
    // Casi siempre es una de las novedades del propio diagrama, ya traídas: se evita la consulta extra.
    const configured = workDiagram.work_diagram_active_novelties.find(
      (item) => item.diagram_type_id === activeNoveltyId
    );
    if (configured) return configured.diagram_type;

    const novelty = await prisma.diagram_type.findFirst({
      where: withCompany({ id: activeNoveltyId }, companyId),
      select: { id: true, name: true, color: true },
    });
    if (!novelty) throw new Error('Novedad activa no encontrada');
    return novelty;
  }
  const first = workDiagram.work_diagram_active_novelties[0]?.diagram_type;
  if (!first) throw new Error('El diagrama de trabajo no tiene una novedad activa configurada');
  return first;
}

async function findOwnedNovelty(diagramTypeId: string, companyId: string) {
  const novelty = await prisma.diagram_type.findFirst({
    where: withCompany({ id: diagramTypeId }, companyId),
    select: { id: true, name: true, color: true },
  });
  if (!novelty) throw new Error('Novedad no encontrada');
  return novelty;
}

/** Filas ya cargadas en los rangos + días con parte diario, para los empleados dados (una consulta de cada). */
async function loadRangesState(employeeIds: string[], ranges: ParsedRange[]) {
  const existingWhere =
    ranges.length === 1
      ? buildDiagramDayRangeWhere(ranges[0].from, ranges[0].to)
      : { OR: ranges.map((range) => buildDiagramDayRangeWhere(range.from, range.to)) };
  // `dailyreport.date` es `@db.Date`: se compara con medianoche UTC del día, sin pasar por la zona del servidor.
  const dateWhere = ranges.map((range) => ({
    date: { gte: new Date(`${range.fromKey}T00:00:00.000Z`), lte: new Date(`${range.toKey}T00:00:00.000Z`) },
  }));

  const [existingRows, operations] = await Promise.all([
    prisma.employees_diagram.findMany({
      where: { employee_id: { in: employeeIds }, ...existingWhere },
      select: {
        employee_id: true,
        day: true,
        month: true,
        year: true,
        diagram_type: true,
        diagram_type_employees_diagram_diagram_typeTodiagram_type: { select: { name: true, color: true } },
      },
    }),
    prisma.dailyreportemployeerelations.findMany({
      where: {
        employee_id: { in: employeeIds },
        dailyreportrows: { dailyreport: dateWhere.length === 1 ? dateWhere[0] : { OR: dateWhere } },
      },
      select: { employee_id: true, dailyreportrows: { select: { dailyreport: { select: { date: true } } } } },
    }),
  ]);

  const existing: ExistingDiagramEntry[] = existingRows.map((row) => ({
    employee_id: row.employee_id,
    day: Number(row.day),
    month: Number(row.month),
    year: Number(row.year),
    diagram_type: row.diagram_type,
    diagram_name: row.diagram_type_employees_diagram_diagram_typeTodiagram_type.name,
    diagram_color: row.diagram_type_employees_diagram_diagram_typeTodiagram_type.color,
  }));

  const operationDays = new Set<string>();
  for (const relation of operations) {
    const date = relation.dailyreportrows?.dailyreport?.date;
    if (relation.employee_id && date) operationDays.add(operationDayKey(relation.employee_id, date));
  }

  return { existing, operationDays };
}

// ─── Conflictos ─────────────────────────────────────────────────────────────

/**
 * Conflictos de una carga masiva (por diagrama de trabajo o por una única novedad). Reemplaza a la
 * sobrecarga de 5 argumentos de `check_diagram_conflicts_with_operations_v2` y a `check_novelty_conflicts`
 * (no portadas al Postgres plano): mismo resultado, con el ciclo activo/inactivo contado desde la fecha
 * de inicio como lo hace `process_massive_diagram_creation_v2`. Ver `computeMassiveConflicts`.
 */
export async function checkMassiveConflicts(rawParams: MassiveLoadParams): Promise<ConflictCheckResult> {
  logger.debug('Checking massive conflicts', { data: { params: rawParams } });

  try {
    await assertDiagramAccess('massive_diagram');
    const { params, ranges } = parseLoadParams(rawParams);
    const companyId = await getActiveCompanyId();

    const totalDays = ranges.reduce((sum, range) => sum + inclusiveDays({ from: range.fromKey, to: range.toKey }), 0);

    if (params.mode === 'diagram') {
      const [employees, workDiagram] = await Promise.all([
        resolveOwnedEmployees(params.employeeIds, companyId),
        findOwnedWorkDiagram(params.workDiagramId, companyId),
      ]);
      const activeNovelty = await resolveActiveNovelty(workDiagram, params.activeNoveltyId, companyId);
      const inactiveNovelty: NoveltyInfo = workDiagram.diagram_type ?? { name: null, color: null };
      const activeDays = Number(workDiagram.active_working_days ?? 0);
      const inactiveDays = Number(workDiagram.inactive_working_days ?? 0);

      const state = await loadRangesState(
        employees.map((employee) => employee.id),
        ranges
      );
      // El diagrama de trabajo tiene un único rango (validado arriba).
      const [range] = ranges;
      const conflicts = computeMassiveConflicts({
        employees,
        from: range.from,
        to: range.to,
        existing: state.existing,
        operationDays: state.operationDays,
        newNoveltyForDay: (dayIndex) =>
          isActiveDayInCycle(dayIndex, activeDays, inactiveDays) ? activeNovelty : inactiveNovelty,
      });

      return {
        conflicts,
        work_diagram_id: workDiagram.id,
        active_novelty_id: activeNovelty.id,
        inactive_novelty_id: workDiagram.inactive_novelty ?? undefined,
        total_records: employees.length * totalDays,
      };
    }

    const [employees, novelty] = await Promise.all([
      resolveOwnedEmployees(params.employeeIds, companyId),
      findOwnedNovelty(params.diagramTypeId, companyId),
    ]);
    const state = await loadRangesState(
      employees.map((employee) => employee.id),
      ranges
    );
    const conflicts = ranges.flatMap((range) =>
      computeMassiveConflicts({
        employees,
        from: range.from,
        to: range.to,
        existing: state.existing,
        operationDays: state.operationDays,
        newNoveltyForDay: () => novelty,
      })
    );

    return { conflicts, diagram_type_id: novelty.id, total_records: employees.length * totalDays };
  } catch (error) {
    logger.error('Error in checkMassiveConflicts', { data: { error } });
    throw error;
  }
}

// ─── Procesamiento (funciones SQL) ──────────────────────────────────────────

/**
 * Procesa una carga masiva con las funciones SQL `process_massive_*`: una llamada por rango, todas dentro de
 * una única transacción (si una falla no queda nada a medias). `conflictResolution`: `skip` conserva las
 * novedades ya cargadas y `update` las reemplaza (los días con parte diario nunca se pisan: salen como error).
 */
export async function processMassiveLoad(
  rawParams: MassiveLoadParams,
  conflictResolution: MassiveConflictResolution
): Promise<ProcessingResult> {
  logger.debug('Processing massive load', { data: { params: rawParams, conflictResolution } });

  try {
    await assertDiagramAction('create', 'massive_diagram');
    const { params, ranges } = parseLoadParams(rawParams);
    if (conflictResolution !== 'skip' && conflictResolution !== 'update') {
      throw new Error('Resolución de conflictos inválida');
    }
    // Sobrescribir novedades ya cargadas es una edición: exige además `update`.
    if (conflictResolution === 'update') await assertDiagramAction('update', 'massive_diagram');
    const [companyId, actor] = await Promise.all([getActiveCompanyId(), requireActor()]);

    if (params.mode === 'diagram') {
      const [employees, workDiagram] = await Promise.all([
        resolveOwnedEmployees(params.employeeIds, companyId),
        findOwnedWorkDiagram(params.workDiagramId, companyId),
      ]);
      const activeNovelty = await resolveActiveNovelty(workDiagram, params.activeNoveltyId, companyId);
      const employeeIds = employees.map((employee) => employee.id);

      // Dentro de withActor: el trigger de employees_diagram escribe diagrams_logs con app.user_id.
      const results = await withActor(
        actor,
        async (tx) => {
          const processed: ProcessingResult[] = [];
          for (const range of ranges) {
            const raw = await callScalar(
              'process_massive_diagram_creation_v2',
              [
                { uuidArray: employeeIds },
                { uuid: workDiagram.id },
                { uuid: activeNovelty.id },
                { date: range.fromKey },
                { date: range.toKey },
                conflictResolution,
              ],
              z.unknown(),
              tx
            );
            processed.push(normalizeProcessingResult(raw));
          }
          return processed;
        },
        prisma,
        MASSIVE_TX_OPTIONS
      );
      return mergeProcessingResults(results);
    }

    const [employees, novelty] = await Promise.all([
      resolveOwnedEmployees(params.employeeIds, companyId),
      findOwnedNovelty(params.diagramTypeId, companyId),
    ]);
    const employeeIds = employees.map((employee) => employee.id);

    const results = await withActor(
      actor,
      async (tx) => {
        const processed: ProcessingResult[] = [];
        for (const range of ranges) {
          const raw = await callScalar(
            'process_massive_novelty_creation',
            [
              { uuidArray: employeeIds },
              { uuid: novelty.id },
              { date: range.fromKey },
              { date: range.toKey },
              conflictResolution,
            ],
            z.unknown(),
            tx
          );
          processed.push(normalizeProcessingResult(raw));
        }
        return processed;
      },
      prisma,
      MASSIVE_TX_OPTIONS
    );
    return mergeProcessingResults(results);
  } catch (error) {
    logger.error('Error in processMassiveLoad', { data: { error } });
    throw error;
  }
}
