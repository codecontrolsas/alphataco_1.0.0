import type { PortalEmployee } from '@/features/Portal/actions/perimeter';
import type { PrismaClient } from '@/generated/prisma/client';
import type { TenantContext } from '@/shared/lib/tenant-context';
import { ensureCity } from '@/test/db-fixtures';
import {
  asContext,
  callAsEmployee,
  createPublishedTraining,
  employeeContext,
  openExpiredAttempt,
  type TestQuestion,
} from '@/test/hse-fixtures';
import {
  createTestEmployee,
  createTestUser,
  dropCatalogRows,
  dropTestUsers,
  emptyCatalogRows,
  grantPermissions,
} from '@/test/permission-fixtures';
import { RUN_RLS, assertAppRoleConnection, connectAsAppRoles, createTestCompany } from '@/test/rls-roles';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Capacitaciones y exámenes HSE (ticket 804, fase 3) bajo el rol REAL de la app (`alphataco_app`), con dos empresas.
 *
 * La corrección vive en la base (`hse_grade_attempt`, una sola regla para el envío y para el job de vencidos): se
 * prueban sus límites exactos (sin redondeo), la idempotencia, que un intento cerrado no cambia, el máximo de
 * intentos, un solo intento abierto, el tiempo medido con el reloj de la base y el material obligatorio leído antes de
 * rendir. La clave de respuestas no la lee el empleado (RLS) y ningún DTO del portal la arrastra. Los tiempos vencidos
 * se fabrican con fechas en el pasado (sin esperas).
 *
 * Corre con `scripts/test-rls.sh`.
 */
const state = vi.hoisted(() => ({ ctx: null as TenantContext | null }));

vi.mock('next/cache', () => ({
  cacheTag: () => undefined,
  cacheLife: () => undefined,
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
  updateTag: () => undefined,
}));
vi.mock('@/shared/lib/tenant-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/tenant-db')>()),
  getTenantContextOrNull: async () => state.ctx,
}));

const COMPANY_A = '7e000000-0000-4000-8000-00000000000a';
const COMPANY_B = '7e000000-0000-4000-8000-00000000000b';
const HSE_USER = '7e000000-0000-4000-8000-0000000001aa';
const E1_USER = '7e000000-0000-4000-8000-0000000001e1';
const E2_USER = '7e000000-0000-4000-8000-0000000001e2';
const E3_USER = '7e000000-0000-4000-8000-0000000001e3';
const E1 = '7e000000-0000-4000-8000-0000000002e1';
const E2 = '7e000000-0000-4000-8000-0000000002e2';
const E3 = '7e000000-0000-4000-8000-0000000002e3';
const MATERIAL = '7e000000-0000-4000-8000-000000000301';

const T_EXACT = '7e000000-0000-4000-8000-000000000401';
const T_ROUND = '7e000000-0000-4000-8000-000000000402';
const T_TIMED = '7e000000-0000-4000-8000-000000000403';
const T_OTHER = '7e000000-0000-4000-8000-000000000404';
const EXPIRED_1 = '7e000000-0000-4000-8000-000000000501';
const EXPIRED_2 = '7e000000-0000-4000-8000-000000000502';

const uuid = (group: number, index: number) =>
  `7e000000-0000-4000-${(8100 + group).toString()}-${index.toString().padStart(12, '0')}`;
const question = (group: number, index: number, points: number): TestQuestion => ({
  id: uuid(group, index),
  points,
  correctOptionId: uuid(group + 10, index),
  wrongOptionId: uuid(group + 20, index),
});

/** 7 + 3 puntos: responder solo la primera es EXACTAMENTE el 70 % (límite inclusivo). */
const EXACT_QUESTIONS = [question(1, 1, 7), question(1, 2, 3)];
/**
 * 99 + 1 + 199×100 = 20 000 puntos. Responder bien la de 99 y 139 de las de 100 da 13 999 puntos: 69,995 %, que
 * redondeado a dos decimales se ve «70,00» pero NO alcanza el 70 % exacto.
 */
const ROUND_QUESTIONS = [
  question(2, 0, 99),
  question(2, 1, 1),
  ...Array.from({ length: 199 }, (_, i) => question(2, i + 2, 100)),
];
const TIMED_QUESTIONS = [question(3, 1, 10)];

let owner: PrismaClient;
const catalog = emptyCatalogRows();
const ctx1 = employeeContext(COMPANY_A, E1, E1_USER);
const ctx2 = employeeContext(COMPANY_A, E2, E2_USER);

type StartResult = { ok: boolean; attemptId?: string; resumed?: boolean; reason?: string; pending?: number };
type GradeResult = {
  status: string;
  scorePoints: number;
  maxPoints: number;
  scorePercent: number;
  passed: boolean;
  alreadyClosed: boolean;
};

const start = (ctx: TenantContext, trainingId: string) =>
  callAsEmployee<StartResult>(ctx, (tx) => tx.$queryRaw`SELECT public.hse_start_attempt(${trainingId}::uuid) AS r`);
const grade = (ctx: TenantContext, attemptId: string) =>
  callAsEmployee<GradeResult>(ctx, (tx) => tx.$queryRaw`SELECT public.hse_grade_attempt(${attemptId}::uuid) AS r`);
const answer = (ctx: TenantContext, attemptId: string, questionId: string, optionId: string) =>
  callAsEmployee<{ ok: boolean; reason?: string }>(
    ctx,
    (tx) => tx.$queryRaw`SELECT public.hse_save_answer(${attemptId}::uuid, ${questionId}::uuid, ${optionId}::uuid) AS r`
  );

function portalEmployee(employeeId: string, userId: string): PortalEmployee {
  return {
    userId,
    companyId: COMPANY_A,
    companyName: 'Empresa',
    employeeId,
    file: null,
    firstname: 'Empleado',
    lastname: 'Prueba',
    position: null,
    sector: null,
    picture: null,
    email: null,
    admissionDate: null,
    access: { method: 'temporary_password', grantedAt: new Date() },
    needsPasswordChange: false,
  };
}

/** Todas las claves de un objeto (a cualquier profundidad): para buscar campos que delaten la clave. */
function deepKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(deepKeys);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.entries(value).flatMap(([key, inner]) => [key, ...deepKeys(inner)]);
  }
  return [];
}
const KEY_LEAK = /correct|answer_?key|key_?of/i;

async function cleanup(): Promise<void> {
  const companies = [COMPANY_A, COMPANY_B];
  await owner.jobs_runs.deleteMany({ where: { job: 'hse-expired-attempts', run_key: { contains: '2099-01-01T' } } });
  // Solo los padres: el borrado en cascada de una capacitación publicada no pasa por las guardas de contenido.
  await owner.hse_trainings.deleteMany({ where: { company_id: { in: companies } } });
  await owner.employees.deleteMany({ where: { company_id: { in: companies } } });
  await dropTestUsers(owner, [HSE_USER, E1_USER, E2_USER, E3_USER]);
  await owner.company.deleteMany({ where: { id: { in: companies } } });
}

describe.skipIf(!RUN_RLS)('capacitaciones y exámenes HSE bajo RLS (rol alphataco_app)', () => {
  beforeAll(async () => {
    owner = connectAsAppRoles();
    await assertAppRoleConnection();
    await cleanup();
    const city = await ensureCity(owner);
    await createTestCompany(owner, {
      id: COMPANY_A,
      name: '__rls_hse_cap_A__',
      cuit: 'RLS-HSE-CAP-A',
      cityId: city.id,
    });
    await createTestCompany(owner, {
      id: COMPANY_B,
      name: '__rls_hse_cap_B__',
      cuit: 'RLS-HSE-CAP-B',
      cityId: city.id,
    });
    await createTestEmployee(owner, {
      id: E1,
      companyId: COMPANY_A,
      seed: 7201,
      lastname: 'Uno',
      firstname: 'Empleado',
    });
    await createTestEmployee(owner, {
      id: E2,
      companyId: COMPANY_A,
      seed: 7202,
      lastname: 'Dos',
      firstname: 'Empleado',
    });
    await createTestEmployee(owner, {
      id: E3,
      companyId: COMPANY_B,
      seed: 7203,
      lastname: 'Tres',
      firstname: 'Empleado',
    });
    await createTestUser(owner, { id: HSE_USER, email: 'hse@rls-hse-cap.test', fullname: 'Responsable HSE' });
    await owner.share_company_users.create({ data: { company_id: COMPANY_A, profile_id: HSE_USER } });
    await grantPermissions(owner, catalog, {
      userId: HSE_USER,
      companyId: COMPANY_A,
      keys: ['hse:capacitaciones:view'],
    });
    await createTestUser(owner, { id: E1_USER, email: 'e1@rls-hse-cap.test', fullname: 'Uno', employeeId: E1 });
    await createTestUser(owner, { id: E2_USER, email: 'e2@rls-hse-cap.test', fullname: 'Dos', employeeId: E2 });
    await createTestUser(owner, { id: E3_USER, email: 'e3@rls-hse-cap.test', fullname: 'Tres', employeeId: E3 });

    const common = { companyId: COMPANY_A, createdBy: HSE_USER };
    await createPublishedTraining(owner, {
      ...common,
      id: T_EXACT,
      title: 'Exacto',
      passingScore: 70,
      maxAttempts: 2,
      validityMonths: 12,
      questions: EXACT_QUESTIONS,
      materialIds: [MATERIAL],
    });
    await createPublishedTraining(owner, {
      ...common,
      id: T_ROUND,
      title: 'Redondeo',
      passingScore: 70,
      maxAttempts: 1,
      questions: ROUND_QUESTIONS,
    });
    await createPublishedTraining(owner, {
      ...common,
      id: T_TIMED,
      title: 'Con tiempo',
      passingScore: 50,
      maxAttempts: 5,
      timeLimitMinutes: 5,
      questions: TIMED_QUESTIONS,
    });
    await createPublishedTraining(owner, {
      companyId: COMPANY_B,
      createdBy: HSE_USER,
      id: T_OTHER,
      title: 'Otra empresa',
      questions: [question(4, 1, 1)],
    });
  }, 120_000);

  afterAll(async () => {
    await cleanup();
    await dropCatalogRows(owner, catalog);
    await owner.$disconnect();
  });

  it('la clave de respuestas no la lee el empleado (sí el dashboard con permiso); preguntas y opciones sí', async () => {
    await expect(asContext(ctx1, (tx) => tx.hse_training_answer_keys.count())).resolves.toBe(0);
    const questions = await asContext(ctx1, (tx) =>
      tx.hse_training_questions.findMany({ where: { training_id: T_EXACT }, select: { id: true, answer_key: true } })
    );
    expect(questions).toHaveLength(2);
    expect(questions.every((q) => q.answer_key === null)).toBe(true);
    const options = await asContext(ctx1, (tx) =>
      tx.hse_training_options.findMany({ where: { training_id: T_EXACT }, select: { id: true, key_of: true } })
    );
    expect(options).toHaveLength(4);
    expect(options.every((o) => o.key_of === null)).toBe(true);

    const hse = { companyId: COMPANY_A, userId: HSE_USER, kind: 'user' as const };
    await expect(
      asContext(hse, (tx) => tx.hse_training_answer_keys.count({ where: { training_id: T_EXACT } }))
    ).resolves.toBe(2);
    // Otra empresa: ni la capacitación.
    await expect(asContext(ctx1, (tx) => tx.hse_trainings.count({ where: { id: T_OTHER } }))).resolves.toBe(0);
  });

  it('el empleado no escribe intentos ni resultados directo (solo por las funciones del examen)', async () => {
    await expect(
      asContext(ctx1, (tx) =>
        tx.hse_training_assignments.updateMany({ where: { employee_id: E1 }, data: { status: 'passed' } })
      )
    ).resolves.toEqual({ count: 0 });
    await expect(
      asContext(
        ctx1,
        (tx) =>
          tx.$executeRaw`INSERT INTO public.hse_training_attempts (company_id, training_id, assignment_id, employee_id, attempt_number, max_points, question_order)
          SELECT company_id, training_id, id, employee_id, 99, 1, ARRAY[]::uuid[] FROM public.hse_training_assignments WHERE employee_id = ${E1}::uuid LIMIT 1`
      )
    ).rejects.toThrow();
  });

  it('no se rinde sin leer el material obligatorio; leído, abre UN intento con el tiempo de la base', async () => {
    await expect(start(ctx1, T_EXACT)).resolves.toEqual({ ok: false, reason: 'materials_pending', pending: 1 });
    await asContext(ctx1, (tx) => tx.$executeRaw`SELECT public.hse_mark_material_read(${MATERIAL}::uuid)`);
    // Idempotente: la segunda lectura no duplica.
    await asContext(ctx1, (tx) => tx.$executeRaw`SELECT public.hse_mark_material_read(${MATERIAL}::uuid)`);
    await expect(owner.hse_training_material_reads.count({ where: { employee_id: E1 } })).resolves.toBe(1);

    const first = await start(ctx1, T_EXACT);
    expect(first).toMatchObject({ ok: true, resumed: false });
    // Un solo intento abierto: volver a empezar retoma el mismo.
    await expect(start(ctx1, T_EXACT)).resolves.toEqual({ ok: true, attemptId: first.attemptId, resumed: true });
    await expect(owner.hse_training_attempts.count({ where: { employee_id: E1, training_id: T_EXACT } })).resolves.toBe(
      1
    );

    // Otra empresa: el empleado de B no rinde la de A.
    await expect(start(employeeContext(COMPANY_B, E3, E3_USER), T_EXACT)).resolves.toEqual({
      ok: false,
      reason: 'not_available',
    });
  });

  it('los DTO del examen y del resultado del portal no llevan la clave ni ninguna marca de correcta', async () => {
    const { getMyOpenHseExam, getMyHseTraining, getMyHseAttemptResult } = await import(
      '@/features/Portal/actions/hse-trainings.queries'
    );
    state.ctx = ctx1;
    const exam = await getMyOpenHseExam(portalEmployee(E1, E1_USER), T_EXACT);
    expect(exam).not.toBeNull();
    expect(Object.keys(exam!).sort()).toEqual(
      [
        'answers',
        'attemptId',
        'attemptNumber',
        'passingScore',
        'questions',
        'secondsLeft',
        'trainingId',
        'trainingTitle',
      ].sort()
    );
    for (const q of exam!.questions) {
      expect(Object.keys(q).sort()).toEqual(['id', 'options', 'points', 'prompt']);
      for (const option of q.options) expect(Object.keys(option).sort()).toEqual(['id', 'label']);
    }
    // El tiempo restante lo calcula la base; la capacitación no tiene límite.
    expect(exam!.secondsLeft).toBeNull();

    const detail = await getMyHseTraining(portalEmployee(E1, E1_USER), T_EXACT);
    expect(deepKeys(detail).filter((key) => KEY_LEAK.test(key))).toEqual([]);
    expect(deepKeys(exam).filter((key) => KEY_LEAK.test(key))).toEqual([]);

    // Antes de cerrar no hay resultado.
    await expect(getMyHseAttemptResult(portalEmployee(E1, E1_USER), exam!.attemptId)).resolves.toBeNull();
    state.ctx = null;
  });

  it('70 % exacto aprueba (límite inclusivo); la corrección es idempotente y el intento cerrado no cambia', async () => {
    const { attemptId } = await start(ctx1, T_EXACT);
    const [q1, q2] = EXACT_QUESTIONS;
    await expect(answer(ctx1, attemptId!, q1!.id, q1!.wrongOptionId)).resolves.toEqual({ ok: true });
    // Cambiar la opción antes de enviar vale: queda la última.
    await expect(answer(ctx1, attemptId!, q1!.id, q1!.correctOptionId)).resolves.toEqual({ ok: true });
    await expect(answer(ctx1, attemptId!, q2!.id, q2!.wrongOptionId)).resolves.toEqual({ ok: true });

    const result = await grade(ctx1, attemptId!);
    expect(result).toEqual({
      status: 'submitted',
      scorePoints: 7,
      maxPoints: 10,
      scorePercent: 70,
      passed: true,
      alreadyClosed: false,
    });
    const assignment = await owner.hse_training_assignments.findFirstOrThrow({
      where: { employee_id: E1, training_id: T_EXACT },
      select: { status: true, passed_attempt_id: true, valid_until: true, attempts_used: true },
    });
    expect(assignment).toMatchObject({ status: 'passed', passed_attempt_id: attemptId, attempts_used: 1 });
    expect(assignment.valid_until).not.toBeNull();

    // Idempotente: segunda corrección = mismo resultado, sin tocar nada.
    const snapshot = await owner.hse_training_attempts.findUniqueOrThrow({ where: { id: attemptId! } });
    await expect(grade(ctx1, attemptId!)).resolves.toEqual({ ...result, alreadyClosed: true });
    await expect(owner.hse_training_attempts.findUniqueOrThrow({ where: { id: attemptId! } })).resolves.toEqual(
      snapshot
    );

    // Cerrado: no se responde más, ni el dueño de las tablas lo modifica.
    await expect(answer(ctx1, attemptId!, q2!.id, q2!.correctOptionId)).resolves.toEqual({
      ok: false,
      reason: 'closed',
    });
    await expect(
      owner.hse_training_attempts.update({ where: { id: attemptId! }, data: { passed: false } })
    ).rejects.toThrow(/cerrado no se modifica/);
    await expect(
      owner.hse_training_answers.updateMany({
        where: { attempt_id: attemptId! },
        data: { option_id: q2!.correctOptionId },
      })
    ).rejects.toThrow(/cerrado/);
    // Ni el resultado de la asignación fuera de las funciones del examen.
    await expect(
      owner.hse_training_assignments.updateMany({
        where: { employee_id: E1, training_id: T_EXACT },
        data: { status: 'failed' },
      })
    ).rejects.toThrow(/lo calcula solo el examen/);

    // Aprobada y vigente: no se vuelve a rendir.
    await expect(start(ctx1, T_EXACT)).resolves.toEqual({ ok: false, reason: 'already_passed' });

    const { getMyHseAttemptResult } = await import('@/features/Portal/actions/hse-trainings.queries');
    state.ctx = ctx1;
    const dto = await getMyHseAttemptResult(portalEmployee(E1, E1_USER), attemptId!);
    expect(Object.keys(dto!).sort()).toEqual(
      [
        'attemptId',
        'maxPoints',
        'number',
        'passed',
        'scorePercent',
        'scorePoints',
        'status',
        'submittedAt',
        'trainingId',
      ].sort()
    );
    expect(dto).toMatchObject({ passed: true, scorePercent: 70 });
    // Un intento ajeno no se ve.
    state.ctx = ctx2;
    await expect(getMyHseAttemptResult(portalEmployee(E2, E2_USER), attemptId!)).resolves.toBeNull();
    state.ctx = null;
  });

  it('sin redondeo: 69,995 % se muestra 70,00 pero NO aprueba', async () => {
    const { attemptId } = await start(ctx1, T_ROUND);
    const correct = [ROUND_QUESTIONS[0]!, ...ROUND_QUESTIONS.slice(2, 141)];
    expect(correct.reduce((sum, q) => sum + q.points, 0)).toBe(13_999);
    await asContext(
      ctx1,
      (tx) =>
        tx.$queryRaw`SELECT count(*)::int AS n
        FROM unnest(${correct.map((q) => q.id)}::uuid[], ${correct.map((q) => q.correctOptionId)}::uuid[]) AS x(q, o),
             LATERAL public.hse_save_answer(${attemptId}::uuid, x.q, x.o)`
    );
    const result = await grade(ctx1, attemptId!);
    expect(result).toMatchObject({ scorePoints: 13_999, maxPoints: 20_000, scorePercent: 70, passed: false });
    await expect(
      owner.hse_training_assignments.findFirstOrThrow({
        where: { employee_id: E1, training_id: T_ROUND },
        select: { status: true },
      })
    ).resolves.toEqual({ status: 'failed' });
  });

  it('máximo de intentos: agotados, la asignación queda desaprobada y no abre otro', async () => {
    await asContext(ctx2, (tx) => tx.$executeRaw`SELECT public.hse_mark_material_read(${MATERIAL}::uuid)`);
    const first = await start(ctx2, T_EXACT);
    await expect(grade(ctx2, first.attemptId!)).resolves.toMatchObject({ passed: false, scorePoints: 0 });
    await expect(
      owner.hse_training_assignments.findFirstOrThrow({
        where: { employee_id: E2, training_id: T_EXACT },
        select: { status: true },
      })
    ).resolves.toEqual({ status: 'pending' });
    const second = await start(ctx2, T_EXACT);
    expect(second).toMatchObject({ ok: true, resumed: false });
    await grade(ctx2, second.attemptId!);
    await expect(
      owner.hse_training_assignments.findFirstOrThrow({
        where: { employee_id: E2, training_id: T_EXACT },
        select: { status: true },
      })
    ).resolves.toEqual({ status: 'failed' });
    await expect(start(ctx2, T_EXACT)).resolves.toEqual({ ok: false, reason: 'no_attempts_left' });
    // Y otro empleado no cierra un intento ajeno en tiempo.
    const own = await start(ctx1, T_TIMED);
    await expect(grade(ctx2, own.attemptId!)).rejects.toThrow(/solo el empleado/);
    await grade(ctx1, own.attemptId!);
  });

  it('el tiempo lo mide la base: el vencimiento es inicio + límite y un intento vencido no admite respuestas', async () => {
    const opened = await owner.hse_training_attempts.findFirstOrThrow({
      where: { employee_id: E1, training_id: T_TIMED },
      select: { started_at: true, deadline_at: true },
    });
    expect(opened.deadline_at!.getTime() - opened.started_at.getTime()).toBe(5 * 60_000);

    await openExpiredAttempt(owner, {
      attemptId: EXPIRED_1,
      companyId: COMPANY_A,
      trainingId: T_TIMED,
      employeeId: E1,
      questionIds: TIMED_QUESTIONS.map((q) => q.id),
      maxPoints: 10,
    });
    const [q] = TIMED_QUESTIONS;
    await expect(answer(ctx1, EXPIRED_1, q!.id, q!.correctOptionId)).resolves.toEqual({ ok: false, reason: 'expired' });
    const closed = await owner.hse_training_attempts.findUniqueOrThrow({
      where: { id: EXPIRED_1 },
      select: { status: true, submitted_at: true, deadline_at: true, score_points: true },
    });
    // Se corrige con lo respondido hasta el vencimiento y con la hora del vencimiento, no la de ahora.
    expect(closed).toEqual({
      status: 'expired',
      submitted_at: closed.deadline_at,
      deadline_at: closed.deadline_at,
      score_points: 0,
    });
  });

  it('job hse-expired-attempts: cierra los vencidos con la misma corrección y es idempotente', async () => {
    await openExpiredAttempt(owner, {
      attemptId: EXPIRED_2,
      companyId: COMPANY_A,
      trainingId: T_TIMED,
      employeeId: E1,
      questionIds: TIMED_QUESTIONS.map((q) => q.id),
      maxPoints: 10,
    });
    const { runHseExpiredAttemptsJob } = await import('@/features/Jobs/jobs/hse-expired-attempts');
    const first = await runHseExpiredAttemptsJob({ now: new Date('2099-01-01T15:00:00Z') });
    expect(first.units.find((u) => u.companyId === COMPANY_A)).toMatchObject({ status: 'ok', metadata: { closed: 1 } });
    await expect(
      owner.hse_training_attempts.findUniqueOrThrow({
        where: { id: EXPIRED_2 },
        select: { status: true, passed: true },
      })
    ).resolves.toEqual({ status: 'expired', passed: false });

    // Misma hora: la corrida ya está hecha. Otra hora: la función no vuelve a tocar lo cerrado.
    const same = await runHseExpiredAttemptsJob({ now: new Date('2099-01-01T15:30:00Z') });
    expect(same.units.find((u) => u.companyId === COMPANY_A)?.status).not.toBe('ok');
    const next = await runHseExpiredAttemptsJob({ now: new Date('2099-01-01T16:00:00Z') });
    expect(next.units.find((u) => u.companyId === COMPANY_A)).toMatchObject({ status: 'ok', metadata: { closed: 0 } });

    // La función rechaza otra empresa que la del contexto.
    await expect(
      asContext(
        { companyId: COMPANY_B, userId: null, kind: 'job' },
        (tx) => tx.$queryRaw`SELECT public.hse_close_expired_attempts(${COMPANY_A}::uuid)`
      )
    ).rejects.toThrow(/no es la del contexto/);
  });

  it('al publicar, el examen queda congelado: ni la configuración ni el contenido cambian', async () => {
    await expect(owner.hse_trainings.update({ where: { id: T_EXACT }, data: { passing_score: 50 } })).rejects.toThrow(
      /no se modifica/
    );
    await expect(
      owner.hse_training_questions.create({
        data: { company_id: COMPANY_A, training_id: T_EXACT, prompt: 'Nueva', points: 1 },
      })
    ).rejects.toThrow(/no se modifica/);
    await expect(
      owner.hse_training_answer_keys.updateMany({
        where: { training_id: T_EXACT },
        data: { option_id: EXACT_QUESTIONS[0]!.wrongOptionId },
      })
    ).rejects.toThrow(/no se modifica/);
    await expect(owner.hse_trainings.update({ where: { id: T_EXACT }, data: { status: 'draft' } })).rejects.toThrow(
      /borrador/
    );
  });
});
