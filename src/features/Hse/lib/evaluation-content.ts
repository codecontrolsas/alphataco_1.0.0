/**
 * Contenido de la hoja de evaluación (PDF) de un intento cerrado. Módulo sin directiva ni dependencias de servidor:
 * lo arman el dashboard (con detalle por pregunta) y el portal (SIN detalle: con varios intentos revelaría la clave).
 */

export type EvaluationQuestionResult = 'correct' | 'wrong' | 'unanswered';

export interface EvaluationQuestion {
  prompt: string;
  points: number;
  /** Lo que respondió el empleado (`null` si no respondió). */
  chosen: string | null;
  /** La opción correcta (solo se muestra cuando la respuesta fue incorrecta o falta). */
  correct: string;
  result: EvaluationQuestionResult;
}

export interface EvaluationPdfData {
  company: { name: string; cuit: string; address: string | null };
  employee: { fullName: string; file: string | null; cuil: string | null };
  training: { title: string; passingScore: number };
  attempt: {
    id: string;
    number: number;
    status: 'submitted' | 'expired';
    startedAt: string;
    submittedAt: string | null;
    durationSeconds: number | null;
    scorePoints: number | null;
    maxPoints: number;
    scorePercent: number | null;
    passed: boolean | null;
  };
  /** `null` = versión sin detalle por pregunta (la del empleado en el portal). */
  questions: EvaluationQuestion[] | null;
}

type QuestionRow = { id: string; prompt: string; points: number };
type OptionRow = { id: string; question_id: string; label: string };

/**
 * Arma el detalle por pregunta en el orden en que el empleado las vio (`order`, el `question_order` del intento).
 * Una pregunta que ya no existe se omite; las que no estén en `order` (examen anterior a ese campo) van al final.
 */
export function buildEvaluationQuestions(input: {
  order: readonly string[];
  questions: readonly QuestionRow[];
  options: readonly OptionRow[];
  /** `pregunta → opción` elegida por el empleado. */
  answers: ReadonlyMap<string, string>;
  /** `pregunta → opción` correcta. */
  keys: ReadonlyMap<string, string>;
}): EvaluationQuestion[] {
  const byId = new Map(input.questions.map((q) => [q.id, q]));
  const label = new Map(input.options.map((o) => [o.id, o.label]));
  const ordered = input.order.filter((id) => byId.has(id));
  const missing = input.questions.map((q) => q.id).filter((id) => !input.order.includes(id));
  return [...ordered, ...(ordered.length === 0 ? missing : [])].flatMap((id) => {
    const question = byId.get(id);
    if (!question) return [];
    const answered = input.answers.get(id);
    const key = input.keys.get(id);
    const result: EvaluationQuestionResult = !answered ? 'unanswered' : answered === key ? 'correct' : 'wrong';
    return [
      {
        prompt: question.prompt,
        points: question.points,
        chosen: answered ? label.get(answered) ?? null : null,
        correct: key ? label.get(key) ?? '—' : '—',
        result,
      },
    ];
  });
}
