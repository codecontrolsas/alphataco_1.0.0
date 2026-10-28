'use server';

import { errorMessage, fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { isModuleEnabled } from '@/features/Modules/server/modules.server';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { UUID_RE } from '@/shared/lib/storage-buckets';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { HsePdfDelivery } from '../lib/pdf-delivery';
import { ensureCertificatePdf, ensureRecordPdf } from '../pdf/hse-pdf.server';
import {
  hseInstructorSchema,
  hseRecordCreateSchema,
  hseRecordFormSchema,
  hseVoidSchema,
  type HseInstructorValues,
  type HseRecordCreateValues,
  type HseRecordFormValues,
} from '../schemas/records';
import { getHseDocumentFormOptions } from './queries.server';

/**
 * Actas de dictado, capacitadores y constancias (dashboard HSE, fase 4). Cada acción: módulo prendido, permiso de la
 * acción (`hse:actas:*` o `hse:capacitaciones:*`), empresa de la sesión (nunca del pedido) y transacción con el actor.
 * La RLS repite empresa y permiso, y los triggers guarda impiden tocar un acta cerrada aunque una acción se olvidara.
 *
 * Ciclo del acta: borrador (datos, capacitadores y asistentes) → cerrar (`approve`: congela todo con su huella y
 * genera el PDF) → anular (`delete`, con motivo; no se borra). Un borrador se puede borrar.
 */

const logger = new Logger('features/Hse/records');

const NO_PERMISSION = 'No tenés permiso para hacer esto';
const NOT_FOUND = 'El acta no existe';
const NOT_DRAFT = 'El acta está cerrada: no se modifica';
const SESSION_EXPIRED = 'Tu sesión venció. Volvé a iniciar sesión.';

type Auth = { companyId: string; profileId: string; credentialId: string };

async function requireAuth(
  tab: 'actas' | 'capacitaciones',
  action: 'view' | 'create' | 'update' | 'delete' | 'approve'
): Promise<({ ok: true } & Auth) | { ok: false; error: string }> {
  if (!(await isModuleEnabled('hse'))) return { ok: false, error: 'El módulo HSE no está disponible' };
  if (!(await checkPermissionServer('hse', tab, action))) return { ok: false, error: NO_PERMISSION };
  const [profile, companyId] = await Promise.all([getServerAuthProfile(), getActiveCompanyId()]);
  if (!profile) return { ok: false, error: SESSION_EXPIRED };
  return { ok: true, companyId, profileId: profile.id, credentialId: profile.credentialId };
}

function revalidateRecords(recordId?: string, trainingId?: string) {
  revalidatePath('/dashboard/hse');
  if (recordId) revalidatePath(`/dashboard/hse/records/${recordId}`);
  if (trainingId) revalidatePath(`/dashboard/hse/trainings/${trainingId}`);
}

const optionalText = (value: string | undefined) => (value && value.trim() !== '' ? value.trim() : null);

/** Acta de la empresa activa en BORRADOR, bloqueada para esta transacción (dos ediciones no se pisan). */
async function lockDraft(tx: Prisma.TransactionClient, companyId: string, recordId: string) {
  const rows = await tx.$queryRaw<{ status: 'draft' | 'closed' | 'voided'; training_id: string }[]>`
    SELECT status, training_id FROM public.hse_training_records
    WHERE id = ${recordId}::uuid AND company_id = ${companyId}::uuid FOR UPDATE`;
  const row = rows[0];
  if (!row) throw new Error(NOT_FOUND);
  if (row.status !== 'draft') throw new Error(NOT_DRAFT);
  return row.training_id;
}

/** Nombre del capacitador interno: sale del legajo (de la empresa), nunca del navegador. */
async function instructorRow(tx: Prisma.TransactionClient, companyId: string, values: HseInstructorValues) {
  if (values.kind === 'external') {
    return {
      kind: 'external' as const,
      employee_id: null,
      full_name: values.fullName,
      license: optionalText(values.license),
      role_title: optionalText(values.roleTitle),
    };
  }
  const employee = await tx.employees.findFirst({
    where: { id: values.employeeId, company_id: companyId },
    select: { id: true, firstname: true, lastname: true, company_positions: { select: { name: true } } },
  });
  if (!employee) throw new Error('El empleado no es de la empresa');
  return {
    kind: 'internal' as const,
    employee_id: employee.id,
    full_name: `${employee.lastname} ${employee.firstname}`.trim(),
    license: optionalText(values.license),
    role_title: optionalText(values.roleTitle) ?? employee.company_positions?.name ?? null,
  };
}

// ============================================================================
// OPCIONES
// ============================================================================

/** Empleados (con legajo en la etiqueta) para elegir un capacitador interno o sumar un asistente. */
export async function fetchHseRecordFormOptions() {
  if (!(await isModuleEnabled('hse'))) throw new Error('El módulo HSE no está disponible');
  const perms = await Promise.all([
    checkPermissionServer('hse', 'actas', 'create'),
    checkPermissionServer('hse', 'actas', 'update'),
    checkPermissionServer('hse', 'capacitaciones', 'update'),
  ]);
  if (!perms.some(Boolean)) throw new Error(NO_PERMISSION);
  const options = await getHseDocumentFormOptions();
  return { employees: options.employees };
}
export type HseRecordFormOptions = Awaited<ReturnType<typeof fetchHseRecordFormOptions>>;

// ============================================================================
// CAPACITADORES HABITUALES DE LA CAPACITACIÓN
// ============================================================================

export async function addHseTrainingInstructor(
  trainingId: string,
  input: HseInstructorValues
): Promise<ActionResult<null>> {
  const auth = await requireAuth('capacitaciones', 'update');
  if (!auth.ok) return fail(auth.error);
  if (!UUID_RE.test(trainingId)) return fail('La capacitación no existe');
  const parsed = hseInstructorSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Revisá los datos del capacitador');
  try {
    await withActor(auth.credentialId, async (tx) => {
      const training = await tx.hse_trainings.findFirst({
        where: { id: trainingId, company_id: auth.companyId, status: { not: 'archived' } },
        select: { id: true },
      });
      if (!training) throw new Error('La capacitación no existe o está retirada');
      const count = await tx.hse_training_instructors.count({ where: { training_id: trainingId } });
      if (count >= 10) throw new Error('Hasta 10 capacitadores por capacitación');
      await tx.hse_training_instructors.create({
        data: {
          ...(await instructorRow(tx, auth.companyId, parsed.data)),
          company_id: auth.companyId,
          training_id: trainingId,
          position: count,
        },
        select: { id: true },
      });
    });
    revalidateRecords(undefined, trainingId);
    return ok(null);
  } catch (error) {
    logger.error('Error al agregar el capacitador', { data: { error, trainingId } });
    return fail(errorMessage(error, 'No se pudo agregar el capacitador'));
  }
}

export async function removeHseTrainingInstructor(instructorId: string): Promise<ActionResult<null>> {
  const auth = await requireAuth('capacitaciones', 'update');
  if (!auth.ok) return fail(auth.error);
  if (!UUID_RE.test(instructorId)) return fail('El capacitador no existe');
  try {
    const trainingId = await withActor(auth.credentialId, async (tx) => {
      const row = await tx.hse_training_instructors.findFirst({
        where: { id: instructorId, company_id: auth.companyId },
        select: { training_id: true },
      });
      if (!row) throw new Error('El capacitador no existe');
      await tx.hse_training_instructors.delete({ where: { id: instructorId }, select: { id: true } });
      return row.training_id;
    });
    revalidateRecords(undefined, trainingId);
    return ok(null);
  } catch (error) {
    logger.error('Error al quitar el capacitador', { data: { error, instructorId } });
    return fail(errorMessage(error, 'No se pudo quitar el capacitador'));
  }
}

// ============================================================================
// ACTA: ALTA, DATOS, CAPACITADORES Y ASISTENTES (BORRADOR)
// ============================================================================

/**
 * Crea el acta en borrador de una capacitación publicada (o retirada, para registrar un dictado pasado). Copia los
 * capacitadores habituales y suma como asistentes a quienes la tienen asignada hoy (se ajusta antes de cerrar).
 */
export async function createHseRecord(input: HseRecordCreateValues): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAuth('actas', 'create');
  if (!auth.ok) return fail(auth.error);
  const parsed = hseRecordCreateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Revisá los datos del acta');
  const values = parsed.data;
  try {
    const id = randomUUID();
    await withActor(auth.credentialId, async (tx) => {
      const training = await tx.hse_trainings.findFirst({
        where: { id: values.trainingId, company_id: auth.companyId, status: { not: 'draft' } },
        select: { id: true },
      });
      if (!training) throw new Error('Elegí una capacitación publicada');
      // Número correlativo por empresa: el candado serializa dos altas simultáneas.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`hse_record_number:${auth.companyId}`}))`;
      const last = await tx.hse_training_records.aggregate({
        where: { company_id: auth.companyId },
        _max: { number: true },
      });
      await tx.hse_training_records.create({
        data: {
          id,
          company_id: auth.companyId,
          training_id: values.trainingId,
          number: (last._max.number ?? 0) + 1,
          held_on: new Date(`${values.heldOn}T00:00:00Z`),
          modality: values.modality,
          location: optionalText(values.location),
          duration_minutes: values.durationMinutes === '' ? null : Number(values.durationMinutes),
          topics: values.topics,
          observations: optionalText(values.observations),
          created_by: auth.profileId,
        },
        select: { id: true },
      });
      const [instructors, assignments] = await Promise.all([
        tx.hse_training_instructors.findMany({
          where: { training_id: values.trainingId },
          orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
          select: { kind: true, employee_id: true, full_name: true, license: true, role_title: true },
        }),
        tx.hse_training_assignments.findMany({
          where: { training_id: values.trainingId, archived_at: null },
          select: { employee_id: true },
        }),
      ]);
      if (instructors.length > 0) {
        await tx.hse_training_record_instructors.createMany({
          data: instructors.map((i, position) => ({ ...i, company_id: auth.companyId, record_id: id, position })),
        });
      }
      if (assignments.length > 0) {
        await tx.hse_training_record_attendees.createMany({
          data: assignments.map((a) => ({ company_id: auth.companyId, record_id: id, employee_id: a.employee_id })),
          skipDuplicates: true,
        });
      }
    });
    logger.info('Acta HSE creada', { data: { recordId: id, trainingId: values.trainingId } });
    revalidateRecords(id, values.trainingId);
    return ok({ id });
  } catch (error) {
    logger.error('Error al crear el acta', { data: { error } });
    return fail(errorMessage(error, 'No se pudo crear el acta'));
  }
}

export async function updateHseRecord(recordId: string, input: HseRecordFormValues): Promise<ActionResult<null>> {
  const auth = await requireAuth('actas', 'update');
  if (!auth.ok) return fail(auth.error);
  if (!UUID_RE.test(recordId)) return fail(NOT_FOUND);
  const parsed = hseRecordFormSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Revisá los datos del acta');
  const values = parsed.data;
  try {
    await withActor(auth.credentialId, async (tx) => {
      await lockDraft(tx, auth.companyId, recordId);
      await tx.hse_training_records.update({
        where: { id: recordId },
        data: {
          held_on: new Date(`${values.heldOn}T00:00:00Z`),
          modality: values.modality,
          location: optionalText(values.location),
          duration_minutes: values.durationMinutes === '' ? null : Number(values.durationMinutes),
          topics: values.topics,
          observations: optionalText(values.observations),
          updated_at: new Date(),
        },
        select: { id: true },
      });
    });
    revalidateRecords(recordId);
    return ok(null);
  } catch (error) {
    logger.error('Error al editar el acta', { data: { error, recordId } });
    return fail(errorMessage(error, 'No se pudo guardar el acta'));
  }
}

export async function addHseRecordInstructor(
  recordId: string,
  input: HseInstructorValues
): Promise<ActionResult<null>> {
  const auth = await requireAuth('actas', 'update');
  if (!auth.ok) return fail(auth.error);
  if (!UUID_RE.test(recordId)) return fail(NOT_FOUND);
  const parsed = hseInstructorSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Revisá los datos del capacitador');
  try {
    await withActor(auth.credentialId, async (tx) => {
      await lockDraft(tx, auth.companyId, recordId);
      const count = await tx.hse_training_record_instructors.count({ where: { record_id: recordId } });
      if (count >= 10) throw new Error('Hasta 10 capacitadores por acta');
      await tx.hse_training_record_instructors.create({
        data: {
          ...(await instructorRow(tx, auth.companyId, parsed.data)),
          company_id: auth.companyId,
          record_id: recordId,
          position: count,
        },
        select: { id: true },
      });
    });
    revalidateRecords(recordId);
    return ok(null);
  } catch (error) {
    logger.error('Error al agregar el capacitador al acta', { data: { error, recordId } });
    return fail(errorMessage(error, 'No se pudo agregar el capacitador'));
  }
}

export async function removeHseRecordInstructor(instructorId: string): Promise<ActionResult<null>> {
  const auth = await requireAuth('actas', 'update');
  if (!auth.ok) return fail(auth.error);
  if (!UUID_RE.test(instructorId)) return fail('El capacitador no existe');
  try {
    const recordId = await withActor(auth.credentialId, async (tx) => {
      const row = await tx.hse_training_record_instructors.findFirst({
        where: { id: instructorId, company_id: auth.companyId },
        select: { record_id: true },
      });
      if (!row) throw new Error('El capacitador no existe');
      await lockDraft(tx, auth.companyId, row.record_id);
      await tx.hse_training_record_instructors.delete({ where: { id: instructorId }, select: { id: true } });
      return row.record_id;
    });
    revalidateRecords(recordId);
    return ok(null);
  } catch (error) {
    logger.error('Error al quitar el capacitador del acta', { data: { error, instructorId } });
    return fail(errorMessage(error, 'No se pudo quitar el capacitador'));
  }
}

const attendeeSchema = z.object({ recordId: z.string().uuid(), employeeId: z.string().uuid() });

/** Suma UN asistente (alta explícita: nunca se reemplaza la lista entera). */
export async function addHseRecordAttendee(input: {
  recordId: string;
  employeeId: string;
}): Promise<ActionResult<null>> {
  const auth = await requireAuth('actas', 'update');
  if (!auth.ok) return fail(auth.error);
  const parsed = attendeeSchema.safeParse(input);
  if (!parsed.success) return fail('Elegí el empleado');
  try {
    await withActor(auth.credentialId, async (tx) => {
      await lockDraft(tx, auth.companyId, parsed.data.recordId);
      const employee = await tx.employees.findFirst({
        where: { id: parsed.data.employeeId, company_id: auth.companyId },
        select: { id: true },
      });
      if (!employee) throw new Error('El empleado no es de la empresa');
      await tx.hse_training_record_attendees.createMany({
        data: [{ company_id: auth.companyId, record_id: parsed.data.recordId, employee_id: employee.id }],
        skipDuplicates: true,
      });
    });
    revalidateRecords(parsed.data.recordId);
    return ok(null);
  } catch (error) {
    logger.error('Error al sumar el asistente', { data: { error, ...parsed.data } });
    return fail(errorMessage(error, 'No se pudo sumar el asistente'));
  }
}

/** Quita UN asistente (baja explícita por id). */
export async function removeHseRecordAttendee(input: {
  recordId: string;
  employeeId: string;
}): Promise<ActionResult<null>> {
  const auth = await requireAuth('actas', 'update');
  if (!auth.ok) return fail(auth.error);
  const parsed = attendeeSchema.safeParse(input);
  if (!parsed.success) return fail('El asistente no existe');
  try {
    await withActor(auth.credentialId, async (tx) => {
      await lockDraft(tx, auth.companyId, parsed.data.recordId);
      await tx.hse_training_record_attendees.deleteMany({
        where: { record_id: parsed.data.recordId, employee_id: parsed.data.employeeId, company_id: auth.companyId },
      });
    });
    revalidateRecords(parsed.data.recordId);
    return ok(null);
  } catch (error) {
    logger.error('Error al quitar el asistente', { data: { error, ...parsed.data } });
    return fail(errorMessage(error, 'No se pudo quitar el asistente'));
  }
}

/** Marca si UN asistente estuvo presente o ausente. */
export async function setHseRecordAttendance(input: {
  recordId: string;
  employeeId: string;
  attended: boolean;
}): Promise<ActionResult<null>> {
  const auth = await requireAuth('actas', 'update');
  if (!auth.ok) return fail(auth.error);
  const parsed = attendeeSchema.extend({ attended: z.boolean() }).safeParse(input);
  if (!parsed.success) return fail('El asistente no existe');
  try {
    await withActor(auth.credentialId, async (tx) => {
      await lockDraft(tx, auth.companyId, parsed.data.recordId);
      await tx.hse_training_record_attendees.updateMany({
        where: { record_id: parsed.data.recordId, employee_id: parsed.data.employeeId, company_id: auth.companyId },
        data: { attended: parsed.data.attended },
      });
    });
    revalidateRecords(parsed.data.recordId);
    return ok(null);
  } catch (error) {
    logger.error('Error al marcar la asistencia', { data: { error, recordId: parsed.data.recordId } });
    return fail(errorMessage(error, 'No se pudo guardar la asistencia'));
  }
}

// ============================================================================
// CIERRE, ANULACIÓN Y BORRADO
// ============================================================================

const CLOSE_MESSAGES = {
  not_found: NOT_FOUND,
  not_draft: 'El acta ya estaba cerrada.',
  training_draft: 'La capacitación todavía es un borrador.',
  missing_topics: 'Completá el temario antes de cerrar.',
  missing_instructors: 'Cargá al menos un capacitador antes de cerrar.',
  missing_attendees: 'Marcá al menos un asistente presente antes de cerrar.',
} as const;
const closeResultSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({
    ok: z.literal(false),
    reason: z.enum([
      'not_found',
      'not_draft',
      'training_draft',
      'missing_topics',
      'missing_instructors',
      'missing_attendees',
    ]),
  }),
]);

/** Cierre formal: congela el acta con su huella (en la base) y genera el PDF. Irreversible: solo se puede anular. */
export async function closeHseRecord(recordId: string): Promise<ActionResult<{ pdfUrl: string | null }>> {
  const auth = await requireAuth('actas', 'approve');
  if (!auth.ok) return fail(auth.error);
  if (!UUID_RE.test(recordId)) return fail(NOT_FOUND);
  try {
    const result = await withActor(auth.credentialId, async (tx) => {
      const rows = await tx.$queryRaw<{ r: unknown }[]>`
        SELECT public.hse_close_training_record(${recordId}::uuid, ${auth.profileId}::uuid) AS r`;
      return closeResultSchema.parse(rows[0]?.r);
    });
    if (!result.ok) return fail(CLOSE_MESSAGES[result.reason]);
  } catch (error) {
    logger.error('Error al cerrar el acta', { data: { error, recordId } });
    return fail(errorMessage(error, 'No se pudo cerrar el acta'));
  }
  // El PDF se genera a continuación; si falla, el acta ya quedó cerrada y se genera en la descarga.
  const pdf = await ensureRecordPdf(recordId).catch((error: unknown) => {
    logger.error('El acta quedó cerrada pero no se generó el PDF', { data: { error, recordId } });
    return null;
  });
  logger.info('Acta HSE cerrada', { data: { recordId, pdf: pdf?.ok ?? false } });
  revalidateRecords(recordId);
  return ok({ pdfUrl: pdf?.ok && 'url' in pdf ? pdf.url : null });
}

export async function voidHseRecord(recordId: string, input: { reason: string }): Promise<ActionResult<null>> {
  const auth = await requireAuth('actas', 'delete');
  if (!auth.ok) return fail(auth.error);
  if (!UUID_RE.test(recordId)) return fail(NOT_FOUND);
  const parsed = hseVoidSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Explicá el motivo');
  try {
    await withActor(
      auth.credentialId,
      (tx) =>
        tx.$executeRaw`SELECT public.hse_void_training_record(${recordId}::uuid, ${parsed.data.reason}, ${auth.profileId}::uuid)`
    );
    logger.info('Acta HSE anulada', { data: { recordId } });
    revalidateRecords(recordId);
    return ok(null);
  } catch (error) {
    logger.error('Error al anular el acta', { data: { error, recordId } });
    return fail('No se pudo anular el acta. Solo se anula un acta cerrada.');
  }
}

export async function deleteHseRecordDraft(recordId: string): Promise<ActionResult<null>> {
  const auth = await requireAuth('actas', 'delete');
  if (!auth.ok) return fail(auth.error);
  if (!UUID_RE.test(recordId)) return fail(NOT_FOUND);
  try {
    await withActor(auth.credentialId, async (tx) => {
      await lockDraft(tx, auth.companyId, recordId);
      await tx.hse_training_records.delete({ where: { id: recordId }, select: { id: true } });
    });
    revalidateRecords();
    return ok(null);
  } catch (error) {
    logger.error('Error al borrar el borrador del acta', { data: { error, recordId } });
    return fail(errorMessage(error, 'No se pudo borrar el acta'));
  }
}

// ============================================================================
// PDF (ACTA Y CONSTANCIAS) Y ANULACIÓN DE CONSTANCIAS
// ============================================================================

/** URL de descarga del PDF del acta (lo genera si falta) con la huella verificada. */
export async function getHseRecordPdfUrl(recordId: string): Promise<ActionResult<HsePdfDelivery>> {
  const auth = await requireAuth('actas', 'view');
  if (!auth.ok) return fail(auth.error);
  if (!UUID_RE.test(recordId)) return fail(NOT_FOUND);
  try {
    const result = await ensureRecordPdf(recordId);
    if (!result) return fail('El acta no existe o todavía es un borrador');
    if (!result.ok) return fail(result.error);
    return ok('url' in result ? { url: result.url } : { file: result.file });
  } catch (error) {
    logger.error('Error al preparar el PDF del acta', { data: { error, recordId } });
    return fail('No se pudo preparar el PDF del acta');
  }
}

/** URL de descarga de una constancia (con permiso de capacitaciones o de actas). */
export async function getHseCertificateUrl(certificateId: string): Promise<ActionResult<HsePdfDelivery>> {
  if (!(await isModuleEnabled('hse'))) return fail('El módulo HSE no está disponible');
  const [canTrainings, canRecords] = await Promise.all([
    checkPermissionServer('hse', 'capacitaciones', 'view'),
    checkPermissionServer('hse', 'actas', 'view'),
  ]);
  if (!canTrainings && !canRecords) return fail(NO_PERMISSION);
  if (!UUID_RE.test(certificateId)) return fail('La constancia no existe');
  try {
    const result = await ensureCertificatePdf(certificateId);
    if (!result) return fail('La constancia no existe');
    if (!result.ok) return fail(result.error);
    return ok('url' in result ? { url: result.url } : { file: result.file });
  } catch (error) {
    logger.error('Error al preparar la constancia', { data: { error, certificateId } });
    return fail('No se pudo preparar la constancia');
  }
}

/** Anula una constancia firmada (con motivo): queda como historia y su documento del legajo se archiva. */
export async function voidHseCertificate(
  certificateId: string,
  input: { reason: string }
): Promise<ActionResult<null>> {
  const auth = await requireAuth('actas', 'delete');
  if (!auth.ok) return fail(auth.error);
  if (!UUID_RE.test(certificateId)) return fail('La constancia no existe');
  const parsed = hseVoidSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Explicá el motivo');
  try {
    await withActor(
      auth.credentialId,
      (tx) =>
        tx.$executeRaw`SELECT public.hse_void_certificate(${certificateId}::uuid, ${parsed.data.reason}, ${auth.profileId}::uuid)`
    );
    logger.info('Constancia HSE anulada', { data: { certificateId } });
    revalidateRecords();
    revalidatePath('/portal', 'layout');
    return ok(null);
  } catch (error) {
    logger.error('Error al anular la constancia', { data: { error, certificateId } });
    return fail('No se pudo anular la constancia');
  }
}

/**
 * Constancias de un empleado en una capacitación (vigentes y anuladas), para el diálogo de resultados del dashboard.
 * `canVoid`: si quien mira puede anularlas (lo decide el servidor, no el navegador).
 */
export async function fetchHseEmployeeCertificates(trainingId: string, employeeId: string) {
  if (!(await isModuleEnabled('hse'))) throw new Error('El módulo HSE no está disponible');
  if (!(await checkPermissionServer('hse', 'capacitaciones', 'view'))) throw new Error(NO_PERMISSION);
  if (!UUID_RE.test(trainingId) || !UUID_RE.test(employeeId)) throw new Error('La capacitación no existe');
  const [companyId, canVoid] = await Promise.all([
    getActiveCompanyId(),
    checkPermissionServer('hse', 'actas', 'delete'),
  ]);
  const rows = await prisma.hse_training_certificates.findMany({
    where: { training_id: trainingId, employee_id: employeeId, company_id: companyId },
    orderBy: { signed_at: 'desc' },
    select: {
      id: true,
      attempt_id: true,
      signed_at: true,
      valid_until: true,
      content_sha256: true,
      ip: true,
      employee_document_id: true,
      voided_at: true,
      void_reason: true,
    },
  });
  return {
    canVoid,
    certificates: rows.map((c) => ({
      id: c.id,
      attemptId: c.attempt_id,
      signedAt: c.signed_at,
      validUntil: c.valid_until ? c.valid_until.toISOString().slice(0, 10) : null,
      sha256: c.content_sha256,
      ip: c.ip,
      inEmployeeFile: c.employee_document_id !== null,
      voidedAt: c.voided_at,
      voidReason: c.void_reason,
    })),
  };
}
