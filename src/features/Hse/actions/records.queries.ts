import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { prisma } from '@/shared/lib/prisma';
import { UUID_RE } from '@/shared/lib/storage-buckets';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { cache } from 'react';
import { isHseEnabled } from '../lib/feature-gate';
import { recordContentSchema } from '../lib/pdf-content';
import { effectiveAssignmentStatus, toPercent } from '../lib/training-status';

/**
 * Lecturas del acta y de los capacitadores para Server Components (no son Server Actions). Empresa de la sesión y
 * permiso de la pestaña; la RLS repite los dos (las actas no tienen compuerta para el empleado).
 */

const logger = new Logger('features/Hse/records.queries');

const dayOf = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

/** Capacitaciones a las que se les puede labrar un acta (publicadas o retiradas), para el alta. */
export async function getPublishedTrainingOptions() {
  if (!(await isHseEnabled())) return [];
  const companyId = await getActiveCompanyId();
  const rows = await prisma.hse_trainings.findMany({
    where: { company_id: companyId, status: { in: ['published', 'archived'] } },
    orderBy: [{ status: 'asc' }, { title: 'asc' }],
    select: { id: true, title: true, status: true },
  });
  return rows.map((r) => ({ id: r.id, name: r.status === 'archived' ? `${r.title} (retirada)` : r.title }));
}
export type HseTrainingOption = Awaited<ReturnType<typeof getPublishedTrainingOptions>>[number];

/** Detalle del acta: datos, capacitadores, asistentes con su resultado y firma ACTUALES, y el contenido congelado. */
export const getHseRecordDetail = cache(async (recordId: string) => {
  if (!(await isHseEnabled()) || !UUID_RE.test(recordId)) return null;
  if (!(await checkPermissionServer('hse', 'actas', 'view'))) return null;
  const companyId = await getActiveCompanyId();
  const today = argentinaDate();

  const record = await prisma.hse_training_records.findFirst({
    where: { id: recordId, company_id: companyId },
    select: {
      id: true,
      number: true,
      held_on: true,
      modality: true,
      location: true,
      duration_minutes: true,
      topics: true,
      observations: true,
      status: true,
      closed_at: true,
      closed_by: true,
      content: true,
      content_sha256: true,
      pdf_path: true,
      voided_at: true,
      void_reason: true,
      created_at: true,
      training: { select: { id: true, title: true, status: true } },
      instructors: {
        orderBy: [{ position: 'asc' }, { full_name: 'asc' }],
        select: { id: true, kind: true, full_name: true, license: true, role_title: true, employee_id: true },
      },
      attendees: {
        select: {
          employee_id: true,
          attended: true,
          employee: {
            select: {
              id: true,
              file: true,
              firstname: true,
              lastname: true,
              company_positions: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!record) return null;

  const employeeIds = record.attendees.map((a) => a.employee_id);
  const assignments = employeeIds.length
    ? await prisma.hse_training_assignments.findMany({
        where: { training_id: record.training.id, employee_id: { in: employeeIds }, company_id: companyId },
        select: {
          employee_id: true,
          status: true,
          valid_until: true,
          last_score_percent: true,
          passed_attempt_id: true,
          archived_at: true,
        },
      })
    : [];
  const passedIds = assignments.flatMap((a) => (a.passed_attempt_id ? [a.passed_attempt_id] : []));
  const certificates = passedIds.length
    ? await prisma.hse_training_certificates.findMany({
        where: { attempt_id: { in: passedIds }, voided_at: null, company_id: companyId },
        select: { id: true, attempt_id: true, signed_at: true },
      })
    : [];
  const byEmployee = new Map(assignments.map((a) => [a.employee_id, a]));
  const certByAttempt = new Map(certificates.map((c) => [c.attempt_id, c]));

  let frozen = null;
  if (record.content) {
    const parsed = recordContentSchema.safeParse(record.content);
    if (parsed.success) frozen = parsed.data;
    else logger.error('Contenido congelado del acta con forma inesperada', { data: { recordId } });
  }

  const attendees = record.attendees
    .map((a) => {
      const assignment = byEmployee.get(a.employee_id);
      const certificate = assignment?.passed_attempt_id ? certByAttempt.get(assignment.passed_attempt_id) : undefined;
      return {
        employeeId: a.employee_id,
        file: a.employee.file,
        fullName: `${a.employee.lastname} ${a.employee.firstname}`.trim(),
        position: a.employee.company_positions?.name ?? null,
        attended: a.attended,
        status: assignment
          ? effectiveAssignmentStatus(assignment.status, dayOf(assignment.valid_until), today)
          : ('not_assigned' as const),
        scorePercent: assignment ? toPercent(assignment.last_score_percent) : null,
        certificateId: certificate?.id ?? null,
        signedAt: certificate?.signed_at ?? null,
      };
    })
    .sort((x, y) => x.fullName.localeCompare(y.fullName, 'es'));

  return {
    id: record.id,
    number: record.number,
    heldOn: dayOf(record.held_on) ?? '',
    modality: record.modality,
    location: record.location,
    durationMinutes: record.duration_minutes,
    topics: record.topics,
    observations: record.observations,
    status: record.status,
    closedAt: record.closed_at,
    contentSha256: record.content_sha256,
    hasPdf: record.pdf_path !== null,
    voidedAt: record.voided_at,
    voidReason: record.void_reason,
    training: record.training,
    instructors: record.instructors.map((i) => ({
      id: i.id,
      kind: i.kind,
      fullName: i.full_name,
      license: i.license,
      roleTitle: i.role_title,
    })),
    attendees,
    frozen,
  };
});
export type HseRecordDetail = NonNullable<Awaited<ReturnType<typeof getHseRecordDetail>>>;

/** Capacitadores habituales y actas de una capacitación (para su detalle). */
export async function getHseTrainingInstructorsAndRecords(trainingId: string) {
  if (!(await isHseEnabled()) || !UUID_RE.test(trainingId))
    return { instructors: [], records: [], canViewRecords: false };
  const companyId = await getActiveCompanyId();
  const canViewRecords = await checkPermissionServer('hse', 'actas', 'view');
  const [instructors, records] = await Promise.all([
    prisma.hse_training_instructors.findMany({
      where: { training_id: trainingId, company_id: companyId },
      orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
      select: { id: true, kind: true, full_name: true, license: true, role_title: true },
    }),
    canViewRecords
      ? prisma.hse_training_records.findMany({
          where: { training_id: trainingId, company_id: companyId },
          orderBy: { number: 'desc' },
          take: 20,
          select: {
            id: true,
            number: true,
            held_on: true,
            status: true,
            _count: { select: { attendees: { where: { attended: true } } } },
          },
        })
      : Promise.resolve([]),
  ]);
  return {
    canViewRecords,
    instructors: instructors.map((i) => ({
      id: i.id,
      kind: i.kind,
      fullName: i.full_name,
      license: i.license,
      roleTitle: i.role_title,
    })),
    records: records.map((r) => ({
      id: r.id,
      number: r.number,
      heldOn: dayOf(r.held_on) ?? '',
      status: r.status,
      present: r._count.attendees,
    })),
  };
}
export type HseTrainingInstructor = Awaited<
  ReturnType<typeof getHseTrainingInstructorsAndRecords>
>['instructors'][number];
