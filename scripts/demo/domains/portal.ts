/**
 * Portal de empleados en la demo: el usuario demo (`demo@alphataco.com`) entra TAMBIÉN al portal, como el chofer del
 * legajo 1006, y encuentra contenido HSE variado.
 *
 * Corre DESPUÉS de `seedUsers` y `seedHse` (usa los legajos, el perfil del admin y las capacitaciones y documentos
 * HSE ya cargados) y no usa el azar de la demo (`ctx.faker`): todo lo de este legajo es fijo, así los dominios que
 * siguen no cambian. El reset borra todo cada noche (el vínculo `profile.employee_id` lo pone en NULL el borrado y el
 * acceso al portal es una tabla de negocio), así que se vuelve a armar en cada corrida, sin mails:
 *   - Vínculo del perfil con el legajo y acceso al portal con la cuenta existente (`existing_account`, sin credencial
 *     nueva ni invitación), con su evento de auditoría.
 *   - 3 capacitaciones con examen y material: «Uso de matafuegos» (de todos) aprobada y con la constancia firmada; dos
 *     dirigidas solo a este legajo: «Uso de EPP en operaciones de campo» aprobada y por vencer (vence en 12 días) y
 *     «Carga y descarga segura», publicada hace 6 días con un intento desaprobado y 2 intentos disponibles.
 *   - 2 documentos HSE: la Política de SySO aceptada y el Procedimiento de manejo defensivo (v2) pendiente.
 *   - Avisos de vencimiento (misma forma que el job `hse-expiry`, sin correo) de lo que vence en 30 días.
 * Los exámenes se rinden con las MISMAS funciones del portal y después se corren las fechas al pasado sin triggers,
 * como el resto de la demo.
 */
import { POSITIONS } from '../data/catalog.ts';
import { withoutTriggers, type Ctx } from '../lib/ctx.ts';
import { demoId } from '../lib/ids.ts';
import type { DemoEmployee } from './employees.ts';
import { asAdmin, asEmployee, createTrainingContent, signCertificate, type DemoTraining } from './hse.ts';

/** Legajo del chofer que el usuario demo ve en el portal (Isabel Reyna Alva, Chofer, Operaciones). */
export const PORTAL_EMPLOYEE_FILE = '1006';

const IP = '190.12.34.56';
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 14) Portal demo';

type KeyByQuestion = Map<string, { correct: string; wrong: string[] }>;

interface PortalTraining extends DemoTraining {
  /** Intentos que rinde el legajo, en orden (`true` = aprobado). */
  attempts: boolean[];
  /** Días atrás del último intento (si no se fija el vencimiento). */
  attemptDaysAgo: number;
  /** La aprobación vence dentro de N días (y se rindió «vencimiento − vigencia»). */
  validInDays?: number;
}

const trainingsFor = (employeeId: string): PortalTraining[] => [
  {
    key: 'portal-epp',
    title: 'Uso de EPP en operaciones de campo',
    kind: 'induction',
    description:
      'Elementos de protección personal para choferes y ayudantes: qué usar al bajar en locación, cuándo reemplazarlos y cómo se registra la entrega.',
    targets: [{ kind: 'employee', employeeId }],
    publishedDaysAgo: 380,
    passingScore: 70,
    maxAttempts: 3,
    timeLimitMinutes: null,
    validityMonths: 12,
    materials: [
      { title: 'Instructivo de EPP para choferes', kind: 'file', required: true },
      {
        title: 'SRT — Prevención de riesgos laborales',
        kind: 'link',
        url: 'https://www.argentina.gob.ar/srt/prevencion',
        required: false,
      },
    ],
    questions: [
      {
        prompt: '¿Qué EPP es obligatorio al bajar del camión en una locación petrolera?',
        points: 2,
        options: [
          'Casco, anteojos de seguridad, botines con puntera y ropa ignífuga',
          'Solo el chaleco reflectivo',
          'Ninguno si la parada dura menos de 10 minutos',
        ],
        correct: 0,
      },
      {
        prompt: 'Si un guante está roto o impregnado de hidrocarburo:',
        points: 1,
        options: ['Se sigue usando hasta terminar el turno', 'Se reemplaza y se avisa al supervisor', 'Se lava con gasoil'],
        correct: 1,
      },
      {
        prompt: '¿Cuándo hay que usar protección auditiva?',
        points: 1,
        options: [
          'Cerca de compresores, bombas o motores en marcha (más de 85 dB)',
          'Solo dentro del taller',
          'Nunca, porque impide escuchar las alarmas',
        ],
        correct: 0,
      },
      {
        prompt: '¿Quién provee el EPP y cómo se registra la entrega?',
        points: 1,
        options: [
          'Lo compra cada trabajador',
          'Lo presta el cliente de la locación',
          'La empresa, con la planilla de entrega firmada por el trabajador',
        ],
        correct: 2,
      },
    ],
    passedShare: 0,
    exhaustedShare: 0,
    attempts: [true],
    attemptDaysAgo: 0,
    validInDays: 12,
  },
  {
    key: 'portal-carga',
    title: 'Carga y descarga segura',
    kind: 'specific',
    description:
      'Maniobras con hidrogrúa y autoelevador, estiba y sujeción de la carga en batea, y roles del chofer y del ayudante durante el izaje.',
    targets: [{ kind: 'employee', employeeId }],
    publishedDaysAgo: 6,
    passingScore: 80,
    maxAttempts: 3,
    timeLimitMinutes: 20,
    validityMonths: 24,
    materials: [
      { title: 'Procedimiento de izaje con hidrogrúa', kind: 'file', required: true },
      {
        title: 'CNRT — Transporte de cargas',
        kind: 'link',
        url: 'https://www.argentina.gob.ar/transporte/cnrt',
        required: false,
      },
    ],
    questions: [
      {
        prompt: 'Antes de operar la hidrogrúa, ¿qué se verifica primero?',
        points: 2,
        options: [
          'Estabilizadores apoyados en terreno firme y el área de giro despejada',
          'El nivel de combustible',
          'Que el cliente esté presente',
        ],
        correct: 0,
      },
      {
        prompt: 'Una eslinga con hilos cortados o deformada:',
        points: 1,
        options: ['Se usa solo para cargas livianas', 'Se retira de servicio y se informa', 'Se refuerza con alambre'],
        correct: 1,
      },
      {
        prompt: '¿Dónde se ubica el ayudante durante el izaje?',
        points: 1,
        options: [
          'Debajo de la carga para guiarla con las manos',
          'Arriba de la batea',
          'Fuera del radio de giro, guiando con cuerda o señales',
        ],
        correct: 2,
      },
      {
        prompt: 'La carga en la batea tiene que quedar:',
        points: 1,
        options: [
          'Sujeta con cintas o cadenas y con el peso repartido sobre los ejes',
          'Suelta si el viaje es corto',
          'Concentrada en la parte trasera',
        ],
        correct: 0,
      },
    ],
    passedShare: 0,
    exhaustedShare: 0,
    attempts: [false],
    attemptDaysAgo: 2,
  },
];

/** Rinde un intento como el empleado con las funciones del portal. Aprobado: todo bien; desaprobado: solo la primera. */
async function takeAttempt(
  ctx: Ctx,
  employeeId: string,
  trainingId: string,
  keyByQuestion: KeyByQuestion,
  pass: boolean
): Promise<string> {
  const { tx } = ctx;
  await asEmployee(ctx, employeeId);
  const materials = await tx.hse_training_materials.findMany({
    where: { training_id: trainingId },
    select: { id: true },
    orderBy: { position: 'asc' },
  });
  for (const material of materials) {
    await tx.$executeRaw`SELECT public.hse_mark_material_read(${material.id}::uuid)`;
  }
  const started = await tx.$queryRaw<{ r: { ok: boolean; attemptId?: string } }[]>`
    SELECT public.hse_start_attempt(${trainingId}::uuid) AS r`;
  const attemptId = started[0]?.r.attemptId;
  if (!attemptId) throw new Error(`Portal demo: no se pudo iniciar el intento (${JSON.stringify(started[0]?.r)})`);
  let first = true;
  for (const [questionId, options] of keyByQuestion) {
    const optionId = pass || first ? options.correct : (options.wrong[0] as string);
    first = false;
    await tx.$queryRaw`SELECT public.hse_save_answer(${attemptId}::uuid, ${questionId}::uuid, ${optionId}::uuid)`;
  }
  const graded = await tx.$queryRaw<{ r: { passed?: boolean } }[]>`
    SELECT public.hse_grade_attempt(${attemptId}::uuid) AS r`;
  if (graded[0]?.r.passed !== pass) {
    throw new Error(`Portal demo: la corrección no dio lo esperado (${JSON.stringify(graded[0]?.r)})`);
  }
  return attemptId;
}

/** Corre al pasado (sin triggers: un intento cerrado es inmutable) las fechas del intento y de la asignación. */
async function backdateAttempt(
  ctx: Ctx,
  input: {
    trainingId: string;
    employeeId: string;
    attemptId: string;
    submittedAt: Date;
    timeLimitMinutes: number | null;
    pass: boolean;
    validUntil: string | null;
  }
): Promise<void> {
  const { tx } = ctx;
  const startedAt = new Date(input.submittedAt.getTime() - 9 * 60_000);
  await withoutTriggers(tx, async () => {
    await tx.hse_training_attempts.update({
      where: { id: input.attemptId },
      data: {
        started_at: startedAt,
        submitted_at: input.submittedAt,
        deadline_at: input.timeLimitMinutes ? new Date(startedAt.getTime() + input.timeLimitMinutes * 60_000) : null,
      },
      select: { id: true },
    });
    await tx.hse_training_answers.updateMany({
      where: { attempt_id: input.attemptId },
      data: { answered_at: new Date(input.submittedAt.getTime() - 60_000) },
    });
    await tx.hse_training_material_reads.updateMany({
      where: { training_id: input.trainingId, employee_id: input.employeeId },
      data: { read_at: new Date(startedAt.getTime() - 25 * 60_000) },
    });
    await tx.hse_training_assignments.updateMany({
      where: { training_id: input.trainingId, employee_id: input.employeeId },
      data: input.pass
        ? {
            last_attempt_at: startedAt,
            passed_at: input.submittedAt,
            valid_until: input.validUntil ? new Date(`${input.validUntil}T00:00:00Z`) : null,
          }
        : { last_attempt_at: startedAt },
    });
  });
}

/** `YYYY-MM-DD` + `months` meses (la misma cuenta de vigencia que `hse_grade_attempt`). */
function addMonths(ymd: string, months: number): string {
  const date = new Date(`${ymd}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

async function seedPortalTrainings(ctx: Ctx, employeeId: string): Promise<void> {
  const { tx, company, cal } = ctx;
  for (const t of trainingsFor(employeeId)) {
    const trainingId = demoId('hse-training', t.key);
    await asAdmin(ctx);
    const keyByQuestion = await createTrainingContent(ctx, t);
    await tx.hse_trainings.update({
      where: { id: trainingId },
      data: { status: 'published', published_at: cal.at(-(t.publishedDaysAgo ?? 0), 10), published_by: ctx.actorId },
      select: { id: true },
    });
    await tx.$executeRaw`SELECT public.hse_sync_training_assignments(${company.id}::uuid, ${trainingId}::uuid, NULL::uuid)`;

    for (const pass of t.attempts) {
      const attemptId = await takeAttempt(ctx, employeeId, trainingId, keyByQuestion, pass);
      let submittedAt: Date;
      let validUntil: string | null = null;
      if (pass && t.validInDays !== undefined && t.validityMonths) {
        validUntil = cal.ymd(t.validInDays);
        submittedAt = cal.at(cal.offsetOf(addMonths(validUntil, -t.validityMonths)), 11, 20);
      } else {
        submittedAt = cal.at(-t.attemptDaysAgo, 15, 40);
        validUntil = pass && t.validityMonths ? addMonths(cal.ymd(-t.attemptDaysAgo), t.validityMonths) : null;
      }
      await backdateAttempt(ctx, {
        trainingId,
        employeeId,
        attemptId,
        submittedAt,
        timeLimitMinutes: t.timeLimitMinutes,
        pass,
        validUntil,
      });
    }
  }
}

/** «Uso de matafuegos» (de todos): aprobada por este legajo y con la constancia firmada. */
async function ensureFireExtinguisherPassed(ctx: Ctx, employeeId: string): Promise<void> {
  const { tx, cal } = ctx;
  const trainingId = demoId('hse-training', 'matafuegos');
  const [training, assignment] = await Promise.all([
    tx.hse_trainings.findUnique({
      where: { id: trainingId },
      select: { max_attempts: true, validity_months: true, time_limit_minutes: true },
    }),
    tx.hse_training_assignments.findFirst({
      where: { training_id: trainingId, employee_id: employeeId, archived_at: null },
      select: { status: true, attempts_used: true, passed_attempt_id: true },
    }),
  ]);
  if (!training || !assignment) {
    ctx.log('portal demo: el legajo no tiene asignada «Uso de matafuegos»; se omite');
    return;
  }
  let passedAttemptId = assignment.passed_attempt_id;
  if (assignment.status !== 'passed' && assignment.attempts_used < training.max_attempts) {
    const questions = await tx.hse_training_questions.findMany({
      where: { training_id: trainingId },
      orderBy: { position: 'asc' },
      select: { id: true, answer_key: { select: { option_id: true } } },
    });
    const keyByQuestion: KeyByQuestion = new Map(
      questions.map((q) => [q.id, { correct: q.answer_key?.option_id ?? '', wrong: [] }])
    );
    passedAttemptId = await takeAttempt(ctx, employeeId, trainingId, keyByQuestion, true);
    const submittedAt = cal.at(-8, 10, 30);
    await backdateAttempt(ctx, {
      trainingId,
      employeeId,
      attemptId: passedAttemptId,
      submittedAt,
      timeLimitMinutes: training.time_limit_minutes,
      pass: true,
      validUntil: training.validity_months ? addMonths(cal.ymd(-8), training.validity_months) : null,
    });
  }
  if (passedAttemptId) await signCertificate(ctx, employeeId, passedAttemptId, 90);
  else ctx.log('portal demo: el legajo agotó los intentos de «Uso de matafuegos»; sin constancia');
}

/** Política de SySO aceptada y Procedimiento de manejo defensivo (v2) pendiente, para este legajo. */
async function seedPortalDocuments(ctx: Ctx, employee: DemoEmployee, positionName: string): Promise<void> {
  const { tx, cal } = ctx;
  const current = (key: string) =>
    tx.hse_document_acknowledgements.findFirst({
      where: { document_id: demoId('hse-document', key), employee_id: employee.id, archived_at: null },
      orderBy: { created_at: 'desc' },
      select: { id: true, status: true },
    });
  const [policy, procedure] = await Promise.all([current('politica-syso'), current('manejo-defensivo')]);
  await withoutTriggers(tx, async () => {
    if (policy && policy.status !== 'accepted') {
      await tx.hse_document_acknowledgements.update({
        where: { id: policy.id },
        data: {
          status: 'accepted',
          responded_at: cal.at(-20, 9, 15),
          reject_reason: null,
          signer_name: `${employee.lastname} ${employee.firstname}`,
          signer_position: positionName,
          signer_file: employee.file,
          ip: IP,
          user_agent: USER_AGENT,
        },
        select: { id: true },
      });
    }
    if (procedure && procedure.status !== 'pending') {
      await tx.hse_document_acknowledgements.update({
        where: { id: procedure.id },
        data: {
          status: 'pending',
          responded_at: null,
          reject_reason: null,
          signer_name: null,
          signer_position: null,
          signer_file: null,
          file_sha256: null,
          ip: null,
          user_agent: null,
        },
        select: { id: true },
      });
    }
  });
  if (!policy || !procedure) {
    ctx.log(`portal demo: documentos HSE del legajo incompletos (política: ${!!policy}, procedimiento: ${!!procedure})`);
  }
}

/** Avisos de vencimiento de lo aprobado que vence en 30 días o ya venció (sin correo, como el job sin SMTP). */
async function seedPortalNotices(ctx: Ctx, employeeId: string): Promise<void> {
  const { tx, company, cal } = ctx;
  const due = await tx.hse_training_assignments.findMany({
    where: {
      employee_id: employeeId,
      archived_at: null,
      status: 'passed',
      valid_until: { not: null, lte: cal.day(30) },
      training: { status: 'published' },
    },
    select: { training_id: true, valid_until: true, training: { select: { title: true } } },
  });
  await tx.hse_expiry_notices.createMany({
    data: due.map((a) => ({
      company_id: company.id,
      employee_id: employeeId,
      item_kind: 'training' as const,
      item_id: a.training_id,
      item_title: a.training.title,
      due_on: a.valid_until as Date,
      window: (a.valid_until as Date) < cal.day(0) ? ('expired' as const) : ('upcoming' as const),
      email_to: null,
      email_status: 'none',
    })),
    skipDuplicates: true,
  });
}

export async function seedDemoPortal(ctx: Ctx, employees: DemoEmployee[]): Promise<void> {
  const { tx, company, actorId } = ctx;
  const employee = employees.find((e) => e.file === PORTAL_EMPLOYEE_FILE && e.active && e.position === 'chofer');
  if (!employee) {
    // No aborta el reset (la demo entera quedaría la de ayer): solo se omite el portal y queda en el log.
    ctx.log(`portal demo: el legajo ${PORTAL_EMPLOYEE_FILE} no es un chofer activo; se omite el portal`);
    return;
  }
  const profile = await tx.profile.findUnique({ where: { id: actorId }, select: { id: true, credential_id: true } });
  const taken = await tx.profile.findFirst({
    where: { employee_id: employee.id, id: { not: actorId } },
    select: { email: true },
  });
  if (!profile?.credential_id || taken) {
    ctx.log(`portal demo: sin credencial del admin o legajo tomado por ${taken?.email ?? '-'}; se omite el portal`);
    return;
  }

  await asAdmin(ctx);
  await tx.profile.update({ where: { id: profile.id }, data: { employee_id: employee.id }, select: { id: true } });
  await tx.employee_portal_access.create({
    data: {
      company_id: company.id,
      employee_id: employee.id,
      credential_id: profile.credential_id,
      status: 'enabled',
      method: 'existing_account',
      created_credential: false,
      granted_by: profile.id,
      granted_at: ctx.cal.at(-30, 9),
    },
    select: { id: true },
  });
  await tx.employee_portal_access_events.create({
    data: {
      company_id: company.id,
      employee_id: employee.id,
      action: 'enabled',
      performed_by: profile.id,
      detail: 'Cuenta existente del usuario demo',
      created_at: ctx.cal.at(-30, 9),
    },
    select: { id: true },
  });

  await seedPortalTrainings(ctx, employee.id);
  await ensureFireExtinguisherPassed(ctx, employee.id);
  await seedPortalDocuments(ctx, employee, POSITIONS.find((p) => p.key === employee.position)?.name ?? 'Chofer');
  await seedPortalNotices(ctx, employee.id);

  // Mismo contexto en el que deja la transacción `seedHse`.
  await tx.$executeRaw`SELECT set_config('app.company_id', ${company.id}, true), set_config('app.employee_id', '', true), set_config('app.actor_kind', '', true), set_config('app.user_id', '', true)`;
  ctx.log(
    `portal demo: ${employee.lastname} ${employee.firstname} (legajo ${employee.file}) vinculado al usuario demo con portal habilitado`
  );
}
