'use server';

import { errorMessage, fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { storageRemove, storageUpload } from '@/shared/lib/storage';
import { UUID_RE } from '@/shared/lib/storage-buckets';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { HSE_EXAM_LIMITS, HSE_FILES_BUCKET } from '../lib/constants';
import { isHseEnabled } from '../lib/feature-gate';
import { cleanFileName, hseMaterialPath, validatePdfUpload } from '../lib/pdf-file';
import type { HseTargetInput } from '../schemas/documents';
import {
  hseMaterialFileMetaSchema,
  hseMaterialLinkSchema,
  hseQuestionSchema,
  hseTrainingFormSchema,
  type HseMaterialLinkValues,
  type HseQuestionInput,
  type HseTrainingFormInput,
} from '../schemas/trainings';
import { syncHseTrainingAssignments } from '../use-cases/sync-acknowledgements';
import { getHseDocumentFormOptions } from './queries.server';

/**
 * Mutaciones de las capacitaciones HSE (dashboard). Cada una: módulo prendido, permiso de la acción, empresa de la
 * sesión (nunca del pedido) y transacción con el actor. La RLS repite empresa y permiso en la base, y los triggers
 * guarda congelan el examen al publicar (aunque una acción se olvidara de controlarlo).
 *
 * Ciclo: borrador (se arma material, preguntas, clave y destinatarios) → publicar (`approve`: el examen queda
 * congelado y se asigna) → retirar (`delete`: archiva, se conservan intentos y resultados). Un borrador se puede borrar.
 */

const logger = new Logger('features/Hse/trainings');

const NO_PERMISSION = 'No tenés permiso para hacer esto';
const NOT_FOUND = 'La capacitación no existe';
const NOT_DRAFT = 'Solo se modifica el examen y el material de un borrador';
const SESSION_EXPIRED = 'Tu sesión venció. Volvé a iniciar sesión.';

type TrainingAction = 'create' | 'update' | 'delete' | 'approve';
type Auth = { companyId: string; profileId: string; credentialId: string };

async function requireTrainings(action: TrainingAction): Promise<({ ok: true } & Auth) | { ok: false; error: string }> {
  if (!isHseEnabled()) return { ok: false, error: 'El módulo HSE no está disponible' };
  if (!(await checkPermissionServer('hse', 'capacitaciones', action))) return { ok: false, error: NO_PERMISSION };
  const [profile, companyId] = await Promise.all([getServerAuthProfile(), getActiveCompanyId()]);
  if (!profile) return { ok: false, error: SESSION_EXPIRED };
  return { ok: true, companyId, profileId: profile.id, credentialId: profile.credentialId };
}

function revalidateTraining(trainingId?: string) {
  revalidatePath('/dashboard/hse');
  if (trainingId) revalidatePath(`/dashboard/hse/trainings/${trainingId}`);
  revalidatePath('/portal', 'layout');
}

function friendlyError(error: unknown, fallback: string): string {
  const code = (error as { code?: string })?.code;
  if (code === 'P2002') return 'Otra persona acaba de modificar esta capacitación. Recargá la página.';
  return errorMessage(error, fallback);
}

function normalizeTargets(targets: HseTargetInput[]): HseTargetInput[] {
  if (targets.some((t) => t.kind === 'all')) return [{ kind: 'all' }];
  const seen = new Set<string>();
  return targets.filter((t) => {
    const key = `${t.kind}:${'refId' in t ? t.refId : ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Los puestos, sectores y empleados elegidos tienen que ser de la empresa activa: la FK sola no lo garantiza. */
async function assertTargetsInCompany(tx: Prisma.TransactionClient, companyId: string, targets: HseTargetInput[]) {
  const ids = (kind: HseTargetInput['kind']) =>
    targets.flatMap((t) => (t.kind !== 'all' && t.kind === kind ? [t.refId] : []));
  const [positions, sectors, employees] = [ids('position'), ids('sector'), ids('employee')];
  const [p, s, e] = await Promise.all([
    positions.length
      ? tx.company_positions.count({ where: { id: { in: positions }, company_id: companyId } })
      : Promise.resolve(0),
    sectors.length ? tx.hierarchy.count({ where: { id: { in: sectors }, company_id: companyId } }) : Promise.resolve(0),
    employees.length
      ? tx.employees.count({ where: { id: { in: employees }, company_id: companyId } })
      : Promise.resolve(0),
  ]);
  if (p !== positions.length || s !== sectors.length || e !== employees.length) {
    throw new Error('Alguno de los destinatarios no es de la empresa');
  }
}

function targetRows(companyId: string, trainingId: string, targets: HseTargetInput[]) {
  return targets.map((t) => ({
    company_id: companyId,
    training_id: trainingId,
    kind: t.kind,
    position_id: t.kind === 'position' ? t.refId : null,
    sector_id: t.kind === 'sector' ? t.refId : null,
    employee_id: t.kind === 'employee' ? t.refId : null,
  }));
}

const optionalNumber = (value: string) => (value === '' ? null : Number(value));

/** Capacitación de la empresa activa, bloqueada para esta transacción (dos ediciones no se pisan). */
async function lockTraining(tx: Prisma.TransactionClient, companyId: string, trainingId: string) {
  const rows = await tx.$queryRaw<{ status: 'draft' | 'published' | 'archived' }[]>`
    SELECT status FROM public.hse_trainings WHERE id = ${trainingId}::uuid AND company_id = ${companyId}::uuid FOR UPDATE`;
  const row = rows[0];
  if (!row) throw new Error(NOT_FOUND);
  return row.status;
}

// ============================================================================
// OPCIONES DEL FORMULARIO
// ============================================================================

/** Opciones de destinatarios (puestos, sectores y empleados con legajo), pedidas al abrir el formulario. */
export async function fetchHseTrainingFormOptions() {
  if (!isHseEnabled()) throw new Error('El módulo HSE no está disponible');
  const [canCreate, canUpdate] = await Promise.all([
    checkPermissionServer('hse', 'capacitaciones', 'create'),
    checkPermissionServer('hse', 'capacitaciones', 'update'),
  ]);
  if (!canCreate && !canUpdate) throw new Error('No tenés permiso para editar capacitaciones');
  const { positions, sectors, employees } = await getHseDocumentFormOptions();
  return { positions, sectors, employees };
}

// ============================================================================
// ALTA Y EDICIÓN
// ============================================================================

export async function createHseTraining(input: HseTrainingFormInput): Promise<ActionResult<{ id: string }>> {
  const auth = await requireTrainings('create');
  if (!auth.ok) return fail(auth.error);
  const parsed = hseTrainingFormSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Revisá los datos de la capacitación');
  const values = parsed.data;

  try {
    const id = randomUUID();
    const targets = normalizeTargets(values.targets);
    await withActor(auth.credentialId, async (tx) => {
      await assertTargetsInCompany(tx, auth.companyId, targets);
      await tx.hse_trainings.create({
        data: {
          id,
          company_id: auth.companyId,
          title: values.title,
          description: values.description || null,
          kind: values.kind,
          passing_score: values.passingScore,
          max_attempts: values.maxAttempts,
          time_limit_minutes: optionalNumber(values.timeLimitMinutes),
          shuffle_questions: values.shuffleQuestions,
          validity_months: optionalNumber(values.validityMonths),
          created_by: auth.profileId,
        },
        select: { id: true },
      });
      await tx.hse_training_targets.createMany({ data: targetRows(auth.companyId, id, targets) });
    });
    logger.info('Capacitación HSE creada', { data: { trainingId: id } });
    revalidateTraining(id);
    return ok({ id });
  } catch (error) {
    logger.error('Error al crear la capacitación HSE', { data: { error } });
    return fail(friendlyError(error, 'No se pudo crear la capacitación'));
  }
}

/**
 * Edita la capacitación. En borrador, todo. Publicada, solo los datos que no cambian la corrección (título,
 * descripción, tipo, vigencia de las aprobaciones futuras) y los destinatarios (se concilian las asignaciones). Los
 * destinatarios se reemplazan enteros: el formulario se arma desde el servidor con el estado real de ESTA capacitación.
 */
export async function updateHseTraining(
  trainingId: string,
  input: HseTrainingFormInput
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireTrainings('update');
  if (!auth.ok) return fail(auth.error);
  if (!UUID_RE.test(trainingId)) return fail(NOT_FOUND);
  const parsed = hseTrainingFormSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Revisá los datos de la capacitación');
  const values = parsed.data;

  try {
    const targets = normalizeTargets(values.targets);
    await withActor(auth.credentialId, async (tx) => {
      const status = await lockTraining(tx, auth.companyId, trainingId);
      if (status === 'archived') throw new Error('La capacitación está retirada: no se edita');
      await assertTargetsInCompany(tx, auth.companyId, targets);
      const examConfig =
        status === 'draft'
          ? {
              passing_score: values.passingScore,
              max_attempts: values.maxAttempts,
              time_limit_minutes: optionalNumber(values.timeLimitMinutes),
              shuffle_questions: values.shuffleQuestions,
            }
          : {};
      await tx.hse_trainings.update({
        where: { id: trainingId },
        data: {
          title: values.title,
          description: values.description || null,
          kind: values.kind,
          validity_months: optionalNumber(values.validityMonths),
          ...examConfig,
          updated_at: new Date(),
        },
        select: { id: true },
      });
      await tx.hse_training_targets.deleteMany({ where: { training_id: trainingId } });
      await tx.hse_training_targets.createMany({ data: targetRows(auth.companyId, trainingId, targets) });
      if (status === 'published') {
        await syncHseTrainingAssignments(tx, { companyId: auth.companyId, trainingId });
      }
    });
    logger.info('Capacitación HSE editada', { data: { trainingId } });
    revalidateTraining(trainingId);
    return ok({ id: trainingId });
  } catch (error) {
    logger.error('Error al editar la capacitación HSE', { data: { error, trainingId } });
    return fail(friendlyError(error, 'No se pudo guardar la capacitación'));
  }
}

// ============================================================================
// PUBLICAR, RETIRAR, BORRAR
// ============================================================================

/**
 * Publica el borrador: controla que el examen esté completo (preguntas con 2 a 6 opciones y su respuesta correcta) y
 * que tenga destinatarios; desde ese momento el examen queda congelado y se crean las asignaciones pendientes.
 */
export async function publishHseTraining(trainingId: string): Promise<ActionResult<{ assigned: number }>> {
  const auth = await requireTrainings('approve');
  if (!auth.ok) return fail(auth.error);
  if (!UUID_RE.test(trainingId)) return fail(NOT_FOUND);

  try {
    const assigned = await withActor(auth.credentialId, async (tx) => {
      const status = await lockTraining(tx, auth.companyId, trainingId);
      if (status !== 'draft') throw new Error('La capacitación ya está publicada o retirada');
      const [targets, questions] = await Promise.all([
        tx.hse_training_targets.count({ where: { training_id: trainingId } }),
        tx.hse_training_questions.findMany({
          where: { training_id: trainingId },
          select: { id: true, _count: { select: { options: true } }, answer_key: { select: { option_id: true } } },
        }),
      ]);
      if (targets === 0) throw new Error('Elegí a quién aplica antes de publicar');
      if (questions.length === 0) throw new Error('Agregá al menos una pregunta al examen');
      const incomplete = questions.filter(
        (q) =>
          !q.answer_key ||
          q._count.options < HSE_EXAM_LIMITS.minOptions ||
          q._count.options > HSE_EXAM_LIMITS.maxOptions
      ).length;
      if (incomplete > 0) {
        throw new Error(`Hay ${incomplete} pregunta(s) sin opciones suficientes o sin respuesta correcta`);
      }
      const now = new Date();
      const updated = await tx.hse_trainings.updateMany({
        where: { id: trainingId, status: 'draft' },
        data: { status: 'published', published_at: now, published_by: auth.profileId, updated_at: now },
      });
      if (updated.count !== 1) throw new Error('La capacitación ya está publicada o retirada');
      await syncHseTrainingAssignments(tx, { companyId: auth.companyId, trainingId });
      return tx.hse_training_assignments.count({ where: { training_id: trainingId, archived_at: null } });
    });
    logger.info('Capacitación HSE publicada', { data: { trainingId, assigned } });
    revalidateTraining(trainingId);
    return ok({ assigned });
  } catch (error) {
    logger.error('Error al publicar la capacitación HSE', { data: { error, trainingId } });
    return fail(friendlyError(error, 'No se pudo publicar la capacitación'));
  }
}

/** Retira una capacitación publicada: sale del portal y se conserva todo (intentos, resultados, material). */
export async function archiveHseTraining(trainingId: string): Promise<ActionResult<null>> {
  const auth = await requireTrainings('delete');
  if (!auth.ok) return fail(auth.error);
  if (!UUID_RE.test(trainingId)) return fail(NOT_FOUND);
  try {
    const updated = await withActor(auth.credentialId, (tx) =>
      tx.hse_trainings.updateMany({
        where: { id: trainingId, company_id: auth.companyId, status: 'published' },
        data: { status: 'archived', archived_at: new Date(), archived_by: auth.profileId, updated_at: new Date() },
      })
    );
    if (updated.count !== 1) return fail('La capacitación no existe o no está publicada');
    logger.info('Capacitación HSE retirada', { data: { trainingId } });
    revalidateTraining(trainingId);
    return ok(null);
  } catch (error) {
    logger.error('Error al retirar la capacitación HSE', { data: { error, trainingId } });
    return fail('No se pudo retirar la capacitación');
  }
}

/** Borra un BORRADOR (nadie lo vio ni lo rindió) con su material, preguntas y destinatarios. */
export async function deleteHseTrainingDraft(trainingId: string): Promise<ActionResult<null>> {
  const auth = await requireTrainings('delete');
  if (!auth.ok) return fail(auth.error);
  if (!UUID_RE.test(trainingId)) return fail(NOT_FOUND);
  try {
    const paths = await withActor(auth.credentialId, async (tx) => {
      const status = await lockTraining(tx, auth.companyId, trainingId);
      if (status !== 'draft') throw new Error('Solo se borra un borrador: una publicada se retira');
      const files = await tx.hse_training_materials.findMany({
        where: { training_id: trainingId, file_path: { not: null } },
        select: { file_path: true },
      });
      await tx.hse_trainings.delete({ where: { id: trainingId }, select: { id: true } });
      return files.flatMap((f) => (f.file_path ? [f.file_path] : []));
    });
    if (paths.length > 0) await storageRemove(HSE_FILES_BUCKET, paths);
    logger.info('Borrador de capacitación HSE borrado', { data: { trainingId } });
    revalidateTraining();
    return ok(null);
  } catch (error) {
    logger.error('Error al borrar el borrador de capacitación', { data: { error, trainingId } });
    return fail(friendlyError(error, 'No se pudo borrar la capacitación'));
  }
}

// ============================================================================
// MATERIAL (solo en borrador)
// ============================================================================

async function nextMaterialPosition(tx: Prisma.TransactionClient, trainingId: string) {
  const last = await tx.hse_training_materials.aggregate({
    where: { training_id: trainingId },
    _max: { position: true },
  });
  return (last._max.position ?? -1) + 1;
}

/** FormData `{ payload: JSON { title, isRequired }, file: PDF }`. */
export async function addHseTrainingMaterialFile(
  trainingId: string,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireTrainings('update');
  if (!auth.ok) return fail(auth.error);
  if (!UUID_RE.test(trainingId)) return fail(NOT_FOUND);
  const raw = formData.get('payload');
  const meta = hseMaterialFileMetaSchema.safeParse(typeof raw === 'string' ? JSON.parse(raw) : null);
  if (!meta.success) return fail(meta.error.issues[0]?.message ?? 'Revisá los datos del material');
  const pdf = await validatePdfUpload(formData.get('file'));
  if (!pdf.ok) return fail(pdf.error);

  const id = randomUUID();
  const path = hseMaterialPath(auth.companyId, trainingId, id);
  const uploaded = await storageUpload(HSE_FILES_BUCKET, path, pdf.file);
  if (!uploaded.ok) return fail('No se pudo subir el PDF. Intentá de nuevo.');
  try {
    await withActor(auth.credentialId, async (tx) => {
      const status = await lockTraining(tx, auth.companyId, trainingId);
      if (status !== 'draft') throw new Error(NOT_DRAFT);
      await tx.hse_training_materials.create({
        data: {
          id,
          company_id: auth.companyId,
          training_id: trainingId,
          kind: 'file',
          title: meta.data.title,
          file_path: path,
          file_name: cleanFileName(pdf.file.name),
          file_size: pdf.size,
          file_sha256: pdf.sha256,
          is_required: meta.data.isRequired,
          position: await nextMaterialPosition(tx, trainingId),
        },
        select: { id: true },
      });
    });
    revalidateTraining(trainingId);
    return ok({ id });
  } catch (error) {
    await storageRemove(HSE_FILES_BUCKET, [path]);
    logger.error('Error al agregar el material', { data: { error, trainingId } });
    return fail(friendlyError(error, 'No se pudo agregar el material'));
  }
}

export async function addHseTrainingMaterialLink(
  trainingId: string,
  input: HseMaterialLinkValues
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireTrainings('update');
  if (!auth.ok) return fail(auth.error);
  if (!UUID_RE.test(trainingId)) return fail(NOT_FOUND);
  const parsed = hseMaterialLinkSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Revisá el enlace');
  try {
    const id = await withActor(auth.credentialId, async (tx) => {
      const status = await lockTraining(tx, auth.companyId, trainingId);
      if (status !== 'draft') throw new Error(NOT_DRAFT);
      const row = await tx.hse_training_materials.create({
        data: {
          company_id: auth.companyId,
          training_id: trainingId,
          kind: 'link',
          title: parsed.data.title,
          url: parsed.data.url,
          is_required: parsed.data.isRequired,
          position: await nextMaterialPosition(tx, trainingId),
        },
        select: { id: true },
      });
      return row.id;
    });
    revalidateTraining(trainingId);
    return ok({ id });
  } catch (error) {
    logger.error('Error al agregar el enlace', { data: { error, trainingId } });
    return fail(friendlyError(error, 'No se pudo agregar el enlace'));
  }
}

export async function deleteHseTrainingMaterial(materialId: string): Promise<ActionResult<null>> {
  const auth = await requireTrainings('update');
  if (!auth.ok) return fail(auth.error);
  if (!UUID_RE.test(materialId)) return fail('El material no existe');
  try {
    const removed = await withActor(auth.credentialId, async (tx) => {
      const material = await tx.hse_training_materials.findFirst({
        where: { id: materialId, company_id: auth.companyId },
        select: { training_id: true, file_path: true },
      });
      if (!material) throw new Error('El material no existe');
      const status = await lockTraining(tx, auth.companyId, material.training_id);
      if (status !== 'draft') throw new Error(NOT_DRAFT);
      await tx.hse_training_materials.delete({ where: { id: materialId }, select: { id: true } });
      return material;
    });
    if (removed.file_path) await storageRemove(HSE_FILES_BUCKET, [removed.file_path]);
    revalidateTraining(removed.training_id);
    return ok(null);
  } catch (error) {
    logger.error('Error al quitar el material', { data: { error, materialId } });
    return fail(friendlyError(error, 'No se pudo quitar el material'));
  }
}

// ============================================================================
// PREGUNTAS (solo en borrador)
// ============================================================================

/**
 * Crea o reemplaza una pregunta con sus opciones y su clave, en una transacción. Las opciones se recrean enteras: en
 * borrador nadie respondió todavía, y así la clave apunta siempre a una opción de ESA pregunta (FK compuesta).
 */
export async function saveHseTrainingQuestion(
  trainingId: string,
  questionId: string | null,
  input: HseQuestionInput
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireTrainings('update');
  if (!auth.ok) return fail(auth.error);
  if (!UUID_RE.test(trainingId) || (questionId !== null && !UUID_RE.test(questionId))) return fail(NOT_FOUND);
  const parsed = hseQuestionSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Revisá la pregunta');
  const values = parsed.data;

  try {
    const id = await withActor(auth.credentialId, async (tx) => {
      const status = await lockTraining(tx, auth.companyId, trainingId);
      if (status !== 'draft') throw new Error(NOT_DRAFT);
      let id = questionId;
      if (id) {
        const updated = await tx.hse_training_questions.updateMany({
          where: { id, training_id: trainingId, company_id: auth.companyId },
          data: { prompt: values.prompt, points: values.points },
        });
        if (updated.count !== 1) throw new Error('La pregunta no existe');
        await tx.hse_training_options.deleteMany({ where: { question_id: id } });
      } else {
        const count = await tx.hse_training_questions.count({ where: { training_id: trainingId } });
        if (count >= HSE_EXAM_LIMITS.maxQuestions) throw new Error(`Hasta ${HSE_EXAM_LIMITS.maxQuestions} preguntas`);
        const last = await tx.hse_training_questions.aggregate({
          where: { training_id: trainingId },
          _max: { position: true },
        });
        const created = await tx.hse_training_questions.create({
          data: {
            company_id: auth.companyId,
            training_id: trainingId,
            prompt: values.prompt,
            points: values.points,
            position: (last._max.position ?? -1) + 1,
          },
          select: { id: true },
        });
        id = created.id;
      }
      const optionIds = values.options.map(() => randomUUID());
      await tx.hse_training_options.createMany({
        data: values.options.map((o, index) => ({
          id: optionIds[index],
          company_id: auth.companyId,
          training_id: trainingId,
          question_id: id as string,
          label: o.label,
          position: index,
        })),
      });
      await tx.hse_training_answer_keys.create({
        data: {
          question_id: id,
          company_id: auth.companyId,
          training_id: trainingId,
          option_id: optionIds[values.correctIndex] as string,
        },
        select: { question_id: true },
      });
      return id;
    });
    revalidateTraining(trainingId);
    return ok({ id });
  } catch (error) {
    logger.error('Error al guardar la pregunta', { data: { error, trainingId } });
    return fail(friendlyError(error, 'No se pudo guardar la pregunta'));
  }
}

export async function deleteHseTrainingQuestion(questionId: string): Promise<ActionResult<null>> {
  const auth = await requireTrainings('update');
  if (!auth.ok) return fail(auth.error);
  if (!UUID_RE.test(questionId)) return fail('La pregunta no existe');
  try {
    const trainingId = await withActor(auth.credentialId, async (tx) => {
      const question = await tx.hse_training_questions.findFirst({
        where: { id: questionId, company_id: auth.companyId },
        select: { training_id: true },
      });
      if (!question) throw new Error('La pregunta no existe');
      const status = await lockTraining(tx, auth.companyId, question.training_id);
      if (status !== 'draft') throw new Error(NOT_DRAFT);
      await tx.hse_training_questions.delete({ where: { id: questionId }, select: { id: true } });
      return question.training_id;
    });
    revalidateTraining(trainingId);
    return ok(null);
  } catch (error) {
    logger.error('Error al borrar la pregunta', { data: { error, questionId } });
    return fail(friendlyError(error, 'No se pudo borrar la pregunta'));
  }
}

// ============================================================================
// RESULTADOS POR EMPLEADO (lectura con permiso)
// ============================================================================

/**
 * Intentos de un empleado en una capacitación, con el detalle por pregunta (correcta o no) que SOLO ve el dashboard
 * con permiso: se cruza con la clave en el servidor. Para el diálogo "Resultados" del cumplimiento.
 */
export async function fetchHseEmployeeTrainingAttempts(trainingId: string, employeeId: string) {
  if (!isHseEnabled()) throw new Error('El módulo HSE no está disponible');
  if (!(await checkPermissionServer('hse', 'capacitaciones', 'view'))) throw new Error(NO_PERMISSION);
  if (!UUID_RE.test(trainingId) || !UUID_RE.test(employeeId)) throw new Error(NOT_FOUND);
  const companyId = await getActiveCompanyId();
  const [attempts, keys, questions] = await Promise.all([
    prisma.hse_training_attempts.findMany({
      where: { training_id: trainingId, employee_id: employeeId, company_id: companyId },
      orderBy: { attempt_number: 'desc' },
      select: {
        id: true,
        attempt_number: true,
        status: true,
        started_at: true,
        deadline_at: true,
        submitted_at: true,
        score_points: true,
        max_points: true,
        score_percent: true,
        passed: true,
        answers: { select: { question_id: true, option_id: true } },
      },
    }),
    prisma.hse_training_answer_keys.findMany({
      where: { training_id: trainingId, company_id: companyId },
      select: { question_id: true, option_id: true },
    }),
    prisma.hse_training_questions.findMany({
      where: { training_id: trainingId, company_id: companyId },
      orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
      select: { id: true, prompt: true, points: true },
    }),
  ]);
  const keyByQuestion = new Map(keys.map((k) => [k.question_id, k.option_id]));
  return attempts.map((a) => {
    const answered = new Map(a.answers.map((x) => [x.question_id, x.option_id]));
    return {
      id: a.id,
      number: a.attempt_number,
      status: a.status,
      startedAt: a.started_at,
      deadlineAt: a.deadline_at,
      submittedAt: a.submitted_at,
      scorePoints: a.score_points,
      maxPoints: a.max_points,
      scorePercent: a.score_percent ? a.score_percent.toNumber() : null,
      passed: a.passed,
      questions:
        a.status === 'in_progress'
          ? []
          : questions.map((q) => ({
              id: q.id,
              prompt: q.prompt,
              points: q.points,
              result: !answered.has(q.id)
                ? ('unanswered' as const)
                : answered.get(q.id) === keyByQuestion.get(q.id)
                  ? ('correct' as const)
                  : ('wrong' as const),
            })),
    };
  });
}
export type HseEmployeeTrainingAttempt = Awaited<ReturnType<typeof fetchHseEmployeeTrainingAttempts>>[number];
