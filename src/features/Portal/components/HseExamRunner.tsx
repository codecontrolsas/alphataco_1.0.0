'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { PortalHseExam } from '@/features/Portal/actions/hse-trainings.queries';
import { saveHseAnswer, submitHseAttempt } from '@/features/Portal/actions/hse-trainings.server';
import { Logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, CloudOff, Loader2, Send, Timer } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { toast } from 'sonner';

const logger = new Logger('Portal/HseExamRunner');

/** Respuestas elegidas que todavía no confirmó el servidor (corte de señal): sobreviven a recargar la página. */
const storageKey = (attemptId: string) => `hse-exam:v1:${attemptId}`;

function readPending(attemptId: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(storageKey(attemptId));
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string')
    );
  } catch {
    return {};
  }
}

function writePending(attemptId: string, pending: Record<string, string>) {
  try {
    if (Object.keys(pending).length === 0) window.localStorage.removeItem(storageKey(attemptId));
    else window.localStorage.setItem(storageKey(attemptId), JSON.stringify(pending));
  } catch {
    // Sin almacenamiento (modo privado): quedan en memoria (`pendingRef`) y se reintentan mientras la página siga abierta.
  }
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Examen del portal: una pregunta por pantalla, con progreso, mapa de preguntas y temporizador.
 *
 * - El cliente manda SOLO la opción elegida; no sabe cuál es la correcta ni calcula nada.
 * - Cada respuesta se guarda en el servidor al elegirla. Si falla (sin señal), queda pendiente en este navegador y se
 *   reintenta sola al volver la conexión; antes de enviar se vuelven a mandar todas.
 * - El tiempo lo mide la base: el temporizador parte de los segundos que informa el servidor y se corrige con cada
 *   respuesta guardada. Al llegar a cero se envía; aunque no se envíe, el servidor cierra el intento igual.
 */
export function HseExamRunner({ exam }: { exam: PortalHseExam }) {
  const router = useRouter();
  const total = exam.questions.length;
  const [index, setIndex] = useState(0);
  const [pending, setPending] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, string>>(exam.answers);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'offline'>('idle');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(exam.secondsLeft);
  const endAt = useRef<number | null>(exam.secondsLeft === null ? null : Date.now() + exam.secondsLeft * 1000);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submittedRef = useRef(false);
  const inFlightRef = useRef(false);
  /** Pendientes en memoria: fuente de verdad aunque el navegador no deje usar el almacenamiento (modo privado). */
  const pendingRef = useRef<Record<string, string>>({});

  const question = exam.questions[index];
  const answeredCount = exam.questions.filter((q) => answers[q.id]).length;
  const unanswered = total - answeredCount;
  const pendingCount = Object.keys(pending).length;

  const updatePending = useCallback(
    (update: (prev: Record<string, string>) => Record<string, string>) =>
      setPending((prev) => {
        const next = update(prev);
        pendingRef.current = next;
        writePending(exam.attemptId, next);
        return next;
      }),
    [exam.attemptId]
  );

  const goToResult = useCallback(() => {
    writePending(exam.attemptId, {});
    router.replace(`/portal/trainings/${exam.trainingId}/result/${exam.attemptId}`);
  }, [exam.attemptId, exam.trainingId, router]);

  /** Manda una respuesta. `true` si el servidor la guardó; si el intento ya está cerrado, lleva al resultado. */
  const sendAnswer = useCallback(
    async (questionId: string, optionId: string): Promise<boolean> => {
      try {
        const result = await saveHseAnswer({ attemptId: exam.attemptId, questionId, optionId });
        if (!result.ok) throw new Error(result.error);
        if (result.data.secondsLeft !== null) endAt.current = Date.now() + result.data.secondsLeft * 1000;
        if (result.data.status === 'closed') {
          toast.info('El examen ya se cerró. Te mostramos el resultado.');
          submittedRef.current = true;
          goToResult();
          return false;
        }
        updatePending((prev) => {
          if (prev[questionId] !== optionId) return prev;
          const { [questionId]: _saved, ...rest } = prev;
          return rest;
        });
        return true;
      } catch (error) {
        logger.warn('No se pudo guardar la respuesta', { data: { error } });
        return false;
      }
    },
    [exam.attemptId, goToResult, updatePending]
  );

  /** Reintenta todo lo pendiente. `true` si no quedó nada sin guardar. */
  const flushPending = useCallback(async (): Promise<boolean> => {
    const entries = Object.entries({ ...readPending(exam.attemptId), ...pendingRef.current });
    let ok = true;
    for (const [questionId, optionId] of entries) {
      if (!(await sendAnswer(questionId, optionId))) ok = false;
    }
    setSaveState(ok ? 'saved' : 'offline');
    return ok;
  }, [exam.attemptId, sendAnswer]);

  const submit = useCallback(
    async (auto: boolean) => {
      // Un solo envío a la vez: el reloj en cero no dispara otro mientras el anterior sigue en camino.
      if (submittedRef.current || inFlightRef.current) return;
      inFlightRef.current = true;
      setSubmitting(true);
      const flushed = await flushPending();
      if (!flushed && !auto) {
        inFlightRef.current = false;
        setSubmitting(false);
        setConfirmOpen(false);
        toast.error('Hay respuestas sin guardar por falta de conexión. Revisá la señal y volvé a enviar.');
        return;
      }
      const result = await submitHseAttempt({ attemptId: exam.attemptId });
      if (!result.ok) {
        inFlightRef.current = false;
        setSubmitting(false);
        toast.error(result.error);
        return;
      }
      submittedRef.current = true;
      goToResult();
    },
    [exam.attemptId, flushPending, goToResult]
  );

  // Reloj: sincronización con el tiempo real (efecto legítimo). Parte de lo que dijo el servidor.
  useEffect(() => {
    if (endAt.current === null) return;
    const tick = () => {
      const left = Math.max(0, Math.round(((endAt.current ?? Date.now()) - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0 && !submittedRef.current) void submit(true);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [submit]);

  // Conexión: al volver la señal se reintenta lo pendiente (suscripción a un evento del navegador).
  useEffect(() => {
    const onOnline = () => void flushPending();
    window.addEventListener('online', onOnline);
    // Lo que quedó sin guardar en una visita anterior (corte de señal o recarga): se muestra y se reintenta.
    const stored = readPending(exam.attemptId);
    if (Object.keys(stored).length > 0) {
      setAnswers((prev) => ({ ...prev, ...stored }));
      pendingRef.current = stored;
      setPending(stored);
      void flushPending();
    }
    return () => window.removeEventListener('online', onOnline);
  }, [exam.attemptId, flushPending]);

  const choose = async (optionId: string) => {
    if (!question || submitting) return;
    const questionId = question.id;
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
    updatePending((prev) => ({ ...prev, [questionId]: optionId }));
    setSaveState('saving');
    const saved = await sendAnswer(questionId, optionId);
    setSaveState(saved ? 'saved' : 'offline');
  };

  const goTo = (next: number) => {
    if (next < 0 || next >= total) return;
    flushSync(() => setIndex(next));
    headingRef.current?.focus();
  };

  if (!question) return null;
  const timeWarning =
    secondsLeft === null
      ? ''
      : secondsLeft <= 60
        ? 'Queda menos de un minuto'
        : secondsLeft <= 300
          ? 'Quedan menos de 5 minutos'
          : '';

  return (
    <div className="space-y-6">
      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-[calc(4rem+env(safe-area-inset-top,0px))] z-30 -mx-4 space-y-2 border-b px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-medium">{exam.trainingTitle}</p>
          {secondsLeft !== null && (
            <p
              role="timer"
              aria-label={`Tiempo restante ${formatClock(secondsLeft)}`}
              className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-mono text-sm font-semibold tabular-nums',
                secondsLeft <= 60
                  ? 'bg-danger-subtle text-danger-subtle-foreground'
                  : secondsLeft <= 300
                    ? 'bg-warn-subtle text-warn-subtle-foreground'
                    : 'bg-muted'
              )}
            >
              <Timer aria-hidden="true" className="size-4" />
              {formatClock(secondsLeft)}
            </p>
          )}
        </div>
        <Progress value={(answeredCount / total) * 100} aria-label={`${answeredCount} de ${total} respondidas`} />
        <p className="text-muted-foreground text-xs tabular-nums">
          {answeredCount} de {total} respondidas · intento {exam.attemptNumber}
        </p>
        <p className="sr-only" aria-live="polite">
          {timeWarning}
        </p>
      </div>

      <section aria-labelledby="exam-question" className="space-y-4">
        <p className="text-muted-foreground text-sm tabular-nums">
          Pregunta {index + 1} de {total} · {question.points} punto{question.points === 1 ? '' : 's'}
        </p>
        <h1
          id="exam-question"
          ref={headingRef}
          tabIndex={-1}
          className="text-xl font-semibold text-pretty break-words outline-none"
        >
          {question.prompt}
        </h1>
        <RadioGroup
          key={question.id}
          value={answers[question.id] ?? ''}
          onValueChange={(value) => void choose(value)}
          aria-labelledby="exam-question"
          className="gap-3"
          disabled={submitting}
        >
          {question.options.map((o) => {
            const id = `opt-${o.id}`;
            const selected = answers[question.id] === o.id;
            return (
              <label
                key={o.id}
                htmlFor={id}
                className={cn(
                  'bg-card has-[:focus-visible]:ring-ring flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-4 has-[:focus-visible]:ring-2',
                  selected && 'border-brand bg-brand-subtle/40'
                )}
              >
                <RadioGroupItem id={id} value={o.id} className="mt-0.5 size-5" />
                <span className="text-pretty break-words">{o.label}</span>
              </label>
            );
          })}
        </RadioGroup>
        <p role="status" className="text-muted-foreground flex min-h-5 items-center gap-1 text-sm">
          {saveState === 'saving' && (
            <>
              <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> Guardando…
            </>
          )}
          {saveState === 'saved' && pendingCount === 0 && 'Respuesta guardada'}
          {(saveState === 'offline' || pendingCount > 0) && saveState !== 'saving' && (
            <span className="text-warn-subtle-foreground inline-flex items-center gap-1">
              <CloudOff aria-hidden="true" className="size-4" />
              {pendingCount === 1
                ? '1 respuesta sin guardar: se reintenta al volver la conexión'
                : `${pendingCount} respuestas sin guardar: se reintentan al volver la conexión`}
            </span>
          )}
        </p>
      </section>

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          className="min-h-12"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
        >
          <ChevronLeft aria-hidden="true" className="size-4" /> Anterior
        </Button>
        {index < total - 1 ? (
          <Button type="button" className="min-h-12" onClick={() => goTo(index + 1)}>
            Siguiente <ChevronRight aria-hidden="true" className="size-4" />
          </Button>
        ) : (
          <Button type="button" className="min-h-12" onClick={() => setConfirmOpen(true)} disabled={submitting}>
            <Send aria-hidden="true" className="size-4" /> Enviar examen
          </Button>
        )}
      </div>

      <nav aria-label="Ir a una pregunta" className="space-y-2">
        <p className="text-muted-foreground text-sm">Ir a una pregunta</p>
        <ol className="flex flex-wrap gap-2">
          {exam.questions.map((q, i) => {
            const answered = Boolean(answers[q.id]);
            return (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => goTo(i)}
                  aria-current={i === index ? 'step' : undefined}
                  aria-label={`Pregunta ${i + 1}${answered ? ', respondida' : ', sin responder'}`}
                  className={cn(
                    'focus-visible:ring-ring flex size-11 items-center justify-center rounded-lg border text-sm font-medium tabular-nums outline-none focus-visible:ring-2',
                    answered ? 'bg-brand-subtle text-brand-subtle-foreground border-transparent' : 'bg-card',
                    i === index && 'ring-ring ring-2'
                  )}
                >
                  {i + 1}
                </button>
              </li>
            );
          })}
        </ol>
        {index < total - 1 && (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            onClick={() => setConfirmOpen(true)}
            disabled={submitting}
          >
            <Send aria-hidden="true" className="size-4" /> Enviar el examen ahora
          </Button>
        )}
      </nav>

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !submitting && setConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Enviar el examen?</AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              {unanswered === 0
                ? 'Respondiste todas las preguntas.'
                : unanswered === 1
                  ? 'Te queda 1 pregunta sin responder: cuenta como incorrecta.'
                  : `Te quedan ${unanswered} preguntas sin responder: cuentan como incorrectas.`}{' '}
              Después de enviarlo no se puede cambiar ninguna respuesta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Seguir respondiendo</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={(event) => {
                event.preventDefault();
                void submit(false);
              }}
            >
              {submitting ? 'Enviando…' : 'Enviar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
