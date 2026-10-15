'use server';

import { Logger } from '@/lib/logger';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getSessionUserId } from '@/shared/lib/session';
import { callScalar } from '@/shared/lib/sql';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import moment from 'moment';
import { z } from 'zod';

import { assertDiagramAccess, assertDiagramAction } from '../lib/diagram-access';
import {
  buildDiagramDayRangeWhere,
  compareDiagramDays,
  diagramDayKey,
  isActiveDayInCycle,
  toDiagramDay,
  type DiagramDay,
} from '../lib/diagram-dates';
import { uuidLike } from '../lib/diagram-ids';
import {
  computeMassiveConflicts,
  normalizeProcessingResult,
  operationDayKey,
  type ConflictEmployee,
  type ExistingDiagramEntry,
  type NoveltyInfo,
} from '../lib/massive-diagrams';
import { MASSIVE_MAX_DAYS_RANGE, MASSIVE_MAX_EMPLOYEES } from '../lib/massive-limits';
import type { ConflictCheckResult, ProcessingResult } from '../types/massive-diagram';

const logger = new Logger('features/Employees/Diagrams/massive');

/** Ver comentario en processMassiveDiagramCreation. */
const MASSIVE_TX_OPTIONS = { timeout: 120_000, maxWait: 5_000 } as const;

// ─── Work Diagrams ──────────────────────────────────────────────────────────

export async function getActiveWorkDiagrams() {
  await assertDiagramAccess('massive_diagram');
  const companyId = await getActiveCompanyId();
  logger.debug('Fetching active work diagrams');

  try {
    const data = await prisma.work_diagram.findMany({
      where: withCompany({ is_active: true }, companyId),
      select: {
        id: true,
        name: true,
        active_working_days: true,
        inactive_working_days: true,
        inactive_novelty: true,
      },
      orderBy: { name: 'asc' },
    });

    return data.map((wd) => ({
      id: wd.id,
      name: wd.name,
      active_working_days: wd.active_working_days ? Number(wd.active_working_days) : null,
      inactive_working_days: wd.inactive_working_days ? Number(wd.inactive_working_days) : null,
      inactive_novelty: wd.inactive_novelty,
    }));
  } catch (error) {
    logger.error('Error fetching active work diagrams', { data: { error } });
    throw error;
  }
}

export type WorkDiagramItem = Awaited<ReturnType<typeof getActiveWorkDiagrams>>[number];

// ─── Novelties ──────────────────────────────────────────────────────────────

export async function getWorkDiagramNovelties(workDiagramId: string) {
  await assertDiagramAccess('massive_diagram');
  const companyId = await getActiveCompanyId();
  logger.debug('Fetching novelties for work diagram', { data: { workDiagramId } });

  try {
    const [workDiagram, activeNovelties] = await Promise.all([
      prisma.work_diagram.findFirst({
        where: withCompany({ id: workDiagramId }, companyId),
        select: {
          inactive_novelty: true,
          diagram_type: {
            select: { id: true, name: true, color: true },
          },
        },
      }),
      prisma.work_diagram_active_novelties.findMany({
        where: withCompany({ work_diagram_id: workDiagramId }, companyId),
        select: {
          diagram_type_id: true,
          diagram_type: {
            select: { id: true, name: true, color: true },
          },
        },
      }),
    ]);

    return {
      inactiveNovelty: workDiagram?.diagram_type ?? null,
      activeNovelties: activeNovelties.map((an) => ({
        diagram_type_id: an.diagram_type_id,
        name: an.diagram_type.name,
        color: an.diagram_type.color,
      })),
    };
  } catch (error) {
    logger.error('Error fetching novelties', { data: { error, workDiagramId } });
    throw error;
  }
}

export type NoveltyData = Awaited<ReturnType<typeof getWorkDiagramNovelties>>;
export type ActiveNoveltyItem = NoveltyData['activeNovelties'][number];

// ─── Diagram Types (Novelties) ──────────────────────────────────────────────

/**
 * Trae todas las novedades activas de la empresa para el selector de carga masiva por novedad.
 * No depende de un work_diagram — devuelve el catálogo completo.
 */
export async function getActiveDiagramTypes() {
  await assertDiagramAccess('massive_diagram');
  const companyId = await getActiveCompanyId();
  logger.debug('Fetching active diagram types');

  try {
    return await prisma.diagram_type.findMany({
      where: withCompany({ is_active: true }, companyId),
      select: {
        id: true,
        name: true,
        color: true,
        short_description: true,
      },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error fetching active diagram types', { data: { error } });
    throw error;
  }
}

export type DiagramTypeItem = Awaited<ReturnType<typeof getActiveDiagramTypes>>[number];

// ─── Perímetro ──────────────────────────────────────────────────────────────

const employeeIdsSchema = z.array(uuidLike).max(MASSIVE_MAX_EMPLOYEES * 10);

/**
 * Valida el rango de una carga masiva: fechas `YYYY-MM-DD` reales, desde <= hasta y no más de
 * `MASSIVE_MAX_DAYS_RANGE` días (el mismo tope que aplica el formulario).
 */
function parseMassiveRange(dateFrom: string, dateTo: string): { from: DiagramDay; to: DiagramDay } {
  const from = toDiagramDay(dateFrom);
  const to = toDiagramDay(dateTo);
  if (compareDiagramDays(from, to) > 0) {
    throw new Error('Rango de fechas inválido: la fecha desde es posterior a la fecha hasta');
  }
  const days = moment.utc(diagramDayKey(to)).diff(moment.utc(diagramDayKey(from)), 'days');
  if (days > MASSIVE_MAX_DAYS_RANGE) throw new Error(`Máximo ${MASSIVE_MAX_DAYS_RANGE} días permitidos`);
  return { from, to };
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
  const parsed = employeeIdsSchema.safeParse(employeeIds);
  if (!parsed.success) throw new Error('Lista de empleados inválida');
  const unique = [...new Set(parsed.data)];
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

/** Filas ya cargadas en el rango + días con parte diario, para los empleados dados. */
async function loadRangeState(employeeIds: string[], from: DiagramDay, to: DiagramDay) {
  // `dailyreport.date` es `@db.Date`: se compara con medianoche UTC del día, sin pasar por la zona del servidor.
  const dateFrom = new Date(`${diagramDayKey(from)}T00:00:00.000Z`);
  const dateTo = new Date(`${diagramDayKey(to)}T00:00:00.000Z`);

  const [existingRows, operations] = await Promise.all([
    prisma.employees_diagram.findMany({
      where: { employee_id: { in: employeeIds }, ...buildDiagramDayRangeWhere(from, to) },
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
        dailyreportrows: { dailyreport: { date: { gte: dateFrom, lte: dateTo } } },
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

  return { from, to, existing, operationDays };
}

// ─── Conflictos ─────────────────────────────────────────────────────────────

/**
 * Conflictos de una carga masiva por diagrama de trabajo. Reemplaza a la sobrecarga de 5
 * argumentos de `check_diagram_conflicts_with_operations_v2` (no portada al Postgres plano):
 * mismo resultado, con el ciclo activo/inactivo contado desde `dateFrom` como lo hace
 * `process_massive_diagram_creation_v2`.
 */
export async function checkDiagramConflicts(params: {
  employeeIds: string[];
  workDiagramId: string;
  dateFrom: string;
  dateTo: string;
  activeNoveltyId?: string;
}): Promise<ConflictCheckResult> {
  logger.debug('Checking diagram conflicts', { data: { params } });

  try {
    await assertDiagramAccess('massive_diagram');
    const range = parseMassiveRange(params.dateFrom, params.dateTo);
    const companyId = await getActiveCompanyId();
    const [employees, workDiagram] = await Promise.all([
      resolveOwnedEmployees(params.employeeIds, companyId),
      findOwnedWorkDiagram(params.workDiagramId, companyId),
    ]);
    const activeNovelty = await resolveActiveNovelty(workDiagram, params.activeNoveltyId, companyId);
    const inactiveNovelty: NoveltyInfo = workDiagram.diagram_type ?? { name: null, color: null };
    const activeDays = Number(workDiagram.active_working_days ?? 0);
    const inactiveDays = Number(workDiagram.inactive_working_days ?? 0);

    const state = await loadRangeState(
      employees.map((e) => e.id),
      range.from,
      range.to
    );

    const conflicts = computeMassiveConflicts({
      employees,
      from: state.from,
      to: state.to,
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
    };
  } catch (error) {
    logger.error('Error in checkDiagramConflicts', { data: { error } });
    throw error;
  }
}

/** Conflictos de una carga masiva de una única novedad (antes `check_novelty_conflicts`). */
export async function checkNoveltyConflicts(params: {
  employeeIds: string[];
  diagramTypeId: string;
  dateFrom: string;
  dateTo: string;
}): Promise<ConflictCheckResult> {
  logger.debug('Checking novelty conflicts', { data: { params } });

  try {
    await assertDiagramAccess('massive_diagram');
    const range = parseMassiveRange(params.dateFrom, params.dateTo);
    const companyId = await getActiveCompanyId();
    const [employees, novelty] = await Promise.all([
      resolveOwnedEmployees(params.employeeIds, companyId),
      prisma.diagram_type.findFirst({
        where: withCompany({ id: params.diagramTypeId }, companyId),
        select: { id: true, name: true, color: true },
      }),
    ]);
    if (!novelty) throw new Error('Novedad no encontrada');

    const state = await loadRangeState(
      employees.map((e) => e.id),
      range.from,
      range.to
    );

    const conflicts = computeMassiveConflicts({
      employees,
      from: state.from,
      to: state.to,
      existing: state.existing,
      operationDays: state.operationDays,
      newNoveltyForDay: () => novelty,
    });

    return { conflicts, diagram_type_id: novelty.id };
  } catch (error) {
    logger.error('Error in checkNoveltyConflicts', { data: { error } });
    throw error;
  }
}

// ─── Procesamiento (funciones SQL) ──────────────────────────────────────────

export async function processMassiveDiagramCreation(params: {
  employeeIds: string[];
  workDiagramId: string;
  activeNoveltyId: string;
  dateFrom: string;
  dateTo: string;
  conflictResolution: 'skip' | 'update';
}): Promise<ProcessingResult> {
  logger.debug('Processing massive diagram creation', { data: { params } });

  try {
    await assertDiagramAction('create', 'massive_diagram');
    const range = parseMassiveRange(params.dateFrom, params.dateTo);
    if (params.conflictResolution !== 'skip' && params.conflictResolution !== 'update') {
      throw new Error('Resolución de conflictos inválida');
    }
    // Sobrescribir novedades ya cargadas es una edición: exige además `update`.
    if (params.conflictResolution === 'update') await assertDiagramAction('update', 'massive_diagram');
    const [companyId, actor] = await Promise.all([getActiveCompanyId(), requireActor()]);
    const [employees, workDiagram] = await Promise.all([
      resolveOwnedEmployees(params.employeeIds, companyId),
      findOwnedWorkDiagram(params.workDiagramId, companyId),
    ]);
    const activeNovelty = await resolveActiveNovelty(workDiagram, params.activeNoveltyId || undefined, companyId);

    // Dentro de withActor: el trigger de employees_diagram escribe diagrams_logs con app.user_id.
    // Timeout ampliado: la función SQL itera empleados × días con trigger por fila
    // (diagrams_logs); con 100 empleados × 1 mes supera los 5 s del default de Prisma
    // y abortaría con P2028. maxWait 5 s para tomar la conexión bajo carga.
    const raw = await withActor(
      actor,
      (tx) =>
        callScalar(
          'process_massive_diagram_creation_v2',
          [
            { uuidArray: employees.map((e) => e.id) },
            { uuid: workDiagram.id },
            { uuid: activeNovelty.id },
            { date: diagramDayKey(range.from) },
            { date: diagramDayKey(range.to) },
            params.conflictResolution,
          ],
          z.unknown(),
          tx
        ),
      prisma,
      MASSIVE_TX_OPTIONS
    );

    return normalizeProcessingResult(raw);
  } catch (error) {
    logger.error('Error in processMassiveDiagramCreation', { data: { error } });
    throw error;
  }
}

export async function processMassiveNoveltyCreation(params: {
  employeeIds: string[];
  diagramTypeId: string;
  dateFrom: string;
  dateTo: string;
  conflictResolution: 'skip' | 'update';
}): Promise<ProcessingResult> {
  logger.debug('Processing massive novelty creation', { data: { params } });

  try {
    await assertDiagramAction('create', 'massive_diagram');
    const range = parseMassiveRange(params.dateFrom, params.dateTo);
    if (params.conflictResolution !== 'skip' && params.conflictResolution !== 'update') {
      throw new Error('Resolución de conflictos inválida');
    }
    // Sobrescribir novedades ya cargadas es una edición: exige además `update`.
    if (params.conflictResolution === 'update') await assertDiagramAction('update', 'massive_diagram');
    const [companyId, actor] = await Promise.all([getActiveCompanyId(), requireActor()]);
    const [employees, novelty] = await Promise.all([
      resolveOwnedEmployees(params.employeeIds, companyId),
      prisma.diagram_type.findFirst({
        where: withCompany({ id: params.diagramTypeId }, companyId),
        select: { id: true },
      }),
    ]);
    if (!novelty) throw new Error('Novedad no encontrada');

    // Mismo timeout ampliado que la carga por diagrama (empleados × días con trigger por fila).
    const raw = await withActor(
      actor,
      (tx) =>
        callScalar(
          'process_massive_novelty_creation',
          [
            { uuidArray: employees.map((e) => e.id) },
            { uuid: novelty.id },
            { date: diagramDayKey(range.from) },
            { date: diagramDayKey(range.to) },
            params.conflictResolution,
          ],
          z.unknown(),
          tx
        ),
      prisma,
      MASSIVE_TX_OPTIONS
    );

    return normalizeProcessingResult(raw);
  } catch (error) {
    logger.error('Error in processMassiveNoveltyCreation', { data: { error } });
    throw error;
  }
}
