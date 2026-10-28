/**
 * HSE (ticket 804, fase 2): tipos de documento, documentos con versiones y destinatarios, y las aceptaciones del portal.
 *
 * Quién tiene que aceptar qué lo calcula la MISMA función que usa la app (`hse_sync_acknowledgements`): acá solo se
 * cargan los documentos y después se responde una parte de las aceptaciones con fechas relativas a hoy.
 *   - Política de SySO: a todos, v1, ~75% aceptado, algunos rechazos.
 *   - Manejo defensivo: a choferes, v2 publicada hace pocos días (la v1 aceptada queda como historia).
 *   - EPP en taller: al sector Mantenimiento, v1, ~50% aceptado.
 *   - Trabajo en altura: borrador (no lo ve nadie).
 * Capacitaciones (fase 3): matafuegos (a todos, con límite de tiempo), manejo en ruta (choferes), primeros auxilios
 * (publicada hace más de un año) y un borrador, con intentos aprobados, desaprobados y sin intentos rendidos con las
 * funciones reales del examen.
 * Avisos de vencimiento (job `hse-expiry`, ventana de 30 días): una aprobación de primeros auxilios vence en 10 días y
 * otra venció hace 5, y el instructivo de EPP vence en 15 días; así el job tiene qué avisar cualquier día que se corra.
 * Actas y constancias (fase 4): capacitadores habituales, un acta CERRADA de matafuegos (con firmas antes y después
 * del cierre) y un acta en borrador de manejo en ruta, todo con las funciones reales (firma y cierre). Los PDF y el
 * registro en el legajo se generan en la primera descarga, como en producción.
 * Ids deterministas: los links a un documento sobreviven al reset.
 */
import { createHash } from 'node:crypto';
import { POSITIONS } from '../data/catalog.ts';
import { addPdf, withoutTriggers, type Ctx } from '../lib/ctx.ts';
import { demoId } from '../lib/ids.ts';
import type { DemoEmployee } from './employees.ts';

const HSE_BUCKET = 'hse-files';

type Target = { kind: 'all' } | { kind: 'position'; positionKey: string } | { kind: 'sector'; sectorKey: string };

interface DemoHseDoc {
  key: string;
  title: string;
  type: string;
  description: string;
  targets: Target[];
  /** Versiones publicadas: días atrás de cada publicación (la última es la vigente). Vacío = borrador. */
  publishedDaysAgo: number[];
  /** Fracción de destinatarios que aceptó la versión vigente. */
  acceptedShare: number;
  rejectedShare: number;
  expiresInDays?: number;
}

const TYPES = ['Política', 'Procedimiento', 'Instructivo'];

const DOCS: DemoHseDoc[] = [
  {
    key: 'politica-syso',
    title: 'Política de Seguridad y Salud Ocupacional',
    type: 'Política',
    description: 'Compromisos de la empresa y de cada persona con la seguridad, la salud y el ambiente.',
    targets: [{ kind: 'all' }],
    publishedDaysAgo: [40],
    acceptedShare: 0.75,
    rejectedShare: 0.03,
    expiresInDays: 325,
  },
  {
    key: 'manejo-defensivo',
    title: 'Procedimiento de manejo defensivo',
    type: 'Procedimiento',
    description: 'Velocidades máximas, descansos, uso del celular y conducta ante fauna en ruta.',
    targets: [{ kind: 'position', positionKey: 'chofer' }],
    publishedDaysAgo: [120, 4],
    acceptedShare: 0.3,
    rejectedShare: 0,
    expiresInDays: 245,
  },
  {
    key: 'epp-taller',
    title: 'Instructivo de uso de EPP en taller',
    type: 'Instructivo',
    description: 'Protección auditiva, ocular y de manos según la tarea; recambio y guarda de los elementos.',
    targets: [{ kind: 'sector', sectorKey: 'mantenimiento' }],
    publishedDaysAgo: [15],
    acceptedShare: 0.5,
    rejectedShare: 0,
    // Vence dentro de la ventana de avisos (30 días): el job `hse-expiry` lo avisa a los del sector.
    expiresInDays: 15,
  },
  {
    key: 'trabajo-altura',
    title: 'Procedimiento de trabajo en altura',
    type: 'Procedimiento',
    description: 'Borrador en revisión: arnés, línea de vida y permiso de trabajo sobre 1,8 m.',
    targets: [{ kind: 'all' }],
    publishedDaysAgo: [],
    acceptedShare: 0,
    rejectedShare: 0,
  },
];

const REJECT_REASONS = [
  'No entiendo el punto sobre horarios de descanso, necesito que me lo expliquen.',
  'En mi base no tenemos el elemento que pide el punto 4.',
];

function daysAgo(ctx: Ctx, days: number): Date {
  return ctx.cal.at(-days, 10);
}

const POSITION_NAMES = new Map<string, string>(POSITIONS.map((p) => [p.key, p.name]));

export async function seedHse(ctx: Ctx, employees: DemoEmployee[]): Promise<void> {
  const { tx, company, faker } = ctx;
  await tx.hse_document_types.createMany({
    data: TYPES.map((name) => ({ id: demoId('hse-type', name), company_id: company.id, name })),
  });

  for (const doc of DOCS) {
    const documentId = demoId('hse-document', doc.key);
    const published = doc.publishedDaysAgo.length > 0;
    const versionCount = Math.max(doc.publishedDaysAgo.length, 1);
    await tx.hse_documents.create({
      data: {
        id: documentId,
        company_id: company.id,
        type_id: demoId('hse-type', doc.type),
        title: doc.title,
        description: doc.description,
        status: 'draft',
        created_by: ctx.actorId,
        created_at: daysAgo(ctx, (doc.publishedDaysAgo[0] ?? 2) + 2),
      },
      select: { id: true },
    });
    for (let v = 1; v <= versionCount; v++) {
      const versionId = demoId('hse-version', `${doc.key}:${v}`);
      const key = `${company.id}/documents/${documentId}/${versionId}.pdf`;
      await addPdf(ctx, HSE_BUCKET, key, {
        title: doc.title,
        fields: [
          ['Tipo', doc.type],
          ['Versión', String(v)],
          [
            'Alcance',
            doc.targets
              .map((t) => (t.kind === 'all' ? 'Todo el personal' : t.kind === 'position' ? t.positionKey : t.sectorKey))
              .join(', '),
          ],
        ],
        body: doc.description,
        reference: `HSE-${doc.key.toUpperCase()}-V${v}`,
      });
      const body = ctx.files[ctx.files.length - 1]?.body ?? new Uint8Array();
      const publishedAt = published ? daysAgo(ctx, doc.publishedDaysAgo[v - 1] ?? 0) : null;
      await tx.hse_document_versions.create({
        data: {
          id: versionId,
          company_id: company.id,
          document_id: documentId,
          version: v,
          file_path: key,
          file_name: `${doc.key}-v${v}.pdf`,
          file_size: body.byteLength,
          file_sha256: createHash('sha256').update(body).digest('hex'),
          change_log:
            v > 1 ? 'Se actualizan las velocidades máximas en caminos de ripio y el uso de manos libres.' : null,
          expires_at: doc.expiresInDays && v === versionCount ? ctx.cal.day(doc.expiresInDays) : null,
          published_at: publishedAt,
          published_by: publishedAt ? ctx.actorId : null,
          created_by: ctx.actorId,
        },
        select: { id: true },
      });
    }
    await tx.hse_document_targets.createMany({
      data: doc.targets.map((t) => ({
        company_id: company.id,
        document_id: documentId,
        kind: t.kind,
        position_id: t.kind === 'position' ? demoId('position', t.positionKey) : null,
        sector_id: t.kind === 'sector' ? demoId('hierarchy', t.sectorKey) : null,
      })),
    });
    if (!published) continue;

    // Las versiones anteriores se publican y se responden primero, así la vigente archiva su historia.
    for (let v = 1; v <= versionCount; v++) {
      const versionId = demoId('hse-version', `${doc.key}:${v}`);
      await tx.hse_documents.update({
        where: { id: documentId },
        data: { status: 'published', current_version_id: versionId },
        select: { id: true },
      });
      await tx.$executeRaw`SELECT public.hse_sync_acknowledgements(${company.id}::uuid, ${documentId}::uuid, NULL::uuid)`;
      const isCurrent = v === versionCount;
      const pending = await tx.hse_document_acknowledgements.findMany({
        where: { version_id: versionId, archived_at: null, status: 'pending' },
        select: { id: true, employee_id: true },
        orderBy: { employee_id: 'asc' },
      });
      const accepted = isCurrent ? doc.acceptedShare : 0.9;
      const rejected = isCurrent ? doc.rejectedShare : 0;
      const publishedDays = doc.publishedDaysAgo[v - 1] ?? 0;
      for (const ack of pending) {
        const roll = faker.number.float({ min: 0, max: 1 });
        if (roll >= accepted + rejected) continue;
        const person = employees.find((e) => e.id === ack.employee_id);
        const isReject = roll >= accepted;
        await tx.hse_document_acknowledgements.update({
          where: { id: ack.id },
          data: {
            status: isReject ? 'rejected' : 'accepted',
            responded_at: daysAgo(ctx, faker.number.int({ min: 0, max: Math.max(publishedDays - 1, 0) })),
            reject_reason: isReject ? faker.helpers.arrayElement(REJECT_REASONS) : null,
            signer_name: person ? `${person.lastname} ${person.firstname}` : null,
            signer_position: person ? POSITION_NAMES.get(person.position) ?? null : null,
            signer_file: person?.file ?? null,
            ip: '190.12.34.56',
            user_agent: 'Mozilla/5.0 (Linux; Android 14) Chrome Mobile (demo)',
          },
          select: { id: true },
        });
      }
    }
  }

  const acks = await tx.hse_document_acknowledgements.count({ where: { company_id: company.id } });
  ctx.log(`HSE: ${DOCS.length} documentos, ${acks} aceptaciones`);
  await seedHseTrainings(ctx);
  await seedHseRecords(ctx);
}

// ── Capacitaciones (fase 3) ──────────────────────────────────────────────────────────────────

interface DemoQuestion {
  prompt: string;
  points: number;
  options: string[];
  /** Posición de la opción correcta. */
  correct: number;
}

interface DemoTraining {
  key: string;
  title: string;
  kind: 'induction' | 'refresher' | 'specific' | 'other';
  description: string;
  targets: Target[];
  /** Días atrás de la publicación; null = borrador. */
  publishedDaysAgo: number | null;
  passingScore: number;
  maxAttempts: number;
  timeLimitMinutes: number | null;
  validityMonths: number | null;
  materials: Array<{ title: string; kind: 'file' | 'link'; url?: string; required: boolean }>;
  questions: DemoQuestion[];
  /** Fracción de destinatarios que aprobó (con 1 o 2 intentos) y que desaprobó todos sus intentos. */
  passedShare: number;
  exhaustedShare: number;
}

const TRAININGS: DemoTraining[] = [
  {
    key: 'matafuegos',
    title: 'Uso de matafuegos',
    kind: 'induction',
    description: 'Clases de fuego, tipos de extintor y la técnica PAS para usarlos en la base y en los equipos.',
    targets: [{ kind: 'all' }],
    publishedDaysAgo: 30,
    passingScore: 70,
    maxAttempts: 3,
    timeLimitMinutes: 15,
    validityMonths: 12,
    materials: [
      { title: 'Manual de uso de matafuegos', kind: 'file', required: true },
      {
        title: 'Video: técnica PAS',
        kind: 'link',
        url: 'https://www.youtube.com/watch?v=PQV71INDaqY',
        required: false,
      },
    ],
    questions: [
      {
        prompt: '¿Qué tipo de fuego es el de un tablero eléctrico con tensión?',
        points: 2,
        options: ['Clase A', 'Clase B', 'Clase C', 'Clase D'],
        correct: 2,
      },
      {
        prompt: '¿Qué significa la sigla PAS?',
        points: 1,
        options: [
          'Presionar, Apuntar, Soltar',
          'Quitar el precinto, Apuntar a la base, Apretar la palanca',
          'Probar, Avisar, Salir',
        ],
        correct: 1,
      },
      {
        prompt: '¿A dónde se apunta la descarga del matafuego?',
        points: 1,
        options: ['A la base de las llamas', 'A la punta de las llamas', 'Al humo'],
        correct: 0,
      },
      {
        prompt: 'Antes de usar un matafuego hay que:',
        points: 1,
        options: [
          'Dar aviso y tener una vía de escape a la espalda',
          'Abrir puertas y ventanas',
          'Esperar a que llegue el supervisor',
        ],
        correct: 0,
      },
    ],
    passedShare: 0.55,
    exhaustedShare: 0.04,
  },
  {
    key: 'manejo-ruta',
    title: 'Manejo defensivo en ruta',
    kind: 'specific',
    description:
      'Evaluación del procedimiento de manejo defensivo: velocidades, descansos y conducta en caminos de ripio.',
    targets: [{ kind: 'position', positionKey: 'chofer' }],
    publishedDaysAgo: 10,
    passingScore: 80,
    maxAttempts: 2,
    timeLimitMinutes: null,
    validityMonths: 24,
    materials: [{ title: 'Procedimiento de manejo defensivo (resumen)', kind: 'file', required: true }],
    questions: [
      {
        prompt: '¿Cuál es la velocidad máxima en caminos de ripio con el equipo cargado?',
        points: 2,
        options: ['40 km/h', '60 km/h', '80 km/h'],
        correct: 0,
      },
      {
        prompt: '¿Cada cuántas horas de manejo continuo hay que descansar?',
        points: 1,
        options: ['Cada 2 horas', 'Cada 4 horas', 'Solo al llegar'],
        correct: 0,
      },
      {
        prompt: 'El celular mientras se maneja:',
        points: 1,
        options: ['Se usa solo con manos libres y detenido', 'Se puede usar en recta', 'Se usa para mensajes cortos'],
        correct: 0,
      },
    ],
    passedShare: 0.4,
    exhaustedShare: 0.1,
  },
  {
    key: 'primeros-auxilios',
    title: 'Primeros auxilios',
    kind: 'refresher',
    description: 'Actualización anual: evaluación de la escena, RCP básica y control de hemorragias.',
    targets: [{ kind: 'all' }],
    // Publicada hace más de un año: hay aprobaciones a punto de vencer y vencidas (ver `pinTrainingExpiries`).
    publishedDaysAgo: 400,
    passingScore: 70,
    maxAttempts: 2,
    timeLimitMinutes: null,
    validityMonths: 12,
    materials: [
      {
        title: 'Guía de RCP básica',
        kind: 'link',
        url: 'https://www.argentina.gob.ar/salud/rcp',
        required: false,
      },
    ],
    questions: [
      {
        prompt: '¿Qué es lo primero que hay que hacer ante un accidentado?',
        points: 1,
        options: ['Evaluar que la escena sea segura', 'Moverlo a un lugar cómodo', 'Darle agua'],
        correct: 0,
      },
      {
        prompt: '¿Cuántas compresiones por minuto lleva la RCP en un adulto?',
        points: 1,
        options: ['Entre 100 y 120', 'Entre 40 y 60', 'Más de 200'],
        correct: 0,
      },
    ],
    passedShare: 0.35,
    exhaustedShare: 0,
  },
  {
    key: 'altura',
    title: 'Trabajo en altura',
    kind: 'specific',
    description: 'Borrador en armado: arnés, línea de vida y permiso de trabajo.',
    targets: [{ kind: 'sector', sectorKey: 'mantenimiento' }],
    publishedDaysAgo: null,
    passingScore: 70,
    maxAttempts: 3,
    timeLimitMinutes: 20,
    validityMonths: 12,
    materials: [],
    questions: [
      {
        prompt: '¿Desde qué altura es obligatorio el arnés?',
        points: 1,
        options: ['1,8 m', '3 m', '5 m'],
        correct: 0,
      },
    ],
    passedShare: 0,
    exhaustedShare: 0,
  },
];

/**
 * Capacitaciones de la demo. Quién la tiene asignada lo calcula la MISMA conciliación de la app
 * (`hse_sync_training_assignments`) y los intentos se rinden con las MISMAS funciones del portal (`hse_start_attempt`,
 * `hse_save_answer`, `hse_grade_attempt`) con el legajo de cada empleado como contexto: así los puntajes salen de la
 * corrección real. Después se corren las fechas al pasado (sin triggers) para que la demo tenga historia.
 */
async function seedHseTrainings(ctx: Ctx): Promise<void> {
  const { tx, company, faker } = ctx;
  let attempts = 0;

  for (const t of TRAININGS) {
    const trainingId = demoId('hse-training', t.key);
    await tx.hse_trainings.create({
      data: {
        id: trainingId,
        company_id: company.id,
        title: t.title,
        description: t.description,
        kind: t.kind,
        passing_score: t.passingScore,
        max_attempts: t.maxAttempts,
        time_limit_minutes: t.timeLimitMinutes,
        validity_months: t.validityMonths,
        created_by: ctx.actorId,
        created_at: daysAgo(ctx, (t.publishedDaysAgo ?? 1) + 3),
      },
      select: { id: true },
    });
    await tx.hse_training_targets.createMany({
      data: t.targets.map((target) => ({
        company_id: company.id,
        training_id: trainingId,
        kind: target.kind,
        position_id: target.kind === 'position' ? demoId('position', target.positionKey) : null,
        sector_id: target.kind === 'sector' ? demoId('hierarchy', target.sectorKey) : null,
      })),
    });
    for (const [position, m] of t.materials.entries()) {
      const materialId = demoId('hse-material', `${t.key}:${position}`);
      const key = m.kind === 'file' ? `${company.id}/trainings/${trainingId}/${materialId}.pdf` : null;
      let size = 0;
      let sha = '';
      if (key) {
        await addPdf(ctx, HSE_BUCKET, key, {
          title: m.title,
          fields: [['Capacitación', t.title]],
          body: t.description,
          reference: `HSE-CAP-${t.key.toUpperCase()}`,
        });
        const body = ctx.files[ctx.files.length - 1]?.body ?? new Uint8Array();
        size = body.byteLength;
        sha = createHash('sha256').update(body).digest('hex');
      }
      await tx.hse_training_materials.create({
        data: {
          id: materialId,
          company_id: company.id,
          training_id: trainingId,
          kind: m.kind,
          title: m.title,
          url: m.kind === 'link' ? m.url : null,
          file_path: key,
          file_name: key ? `${t.key}.pdf` : null,
          file_size: key ? size : null,
          file_sha256: key ? sha : null,
          is_required: m.required,
          position,
        },
        select: { id: true },
      });
    }
    const keyByQuestion = new Map<string, { correct: string; wrong: string[] }>();
    for (const [qIndex, q] of t.questions.entries()) {
      const questionId = demoId('hse-question', `${t.key}:${qIndex}`);
      await tx.hse_training_questions.create({
        data: {
          id: questionId,
          company_id: company.id,
          training_id: trainingId,
          prompt: q.prompt,
          points: q.points,
          position: qIndex,
        },
        select: { id: true },
      });
      const optionIds = q.options.map((_, oIndex) => demoId('hse-option', `${t.key}:${qIndex}:${oIndex}`));
      await tx.hse_training_options.createMany({
        data: q.options.map((label, oIndex) => ({
          id: optionIds[oIndex] as string,
          company_id: company.id,
          training_id: trainingId,
          question_id: questionId,
          label,
          position: oIndex,
        })),
      });
      await tx.hse_training_answer_keys.create({
        data: {
          question_id: questionId,
          company_id: company.id,
          training_id: trainingId,
          option_id: optionIds[q.correct] as string,
        },
        select: { question_id: true },
      });
      keyByQuestion.set(questionId, {
        correct: optionIds[q.correct] as string,
        wrong: optionIds.filter((_, i) => i !== q.correct),
      });
    }
    if (t.publishedDaysAgo === null) continue;

    await tx.hse_trainings.update({
      where: { id: trainingId },
      data: { status: 'published', published_at: daysAgo(ctx, t.publishedDaysAgo), published_by: ctx.actorId },
      select: { id: true },
    });
    await tx.$executeRaw`SELECT public.hse_sync_training_assignments(${company.id}::uuid, ${trainingId}::uuid, NULL::uuid)`;
    const assignments = await tx.hse_training_assignments.findMany({
      where: { training_id: trainingId, archived_at: null },
      select: { employee_id: true },
      orderBy: { employee_id: 'asc' },
    });

    for (const a of assignments) {
      const roll = faker.number.float({ min: 0, max: 1 });
      const plan: boolean[] =
        roll < t.passedShare
          ? roll < t.passedShare / 3
            ? [false, true]
            : [true]
          : roll < t.passedShare + t.exhaustedShare
            ? Array.from({ length: t.maxAttempts }, () => false)
            : [];
      if (plan.length === 0) continue;
      // El examen se rinde como ESE empleado: las funciones exigen el legajo y la empresa del contexto.
      await tx.$executeRaw`SELECT set_config('app.company_id', ${company.id}, true), set_config('app.employee_id', ${a.employee_id}, true), set_config('app.actor_kind', 'employee', true)`;
      for (const m of t.materials.entries()) {
        await tx.$executeRaw`SELECT public.hse_mark_material_read(${demoId('hse-material', `${t.key}:${m[0]}`)}::uuid)`;
      }
      let daysBack = faker.number.int({ min: 1, max: Math.max(t.publishedDaysAgo - 1, 1) });
      for (const pass of plan) {
        const started = await tx.$queryRaw<{ r: { ok: boolean; attemptId?: string } }[]>`
          SELECT public.hse_start_attempt(${trainingId}::uuid) AS r`;
        const attemptId = started[0]?.r.attemptId;
        if (!attemptId) break;
        for (const [questionId, options] of keyByQuestion) {
          // Aprobado: todo bien. Desaprobado: la primera bien (si hay más de una) y el resto mal.
          const first = questionId === [...keyByQuestion.keys()][0];
          const optionId =
            pass || (first && keyByQuestion.size > 2) ? options.correct : faker.helpers.arrayElement(options.wrong);
          await tx.$queryRaw`SELECT public.hse_save_answer(${attemptId}::uuid, ${questionId}::uuid, ${optionId}::uuid)`;
        }
        await tx.$queryRaw`SELECT public.hse_grade_attempt(${attemptId}::uuid)`;
        attempts += 1;
        // Fechas al pasado (el reloj de la demo es "hoy"): sin triggers, porque un intento cerrado es inmutable.
        const startedAt = ctx.cal.at(-daysBack, faker.number.int({ min: 8, max: 16 }));
        const submittedAt = new Date(startedAt.getTime() + faker.number.int({ min: 4, max: 12 }) * 60_000);
        await withoutTriggers(tx, async () => {
          await tx.hse_training_attempts.update({
            where: { id: attemptId },
            data: {
              started_at: startedAt,
              submitted_at: submittedAt,
              deadline_at: t.timeLimitMinutes ? new Date(startedAt.getTime() + t.timeLimitMinutes * 60_000) : null,
            },
            select: { id: true },
          });
          await tx.hse_training_answers.updateMany({
            where: { attempt_id: attemptId },
            data: { answered_at: submittedAt },
          });
          await tx.hse_training_assignments.updateMany({
            where: { training_id: trainingId, employee_id: a.employee_id },
            data: pass
              ? {
                  last_attempt_at: startedAt,
                  passed_at: submittedAt,
                  valid_until: t.validityMonths
                    ? new Date(
                        Date.UTC(
                          submittedAt.getUTCFullYear(),
                          submittedAt.getUTCMonth() + t.validityMonths,
                          submittedAt.getUTCDate()
                        )
                      )
                    : null,
                }
              : { last_attempt_at: startedAt },
          });
        });
        daysBack = Math.max(daysBack - faker.number.int({ min: 1, max: 3 }), 0);
      }
    }
    await tx.$executeRaw`SELECT set_config('app.company_id', ${company.id}, true), set_config('app.employee_id', '', true), set_config('app.actor_kind', '', true)`;
  }

  await pinTrainingExpiries(ctx);
  const assigned = await tx.hse_training_assignments.count({ where: { company_id: company.id } });
  ctx.log(`HSE: ${TRAININGS.length} capacitaciones, ${assigned} asignaciones, ${attempts} intentos rendidos`);
}

/** Aprobaciones de primeros auxilios con vencimiento fijo relativo a hoy: una vence en 10 días y otra venció hace 5. */
const PINNED_EXPIRIES = [10, -5];

/**
 * Deja vencimientos visibles para el job `hse-expiry` (avisa lo que vence en ≤ 30 días o ya venció): las dos primeras
 * aprobaciones de primeros auxilios (orden estable por empleado) pasan a vencer en los días de `PINNED_EXPIRIES`. La
 * fecha de aprobación se corre a «vencimiento − vigencia» (la misma cuenta de `hse_grade_attempt`), sin triggers como
 * el resto de las fechas al pasado. Cada reset las vuelve a calcular contra el día de hoy.
 */
async function pinTrainingExpiries(ctx: Ctx): Promise<void> {
  const { tx, cal } = ctx;
  const training = TRAININGS.find((t) => t.key === 'primeros-auxilios');
  if (!training?.validityMonths) return;
  const trainingId = demoId('hse-training', training.key);
  const passed = await tx.hse_training_assignments.findMany({
    where: { training_id: trainingId, status: 'passed', archived_at: null, passed_attempt_id: { not: null } },
    orderBy: { employee_id: 'asc' },
    take: PINNED_EXPIRIES.length,
    select: { id: true, passed_attempt_id: true },
  });
  for (const [index, assignment] of passed.entries()) {
    const validUntil = cal.ymd(PINNED_EXPIRIES[index] as number);
    const approved = new Date(`${validUntil}T00:00:00Z`);
    approved.setUTCMonth(approved.getUTCMonth() - training.validityMonths);
    const submittedAt = cal.at(cal.offsetOf(approved.toISOString().slice(0, 10)), 11);
    const startedAt = new Date(submittedAt.getTime() - 8 * 60_000);
    await withoutTriggers(tx, async () => {
      await tx.hse_training_attempts.update({
        where: { id: assignment.passed_attempt_id as string },
        data: { started_at: startedAt, submitted_at: submittedAt, deadline_at: null },
        select: { id: true },
      });
      await tx.hse_training_answers.updateMany({
        where: { attempt_id: assignment.passed_attempt_id as string },
        data: { answered_at: submittedAt },
      });
      await tx.hse_training_assignments.update({
        where: { id: assignment.id },
        data: {
          last_attempt_at: startedAt,
          passed_at: submittedAt,
          valid_until: new Date(`${validUntil}T00:00:00Z`),
        },
        select: { id: true },
      });
    });
  }
  ctx.log(`HSE: ${passed.length} aprobaciones con vencimiento fijo (avisos de vencimiento)`);
}

const INSTRUCTORS: Record<string, { kind: 'external'; fullName: string; license: string | null; roleTitle: string }[]> =
  {
    matafuegos: [
      { kind: 'external', fullName: 'Méndez Carlos', license: 'BV-1187', roleTitle: 'Oficial de Bomberos Voluntarios' },
    ],
    'manejo-ruta': [
      { kind: 'external', fullName: 'Torres Ana', license: 'Mat. 4521', roleTitle: 'Lic. en Higiene y Seguridad' },
    ],
  };

/** Contexto de la transacción como en la app: empleado del portal o usuario del dashboard. */
async function asEmployee(ctx: Ctx, employeeId: string) {
  await ctx.tx
    .$executeRaw`SELECT set_config('app.company_id', ${ctx.company.id}, true), set_config('app.employee_id', ${employeeId}, true), set_config('app.actor_kind', 'employee', true), set_config('app.user_id', '', true)`;
}
async function asAdmin(ctx: Ctx) {
  await ctx.tx
    .$executeRaw`SELECT set_config('app.company_id', ${ctx.company.id}, true), set_config('app.employee_id', '', true), set_config('app.actor_kind', 'user', true), set_config('app.user_id', ${ctx.actorId}, true)`;
}

async function signCertificate(ctx: Ctx, employeeId: string, attemptId: string, n: number) {
  await asEmployee(ctx, employeeId);
  await ctx.tx
    .$queryRaw`SELECT public.hse_sign_certificate(${attemptId}::uuid, ${`10.0.0.${10 + n}`}, ${'Mozilla/5.0 (Linux; Android 14) Portal demo'}) AS r`;
}

async function seedHseRecords(ctx: Ctx): Promise<void> {
  const { tx, company } = ctx;
  for (const [key, list] of Object.entries(INSTRUCTORS)) {
    await tx.hse_training_instructors.createMany({
      data: list.map((i, position) => ({
        id: demoId('hse-instructor', `${key}:${position}`),
        company_id: company.id,
        training_id: demoId('hse-training', key),
        kind: i.kind,
        full_name: i.fullName,
        license: i.license,
        role_title: i.roleTitle,
        position,
      })),
    });
  }

  // Acta 1 (cerrada): dictado de matafuegos hace 20 días, con los que aprobaron y un par que no.
  const trainingId = demoId('hse-training', 'matafuegos');
  const assignments = await tx.hse_training_assignments.findMany({
    where: { training_id: trainingId, archived_at: null },
    orderBy: { employee_id: 'asc' },
    select: { employee_id: true, status: true, passed_attempt_id: true },
  });
  const passed = assignments.filter((a) => a.status === 'passed' && a.passed_attempt_id).slice(0, 12);
  const others = assignments.filter((a) => a.status !== 'passed').slice(0, 3);
  const recordId = demoId('hse-record', 'matafuegos-1');
  await tx.hse_training_records.create({
    data: {
      id: recordId,
      company_id: company.id,
      training_id: trainingId,
      number: 1,
      held_on: new Date(`${ctx.cal.at(-20, 12).toISOString().slice(0, 10)}T00:00:00Z`),
      modality: 'in_person',
      location: 'Base Neuquén — playón de maniobras',
      duration_minutes: 90,
      topics: 'Clases de fuego y agentes extintores\nPartes del matafuego y control de carga\nPráctica con fuego real',
      observations: 'Práctica con matafuegos ABC de 5 kg. Se repasó la vía de escape antes de cada práctica.',
      created_by: ctx.actorId,
    },
    select: { id: true },
  });
  await tx.hse_training_record_instructors.createMany({
    data: INSTRUCTORS.matafuegos.map((i, position) => ({
      company_id: company.id,
      record_id: recordId,
      kind: i.kind,
      full_name: i.fullName,
      license: i.license,
      role_title: i.roleTitle,
      position,
    })),
  });
  await tx.hse_training_record_attendees.createMany({
    data: [...passed, ...others].map((a, index) => ({
      company_id: company.id,
      record_id: recordId,
      employee_id: a.employee_id,
      attended: index !== passed.length, // uno de los que no aprobó faltó
    })),
  });
  // Firmas antes del cierre (constan en el acta) …
  let signed = 0;
  for (const a of passed.slice(0, 5))
    await signCertificate(ctx, a.employee_id, a.passed_attempt_id as string, signed++);
  await asAdmin(ctx);
  const closed = await tx.$queryRaw<{ r: { ok: boolean; reason?: string } }[]>`
    SELECT public.hse_close_training_record(${recordId}::uuid, ${ctx.actorId}::uuid) AS r`;
  if (!closed[0]?.r.ok) throw new Error(`No se pudo cerrar el acta demo: ${closed[0]?.r.reason ?? 'sin respuesta'}`);
  // … y después (las ve el detalle del acta, no el acta congelada; su constancia cita el acta cerrada).
  for (const a of passed.slice(5, 9))
    await signCertificate(ctx, a.employee_id, a.passed_attempt_id as string, signed++);

  // Acta 2 (borrador): manejo en ruta, para mostrar la edición.
  const routeId = demoId('hse-training', 'manejo-ruta');
  const draftId = demoId('hse-record', 'manejo-ruta-1');
  await asAdmin(ctx);
  await tx.hse_training_records.create({
    data: {
      id: draftId,
      company_id: company.id,
      training_id: routeId,
      number: 2,
      held_on: new Date(`${ctx.cal.at(-2, 12).toISOString().slice(0, 10)}T00:00:00Z`),
      modality: 'mixed',
      location: 'Sala de capacitación y ruta 22',
      duration_minutes: 120,
      topics: 'Velocidades máximas y descansos\nUso del celular\nFauna en ruta',
      created_by: ctx.actorId,
    },
    select: { id: true },
  });
  await tx.hse_training_record_instructors.createMany({
    data: INSTRUCTORS['manejo-ruta'].map((i, position) => ({
      company_id: company.id,
      record_id: draftId,
      kind: i.kind,
      full_name: i.fullName,
      license: i.license,
      role_title: i.roleTitle,
      position,
    })),
  });
  const routeAssignments = await tx.hse_training_assignments.findMany({
    where: { training_id: routeId, archived_at: null },
    orderBy: { employee_id: 'asc' },
    take: 8,
    select: { employee_id: true },
  });
  await tx.hse_training_record_attendees.createMany({
    data: routeAssignments.map((a) => ({ company_id: company.id, record_id: draftId, employee_id: a.employee_id })),
  });
  await tx.$executeRaw`SELECT set_config('app.company_id', ${company.id}, true), set_config('app.employee_id', '', true), set_config('app.actor_kind', '', true), set_config('app.user_id', '', true)`;

  ctx.log(`HSE: 2 actas (1 cerrada con ${passed.length + others.length} asistentes), ${signed} constancias firmadas`);
}
