import 'server-only';

import { effectiveAssignmentStatus } from '@/features/Hse/lib/training-status';
import type { HseAssignmentStatus } from '@/features/Hse/lib/constants';
import type { Prisma } from '@/generated/prisma/client';
import { argentinaDate } from '@/shared/lib/argentina-time';
import moment from 'moment';
import { argentinaDateTime, isoDay, type Tone } from '../lib/labels';
import { trainingStatusOf } from '../trainings/status';
import type { EmployeeAccess } from './access';

/**
 * Secciones del legajo agregadas en la revisión 2. Cada función recibe la transacción del pedido (RLS por empresa) y
 * filtra por empresa; quien las llama decide con el permiso si corresponde pedirlas (un bloque sin permiso no viaja).
 */

const day = (value: moment.Moment) => value.format('YYYY-MM-DD');

// ─── Licencias y ausencias ────────────────────────────────────────────────────

const ABSENCES_LIMIT = 20;

const ABSENCE_STATUS = {
  upcoming: { code: 'upcoming', label: 'Programada', tone: 'neutral' as Tone },
  ongoing: { code: 'ongoing', label: 'En curso', tone: 'warn' as Tone },
  finished: { code: 'finished', label: 'Finalizada', tone: 'ok' as Tone },
};

/**
 * Licencias y ausencias = novedades del diagrama de los tipos que computan ausentismo (`diagram_type.computes_absenteeism`,
 * el mismo criterio del ausentismo de RR.HH.). Los días seguidos del mismo tipo se juntan en un tramo; el estado sale de
 * «hoy» en hora argentina.
 */
export async function loadAbsences(tx: Prisma.TransactionClient, companyId: string, employeeId: string) {
  const rows = await tx.employees_diagram.findMany({
    where: {
      employee_id: employeeId,
      company_id: companyId,
      diagram_type_employees_diagram_diagram_typeTodiagram_type: { computes_absenteeism: true },
    },
    select: {
      day: true,
      month: true,
      year: true,
      comments: true,
      diagram_type: true,
      diagram_type_employees_diagram_diagram_typeTodiagram_type: { select: { name: true, short_description: true } },
    },
  });

  const days = rows
    .map((row) => ({
      date: day(moment.utc({ year: Number(row.year), month: Number(row.month) - 1, day: Number(row.day) })),
      typeId: row.diagram_type,
      type: row.diagram_type_employees_diagram_diagram_typeTodiagram_type.name ?? 'Sin tipo',
      shortName: row.diagram_type_employees_diagram_diagram_typeTodiagram_type.short_description,
      comments: row.comments?.trim() || null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  type Run = { type: string; typeId: string; shortName: string | null; reason: string | null; from: string; to: string; days: number };
  const runs: Run[] = [];
  for (const entry of days) {
    const last = runs.at(-1);
    const continues =
      last && last.typeId === entry.typeId && day(moment.utc(last.to).add(1, 'day')) === entry.date;
    if (last && continues) {
      last.to = entry.date;
      last.days += 1;
      last.reason ??= entry.comments;
    } else {
      runs.push({
        type: entry.type,
        typeId: entry.typeId,
        shortName: entry.shortName,
        reason: entry.comments,
        from: entry.date,
        to: entry.date,
        days: 1,
      });
    }
  }

  const today = argentinaDate();
  const items = runs
    .reverse()
    .slice(0, ABSENCES_LIMIT)
    .map(({ typeId: _typeId, ...run }) => ({
      ...run,
      status: run.to < today ? ABSENCE_STATUS.finished : run.from > today ? ABSENCE_STATUS.upcoming : ABSENCE_STATUS.ongoing,
    }));
  return { total: runs.length, items };
}

// ─── Capacitaciones ───────────────────────────────────────────────────────────

/** Capacitaciones publicadas que le corresponden al empleado (asignaciones sin archivar), con su situación efectiva. */
export async function loadTrainings(tx: Prisma.TransactionClient, companyId: string, employeeId: string) {
  const rows = await tx.hse_training_assignments.findMany({
    where: { employee_id: employeeId, company_id: companyId, archived_at: null, training: { status: 'published' } },
    select: {
      id: true,
      status: true,
      passed_at: true,
      valid_until: true,
      last_score_percent: true,
      training: { select: { title: true } },
    },
  });
  const today = argentinaDate();
  return rows
    .map((row) => {
      const validUntil = isoDay(row.valid_until);
      const result: HseAssignmentStatus = effectiveAssignmentStatus(row.status, validUntil, today);
      return {
        id: row.id,
        course: row.training.title,
        status: trainingStatusOf(result, validUntil, today),
        result,
        approvedAt: row.passed_at ? argentinaDate(row.passed_at) : null,
        expiresAt: validUntil,
        score: row.last_score_percent === null ? null : row.last_score_percent.toNumber(),
      };
    })
    .sort((a, b) => a.course.localeCompare(b.course, 'es'));
}

// ─── Partes diarios: equipos asignados y actividad ────────────────────────────

const ASSIGNMENT_WINDOW_DAYS = 30;
/** El equipo cuenta como «asignado hoy» si figura en el último parte del empleado y ese parte es de los últimos días. */
const ASSIGNMENT_FRESH_DAYS = 7;

/**
 * No hay una asignación fija empleado-equipo en la base: se deriva de los partes diarios. Equipos que figuran junto al
 * empleado en su último parte (de los últimos 7 días, sin líneas canceladas ni reprogramadas); `since` es el primer día
 * de la racha de partes consecutivos del empleado en los que aparece ese equipo.
 */
export async function loadAssignedEquipment(
  tx: Prisma.TransactionClient,
  companyId: string,
  employeeId: string,
  access: EmployeeAccess
) {
  const today = moment.utc(argentinaDate());
  const relations = await tx.dailyreportemployeerelations.findMany({
    where: {
      employee_id: employeeId,
      company_id: companyId,
      dailyreportrows: {
        status: { notIn: ['cancelado', 'reprogramado'] },
        dailyreport: {
          company_id: companyId,
          date: {
            gte: today.clone().subtract(ASSIGNMENT_WINDOW_DAYS, 'days').toDate(),
            lte: today.toDate(),
          },
        },
      },
    },
    select: {
      dailyreportrows: {
        select: {
          dailyreport: { select: { date: true } },
          dailyreportequipmentrelations: {
            select: {
              vehicles: {
                select: { id: true, domain: true, intern_number: true, type_vehicles_typeTotype: { select: { name: true } } },
              },
              other_equipment: {
                select: { id: true, intern_number: true, serial_number: true, type: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
  });

  type Item = {
    id: string;
    kind: 'vehicle' | 'other';
    identifier: string;
    domain: string | null;
    internNumber: string | null;
    type: string | null;
  };
  const byDate = new Map<string, Map<string, Item>>();
  for (const relation of relations) {
    const row = relation.dailyreportrows;
    if (!row?.dailyreport) continue;
    const date = isoDay(row.dailyreport.date)!;
    const items = byDate.get(date) ?? new Map<string, Item>();
    for (const eq of row.dailyreportequipmentrelations) {
      if (eq.vehicles && access.equipmentLists.vehicle) {
        items.set(eq.vehicles.id, {
          id: eq.vehicles.id,
          kind: 'vehicle',
          identifier: eq.vehicles.domain ?? eq.vehicles.intern_number ?? eq.vehicles.id,
          domain: eq.vehicles.domain,
          internNumber: eq.vehicles.intern_number,
          type: eq.vehicles.type_vehicles_typeTotype?.name ?? null,
        });
      } else if (eq.other_equipment && access.equipmentLists.other) {
        items.set(eq.other_equipment.id, {
          id: eq.other_equipment.id,
          kind: 'other',
          identifier: eq.other_equipment.intern_number ?? eq.other_equipment.serial_number ?? eq.other_equipment.id,
          domain: null,
          internNumber: eq.other_equipment.intern_number,
          type: eq.other_equipment.type?.name ?? null,
        });
      }
    }
    byDate.set(date, items);
  }

  // Racha: días de parte del empleado, del más nuevo al más viejo (los días con parte pero sin equipos cortan la racha).
  const dates = [...byDate.keys()].sort().reverse();
  const latest = dates[0];
  if (!latest || latest < day(today.clone().subtract(ASSIGNMENT_FRESH_DAYS, 'days'))) return [];
  return [...byDate.get(latest)!.values()]
    .map((item) => {
      let since = latest;
      for (const date of dates) {
        if (!byDate.get(date)?.has(item.id)) break;
        since = date;
      }
      return { ...item, since };
    })
    .sort((a, b) => a.identifier.localeCompare(b.identifier, 'es'));
}

const ACTIVITY_LIMIT = 10;
const EXPIRED_LOOKBACK_DAYS = 60;

type ActivityEvent = {
  kind: 'document_uploaded' | 'document_expired' | 'report_assignment';
  at: string;
  title: string;
  detail: string | null;
};

/**
 * Últimos eventos útiles del empleado, de las fuentes que ya existen en la base y que el rol puede ver:
 * - `document_uploaded`: movimientos de sus documentos (`documents_employees_logs`), con la regla de permisos y de
 *   tipos privados de la documentación del legajo.
 * - `document_expired`: documentos cuyo vencimiento cayó en los últimos 60 días (no hay un evento guardado: sale de la fecha).
 * - `report_assignment`: líneas de parte diario en las que se lo asignó (requiere ver los partes).
 */
export async function loadActivity(
  tx: Prisma.TransactionClient,
  companyId: string,
  employeeId: string,
  access: EmployeeAccess
) {
  const { permanent, monthly, privateTypes } = access.documents;
  const events: ActivityEvent[] = [];
  const today = argentinaDate();
  const todayStart = new Date(`${today}T03:00:00.000Z`);

  const typeFilter: Prisma.document_typesWhereInput = {
    OR: [...(permanent ? [{ is_it_montlhy: { not: true } }] : []), ...(monthly ? [{ is_it_montlhy: true }] : [])],
    ...(privateTypes ? {} : { private: { not: true } }),
  };

  const [uploads, expired, assignments] = await Promise.all([
    permanent || monthly
      ? tx.documents_employees_logs.findMany({
          where: {
            company_id: companyId,
            documents_employees: { applies: employeeId, archived_at: null, document_types: typeFilter },
          },
          orderBy: { updated_at: 'desc' },
          take: ACTIVITY_LIMIT,
          select: { updated_at: true, documents_employees: { select: { document_types: { select: { name: true } } } } },
        })
      : [],
    permanent || monthly
      ? tx.documents_employees.findMany({
          where: {
            applies: employeeId,
            company_id: companyId,
            archived_at: null,
            document_path: { not: null },
            validity: {
              // Un vencimiento vale hasta el final de su día argentino (03:00 UTC del día siguiente).
              lt: todayStart,
              gte: moment.utc(todayStart).subtract(EXPIRED_LOOKBACK_DAYS, 'days').toDate(),
            },
            document_types: typeFilter,
          },
          orderBy: { validity: 'desc' },
          take: ACTIVITY_LIMIT,
          select: { validity: true, document_types: { select: { name: true } } },
        })
      : [],
    access.reports
      ? tx.dailyreportemployeerelations.findMany({
          where: { employee_id: employeeId, company_id: companyId },
          orderBy: { created_at: 'desc' },
          take: ACTIVITY_LIMIT,
          select: {
            created_at: true,
            dailyreportrows: {
              select: {
                dailyreport: { select: { date: true } },
                customers: { select: { name: true } },
                customer_services: { select: { service_name: true } },
              },
            },
          },
        })
      : [],
  ]);

  for (const log of uploads) {
    events.push({
      kind: 'document_uploaded',
      at: argentinaDateTime(log.updated_at),
      title: log.documents_employees.document_types?.name ?? 'Documento',
      detail: null,
    });
  }
  for (const doc of expired) {
    const date = argentinaDate(doc.validity!);
    events.push({
      kind: 'document_expired',
      at: `${date}T00:00:00-03:00`,
      title: doc.document_types?.name ?? 'Documento',
      detail: `Venció el ${date}`,
    });
  }
  for (const item of assignments) {
    if (!item.created_at) continue;
    const row = item.dailyreportrows;
    events.push({
      kind: 'report_assignment',
      at: argentinaDateTime(item.created_at),
      title: row?.customers?.name ?? row?.customer_services?.service_name ?? 'Parte diario',
      detail: row?.dailyreport ? `Parte del ${isoDay(row.dailyreport.date)}` : null,
    });
  }
  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, ACTIVITY_LIMIT);
}
