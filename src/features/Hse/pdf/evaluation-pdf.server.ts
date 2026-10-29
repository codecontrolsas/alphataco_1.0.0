import 'server-only';

import { Logger } from '@/lib/logger';
import { loadCompanyLogo, loadReactPdf, toPdfDownload } from '@/shared/lib/pdf/react-pdf.server';
import type { PdfDownload } from '@/shared/lib/pdf/types';
import { prisma } from '@/shared/lib/prisma';
import { secondsBetween } from '../lib/durations';
import { buildEvaluationQuestions, type EvaluationPdfData } from '../lib/evaluation-content';
import { toPercent } from '../lib/training-status';
import { EvaluationPdfDocument } from './HsePdfDocuments';

/**
 * PDF de evaluación de un intento CERRADO. Se genera al momento y no se guarda: un intento cerrado es inmutable y la
 * hoja no es un documento firmado (a diferencia de la constancia y el acta, que sí congelan su contenido).
 *
 * Dos alcances, ambos con el cliente contextual (la RLS repite el perímetro):
 * - `dashboard`: personal de HSE con permiso (lo controla la acción). Lleva el detalle por pregunta con la clave.
 * - `portal`: SOLO un intento propio (se filtra por el legajo de la sesión además de la RLS: un empleado que también
 *   es miembro corre como `user` y la RLS sola no lo acotaría). SIN detalle por pregunta: con varios intentos
 *   revelaría la clave de respuestas, igual que la pantalla de resultado.
 *
 * Módulo server-only (NO son Server Actions): las acciones ya controlaron módulo, sesión y permisos.
 */

const logger = new Logger('features/Hse/evaluation-pdf');

export type EvaluationScope =
  | { kind: 'dashboard'; companyId: string }
  | {
      kind: 'portal';
      companyId: string;
      employee: { id: string; firstname: string; lastname: string; file: string | null };
    };

export type EvaluationPdfResult = { ok: true; file: PdfDownload } | { ok: false; error: string };

const NOT_GENERATED = 'No se pudo generar el PDF de la evaluación. Intentá de nuevo en unos minutos.';

/** Reúne los datos de la hoja. `null` si el intento no existe, no es del alcance o todavía está abierto. */
export async function loadEvaluationData(
  attemptId: string,
  scope: EvaluationScope
): Promise<{ data: EvaluationPdfData; logoUrl: string | null } | null> {
  const attempt = await prisma.hse_training_attempts.findFirst({
    where: {
      id: attemptId,
      company_id: scope.companyId,
      status: { in: ['submitted', 'expired'] },
      ...(scope.kind === 'portal' ? { employee_id: scope.employee.id } : {}),
    },
    select: {
      id: true,
      attempt_number: true,
      status: true,
      started_at: true,
      submitted_at: true,
      score_points: true,
      max_points: true,
      score_percent: true,
      passed: true,
      question_order: true,
      training_id: true,
      employee_id: true,
      training: { select: { title: true, passing_score: true } },
    },
  });
  if (!attempt || (attempt.status !== 'submitted' && attempt.status !== 'expired')) return null;

  const [company, employee] = await Promise.all([
    prisma.company.findUnique({
      where: { id: scope.companyId },
      select: { company_name: true, company_cuit: true, address: true, company_logo: true },
    }),
    scope.kind === 'portal'
      ? Promise.resolve({
          firstname: scope.employee.firstname,
          lastname: scope.employee.lastname,
          file: scope.employee.file,
          cuil: null,
        })
      : prisma.employees.findFirst({
          where: { id: attempt.employee_id, company_id: scope.companyId },
          select: { firstname: true, lastname: true, file: true, cuil: true },
        }),
  ]);
  if (!company || !employee) return null;

  let questions: EvaluationPdfData['questions'] = null;
  if (scope.kind === 'dashboard') {
    const [rows, options, answers, keys] = await Promise.all([
      prisma.hse_training_questions.findMany({
        where: { training_id: attempt.training_id, company_id: scope.companyId },
        orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
        select: { id: true, prompt: true, points: true },
      }),
      prisma.hse_training_options.findMany({
        where: { training_id: attempt.training_id, company_id: scope.companyId },
        select: { id: true, question_id: true, label: true },
      }),
      prisma.hse_training_answers.findMany({
        where: { attempt_id: attempt.id, company_id: scope.companyId },
        select: { question_id: true, option_id: true },
      }),
      prisma.hse_training_answer_keys.findMany({
        where: { training_id: attempt.training_id, company_id: scope.companyId },
        select: { question_id: true, option_id: true },
      }),
    ]);
    questions = buildEvaluationQuestions({
      order: attempt.question_order,
      questions: rows,
      options,
      answers: new Map(answers.map((a) => [a.question_id, a.option_id])),
      keys: new Map(keys.map((k) => [k.question_id, k.option_id])),
    });
  }

  const data: EvaluationPdfData = {
    company: { name: company.company_name, cuit: company.company_cuit, address: company.address },
    employee: {
      fullName: `${employee.lastname} ${employee.firstname}`.trim(),
      file: employee.file,
      cuil: employee.cuil,
    },
    training: { title: attempt.training.title, passingScore: attempt.training.passing_score },
    attempt: {
      id: attempt.id,
      number: attempt.attempt_number,
      status: attempt.status,
      startedAt: attempt.started_at.toISOString(),
      submittedAt: attempt.submitted_at?.toISOString() ?? null,
      // Un intento vencido se cierra con `submitted_at = deadline_at` (lo fija `hse_grade_attempt`): no se infla aunque
      // el job lo corrija horas después.
      durationSeconds: secondsBetween(attempt.started_at, attempt.submitted_at),
      scorePoints: attempt.score_points,
      maxPoints: attempt.max_points,
      scorePercent: toPercent(attempt.score_percent),
      passed: attempt.passed,
    },
    questions,
  };
  return { data, logoUrl: company.company_logo };
}

/** Genera la hoja de evaluación. `null` si el intento no existe o no es del alcance (no se distingue a propósito). */
export async function renderEvaluationPdf(
  attemptId: string,
  scope: EvaluationScope
): Promise<EvaluationPdfResult | null> {
  const loaded = await loadEvaluationData(attemptId, scope);
  if (!loaded) return null;
  const { data, logoUrl } = loaded;
  try {
    const [rp, logo] = await Promise.all([loadReactPdf(), loadCompanyLogo(logoUrl)]);
    const buffer = await rp.renderToBuffer(EvaluationPdfDocument(rp, data, logo));
    return {
      ok: true,
      file: toPdfDownload({
        filename: `evaluacion-${data.attempt.id.slice(0, 8)}-intento-${data.attempt.number}.pdf`,
        content: new Uint8Array(buffer),
      }),
    };
  } catch (error) {
    logger.error('No se pudo generar el PDF de la evaluación', { data: { error, attemptId } });
    return { ok: false, error: NOT_GENERATED };
  }
}
