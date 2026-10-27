import 'server-only';

import { HSE_FILES_BUCKET } from '@/features/Hse/lib/constants';
import { isHseEnabled } from '@/features/Hse/lib/feature-gate';
import { effectiveAssignmentStatus, toPercent } from '@/features/Hse/lib/training-status';
import type { PortalEmployee } from '@/features/Portal/actions/perimeter';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { prisma } from '@/shared/lib/prisma';
import { UUID_RE } from '@/shared/lib/storage-buckets';
import { buildStorageDownloadUrl, buildStorageFileUrl } from '@/shared/lib/storage-url';
import { cache } from 'react';

/**
 * Capacitaciones del empleado del portal (lecturas para Server Components; no son Server Actions).
 *
 * Doble cerco, como los documentos: cada consulta filtra por el legajo de la sesión y, aunque se olvidara, la RLS solo
 * devuelve SUS asignaciones, intentos y lecturas y el contenido de capacitaciones publicadas que le aplican. La clave
 * de respuestas no se consulta nunca acá (y la RLS no se la dejaría leer): los DTO se arman a mano, campo por campo.
 */

const dayOf = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

const ATTENTION_ORDER = { in_progress: 0, pending: 1, expired: 2, failed: 3, passed: 4 } as const;

/** Capacitaciones vigentes del empleado: lo que requiere acción primero. Vacío si HSE está apagado. */
export const getMyHseTrainings = cache(async (employee: PortalEmployee) => {
  if (!isHseEnabled()) return [];
  const today = argentinaDate();
  const rows = await prisma.hse_training_assignments.findMany({
    where: { employee_id: employee.employeeId, archived_at: null, training: { status: 'published' } },
    orderBy: { created_at: 'desc' },
    select: {
      status: true,
      attempts_used: true,
      last_score_percent: true,
      passed_at: true,
      valid_until: true,
      created_at: true,
      training: {
        select: {
          id: true,
          title: true,
          kind: true,
          max_attempts: true,
          time_limit_minutes: true,
          _count: { select: { questions: true } },
          materials: { where: { is_required: true }, select: { id: true } },
        },
      },
    },
  });
  const requiredIds = rows.flatMap((r) => r.training.materials.map((m) => m.id));
  const reads = requiredIds.length
    ? await prisma.hse_training_material_reads.findMany({
        where: { employee_id: employee.employeeId, material_id: { in: requiredIds } },
        select: { material_id: true },
      })
    : [];
  const readSet = new Set(reads.map((r) => r.material_id));

  return rows
    .map((r) => {
      const status = effectiveAssignmentStatus(r.status, dayOf(r.valid_until), today);
      const attemptsUsed = status === 'expired' ? 0 : r.attempts_used;
      return {
        trainingId: r.training.id,
        title: r.training.title,
        kind: r.training.kind,
        status,
        questions: r.training._count.questions,
        timeLimitMinutes: r.training.time_limit_minutes,
        attemptsLeft: Math.max(r.training.max_attempts - attemptsUsed, 0),
        maxAttempts: r.training.max_attempts,
        requiredMaterials: r.training.materials.length,
        requiredRead: r.training.materials.filter((m) => readSet.has(m.id)).length,
        lastScorePercent: toPercent(r.last_score_percent),
        passedAt: r.passed_at,
        validUntil: dayOf(r.valid_until),
        assignedAt: r.created_at,
      };
    })
    .sort((a, b) => ATTENTION_ORDER[a.status] - ATTENTION_ORDER[b.status]);
});
export type PortalHseTraining = Awaited<ReturnType<typeof getMyHseTrainings>>[number];

/** Detalle de una capacitación del empleado: material (con su lectura), intentos y si puede rendir. */
export async function getMyHseTraining(employee: PortalEmployee, trainingId: string) {
  if (!isHseEnabled() || !UUID_RE.test(trainingId)) return null;
  const today = argentinaDate();
  const assignment = await prisma.hse_training_assignments.findFirst({
    where: {
      training_id: trainingId,
      employee_id: employee.employeeId,
      archived_at: null,
      training: { status: 'published' },
    },
    select: {
      status: true,
      attempts_used: true,
      passed_at: true,
      valid_until: true,
      last_score_percent: true,
      training: {
        select: {
          id: true,
          title: true,
          description: true,
          kind: true,
          passing_score: true,
          max_attempts: true,
          time_limit_minutes: true,
          validity_months: true,
          _count: { select: { questions: true } },
          materials: {
            orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
            select: {
              id: true,
              kind: true,
              title: true,
              url: true,
              file_path: true,
              file_name: true,
              is_required: true,
            },
          },
        },
      },
    },
  });
  if (!assignment) return null;

  const [reads, attempts] = await Promise.all([
    prisma.hse_training_material_reads.findMany({
      where: { employee_id: employee.employeeId, training_id: trainingId },
      select: { material_id: true, read_at: true },
    }),
    prisma.hse_training_attempts.findMany({
      where: { employee_id: employee.employeeId, training_id: trainingId },
      orderBy: { attempt_number: 'desc' },
      select: {
        id: true,
        attempt_number: true,
        status: true,
        started_at: true,
        deadline_at: true,
        submitted_at: true,
        score_percent: true,
        passed: true,
      },
    }),
  ]);
  const readAt = new Map(reads.map((r) => [r.material_id, r.read_at]));
  const t = assignment.training;
  const status = effectiveAssignmentStatus(assignment.status, dayOf(assignment.valid_until), today);
  const attemptsUsed = status === 'expired' ? 0 : assignment.attempts_used;
  const materials = t.materials.map((m) => ({
    id: m.id,
    kind: m.kind,
    title: m.title,
    isRequired: m.is_required,
    readAt: readAt.get(m.id) ?? null,
    // Enlace externo (https, validado al cargarlo) o el PDF por el proxy de archivos con perímetro (nunca URL pública).
    url: m.kind === 'link' ? m.url : m.file_path ? buildStorageFileUrl(HSE_FILES_BUCKET, m.file_path) : null,
    downloadUrl: m.file_path ? buildStorageDownloadUrl(HSE_FILES_BUCKET, m.file_path) : null,
    fileName: m.file_name,
  }));
  const pendingMaterials = materials.filter((m) => m.isRequired && !m.readAt).length;
  // Abierto y todavía en tiempo: retomar. Uno vencido no se ofrece para retomar (al empezar, la base lo corrige y abre
  // otro, que consume un intento: eso pasa por la confirmación de "Rendir").
  const now = Date.now();
  const openAttempt =
    attempts.find((a) => a.status === 'in_progress' && (!a.deadline_at || a.deadline_at.getTime() > now)) ?? null;

  return {
    trainingId: t.id,
    title: t.title,
    description: t.description,
    kind: t.kind,
    passingScore: t.passing_score,
    maxAttempts: t.max_attempts,
    timeLimitMinutes: t.time_limit_minutes,
    validityMonths: t.validity_months,
    questions: t._count.questions,
    status,
    attemptsLeft: Math.max(t.max_attempts - attemptsUsed, 0),
    passedAt: assignment.passed_at,
    validUntil: dayOf(assignment.valid_until),
    materials,
    pendingMaterials,
    openAttemptId: openAttempt?.id ?? null,
    attempts: attempts.map((a) => ({
      id: a.id,
      number: a.attempt_number,
      status: a.status,
      startedAt: a.started_at,
      submittedAt: a.submitted_at,
      scorePercent: toPercent(a.score_percent),
      passed: a.passed,
    })),
  };
}
export type PortalHseTrainingDetail = NonNullable<Awaited<ReturnType<typeof getMyHseTraining>>>;

/** Un material del empleado (para la página del visor), o null si no le corresponde. */
export async function getMyHseMaterial(employee: PortalEmployee, trainingId: string, materialId: string) {
  const detail = await getMyHseTraining(employee, trainingId);
  if (!detail || !UUID_RE.test(materialId)) return null;
  const material = detail.materials.find((m) => m.id === materialId);
  return material ? { training: { id: detail.trainingId, title: detail.title }, material } : null;
}

/**
 * El examen abierto del empleado en una capacitación, listo para responder: preguntas en el orden del intento, con sus
 * opciones (id y texto) y lo que ya respondió. SIN la clave ni ninguna marca de correcta. El tiempo restante lo calcula
 * la base (`deadline_at - now()`): el reloj del navegador no decide nada.
 */
export async function getMyOpenHseExam(employee: PortalEmployee, trainingId: string) {
  if (!isHseEnabled() || !UUID_RE.test(trainingId)) return null;
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.hse_training_attempts.findFirst({
      where: { employee_id: employee.employeeId, training_id: trainingId, status: 'in_progress' },
      select: {
        id: true,
        attempt_number: true,
        question_order: true,
        deadline_at: true,
        training: { select: { title: true, status: true, passing_score: true } },
        answers: { select: { question_id: true, option_id: true } },
      },
    });
    if (!attempt || attempt.training.status !== 'published') return null;
    const [questions, clock] = await Promise.all([
      tx.hse_training_questions.findMany({
        where: { id: { in: attempt.question_order }, training_id: trainingId },
        select: {
          id: true,
          prompt: true,
          points: true,
          options: { orderBy: { position: 'asc' }, select: { id: true, label: true } },
        },
      }),
      tx.$queryRaw<{ seconds_left: number | null }[]>`
        SELECT CASE WHEN deadline_at IS NULL THEN NULL
                    ELSE GREATEST(0, floor(EXTRACT(EPOCH FROM (deadline_at - now()))))::int END AS seconds_left
        FROM public.hse_training_attempts WHERE id = ${attempt.id}::uuid`,
    ]);
    const byId = new Map(questions.map((q) => [q.id, q]));
    return {
      attemptId: attempt.id,
      attemptNumber: attempt.attempt_number,
      trainingId,
      trainingTitle: attempt.training.title,
      passingScore: attempt.training.passing_score,
      secondsLeft: clock[0]?.seconds_left ?? null,
      questions: attempt.question_order.flatMap((id) => {
        const q = byId.get(id);
        return q
          ? [
              {
                id: q.id,
                prompt: q.prompt,
                points: q.points,
                options: q.options.map((o) => ({ id: o.id, label: o.label })),
              },
            ]
          : [];
      }),
      answers: Object.fromEntries(attempt.answers.map((a) => [a.question_id, a.option_id])) as Record<string, string>,
    };
  });
}
export type PortalHseExam = NonNullable<Awaited<ReturnType<typeof getMyOpenHseExam>>>;

/** Resultado de un intento cerrado del empleado (sin detalle por pregunta: revelaría la clave). */
export async function getMyHseAttemptResult(employee: PortalEmployee, attemptId: string) {
  if (!isHseEnabled() || !UUID_RE.test(attemptId)) return null;
  const attempt = await prisma.hse_training_attempts.findFirst({
    where: { id: attemptId, employee_id: employee.employeeId, status: { not: 'in_progress' } },
    select: {
      id: true,
      attempt_number: true,
      status: true,
      submitted_at: true,
      score_points: true,
      max_points: true,
      score_percent: true,
      passed: true,
      training_id: true,
    },
  });
  if (!attempt) return null;
  return {
    attemptId: attempt.id,
    trainingId: attempt.training_id,
    number: attempt.attempt_number,
    status: attempt.status,
    submittedAt: attempt.submitted_at,
    scorePoints: attempt.score_points,
    maxPoints: attempt.max_points,
    scorePercent: toPercent(attempt.score_percent),
    passed: attempt.passed === true,
  };
}
export type PortalHseAttemptResult = NonNullable<Awaited<ReturnType<typeof getMyHseAttemptResult>>>;
