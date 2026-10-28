import type { PrismaClient } from '@/generated/prisma/client';
import type { TenantContext, TenantTx } from '@/shared/lib/tenant-context';

/**
 * Capacitaciones HSE de prueba, armadas por el dueño de las tablas (sin RLS) pero PASANDO por los triggers guarda:
 * el contenido (material, preguntas, opciones, clave) solo se carga en borrador (`hse_training_content_guard`), así que
 * se crea en borrador, se completa y recién después se publica y se concilia, igual que desde el dashboard.
 */

export interface TestQuestion {
  id: string;
  points: number;
  correctOptionId: string;
  wrongOptionId: string;
}

export interface TestTraining {
  id: string;
  companyId: string;
  title: string;
  createdBy: string;
  passingScore?: number;
  maxAttempts?: number;
  timeLimitMinutes?: number | null;
  validityMonths?: number | null;
  questions: TestQuestion[];
  /** Materiales obligatorios (enlaces). */
  materialIds?: string[];
}

export async function createPublishedTraining(owner: PrismaClient, training: TestTraining): Promise<void> {
  await owner.hse_trainings.create({
    data: {
      id: training.id,
      company_id: training.companyId,
      title: training.title,
      passing_score: training.passingScore ?? 70,
      max_attempts: training.maxAttempts ?? 3,
      time_limit_minutes: training.timeLimitMinutes ?? null,
      validity_months: training.validityMonths ?? null,
      created_by: training.createdBy,
    },
  });
  const base = { company_id: training.companyId, training_id: training.id };
  await owner.hse_training_targets.create({ data: { ...base, kind: 'all' } });
  if (training.materialIds?.length) {
    await owner.hse_training_materials.createMany({
      data: training.materialIds.map((id, position) => ({
        ...base,
        id,
        kind: 'link' as const,
        title: `Material ${position + 1}`,
        url: `https://example.test/material-${position + 1}`,
        position,
      })),
    });
  }
  await owner.hse_training_questions.createMany({
    data: training.questions.map((q, position) => ({
      ...base,
      id: q.id,
      prompt: `Pregunta ${position + 1}`,
      points: q.points,
      position,
    })),
  });
  await owner.hse_training_options.createMany({
    data: training.questions.flatMap((q) => [
      { ...base, id: q.correctOptionId, question_id: q.id, label: 'Opción A', position: 0 },
      { ...base, id: q.wrongOptionId, question_id: q.id, label: 'Opción B', position: 1 },
    ]),
  });
  await owner.hse_training_answer_keys.createMany({
    data: training.questions.map((q) => ({ ...base, question_id: q.id, option_id: q.correctOptionId })),
  });
  await owner.hse_trainings.update({
    where: { id: training.id },
    data: { status: 'published', published_at: new Date(), published_by: training.createdBy },
  });
  await owner.$executeRaw`SELECT public.hse_sync_training_assignments(${training.companyId}::uuid)`;
}

/** Corre `fn` con un contexto explícito sobre el cliente BASE de la app (`alphataco_app`, con RLS). */
export async function asContext<T>(ctx: TenantContext, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
  const { prismaBase } = await import('@/shared/lib/prisma');
  const { runWithTenantContext } = await import('@/shared/lib/tenant-context');
  return runWithTenantContext(prismaBase, ctx, fn);
}

export const employeeContext = (companyId: string, employeeId: string, userId: string): TenantContext => ({
  companyId,
  userId,
  kind: 'employee',
  employeeId,
});

/** Llama una función SQL del examen (que devuelve jsonb) como el empleado del contexto. */
export async function callAsEmployee<T>(ctx: TenantContext, sql: (tx: TenantTx) => Promise<{ r: T }[]>): Promise<T> {
  const rows = await asContext(ctx, sql);
  return rows[0]!.r;
}

/**
 * Abre un intento cuyo tiempo YA venció (inicio y vencimiento en el pasado), sin esperar: el dueño prende
 * `app.hse_grading` en su transacción como lo hace `hse_start_attempt` (el trigger guarda solo deja abrir intentos así).
 */
export async function openExpiredAttempt(
  owner: PrismaClient,
  input: {
    attemptId: string;
    companyId: string;
    trainingId: string;
    employeeId: string;
    questionIds: string[];
    maxPoints: number;
  }
): Promise<void> {
  await owner.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.hse_grading', 'on', true)`;
    const assignment = await tx.hse_training_assignments.findFirstOrThrow({
      where: { training_id: input.trainingId, employee_id: input.employeeId },
      select: { id: true, attempts_total: true },
    });
    await tx.$executeRaw`
      INSERT INTO public.hse_training_attempts
        (id, company_id, training_id, assignment_id, employee_id, attempt_number, started_at, deadline_at, max_points,
         question_order)
      VALUES (${input.attemptId}::uuid, ${input.companyId}::uuid, ${input.trainingId}::uuid, ${assignment.id}::uuid,
              ${input.employeeId}::uuid, ${assignment.attempts_total + 1}, now() - interval '20 minutes',
              now() - interval '5 minutes', ${input.maxPoints}, ${input.questionIds}::uuid[])`;
    await tx.hse_training_assignments.update({
      where: { id: assignment.id },
      data: {
        status: 'in_progress',
        attempts_used: { increment: 1 },
        attempts_total: { increment: 1 },
        last_attempt_at: new Date(),
      },
    });
  });
}

export type StartAttemptResult = {
  ok: boolean;
  attemptId?: string;
  resumed?: boolean;
  reason?: string;
  pending?: number;
};

/** El empleado del contexto rinde y aprueba (todas bien) una capacitación sin material obligatorio. */
export async function passTraining(ctx: TenantContext, trainingId: string, questions: TestQuestion[]): Promise<string> {
  const started = await callAsEmployee<StartAttemptResult>(
    ctx,
    (tx) => tx.$queryRaw`SELECT public.hse_start_attempt(${trainingId}::uuid) AS r`
  );
  if (!started.ok || !started.attemptId) throw new Error(`No se pudo empezar el examen: ${started.reason}`);
  const attemptId = started.attemptId;
  await asContext(
    ctx,
    (tx) =>
      tx.$queryRaw`SELECT count(*)::int AS n
      FROM unnest(${questions.map((q) => q.id)}::uuid[], ${questions.map((q) => q.correctOptionId)}::uuid[]) AS x(q, o),
           LATERAL public.hse_save_answer(${attemptId}::uuid, x.q, x.o)`
  );
  await asContext(ctx, (tx) => tx.$queryRaw`SELECT public.hse_grade_attempt(${attemptId}::uuid) AS r`);
  return attemptId;
}
