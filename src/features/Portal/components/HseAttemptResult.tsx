import { HseEvaluationPdfButton } from '@/features/Hse/components/HseEvaluationPdfButton';
import { HSE_ATTEMPT_STATUS_LABELS } from '@/features/Hse/lib/constants';
import { formatPercent } from '@/features/Hse/lib/training-status';
import { getMyHseAttemptResult, getMyHseTraining } from '@/features/Portal/actions/hse-trainings.queries';
import { getPortalEmployeeForPage } from '@/features/Portal/actions/perimeter';
import { cn } from '@/lib/utils';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { CheckCircle2, ChevronLeft, XCircle } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

/**
 * Resultado de un intento: puntaje, si aprobó e intentos que quedan. NO muestra qué preguntas estuvieron bien o mal:
 * con varios intentos eso revelaría la clave de respuestas.
 */
export async function HseAttemptResult({ trainingId, attemptId }: { trainingId: string; attemptId: string }) {
  const employee = await getPortalEmployeeForPage();
  const [result, training] = await Promise.all([
    getMyHseAttemptResult(employee, attemptId),
    getMyHseTraining(employee, trainingId),
  ]);
  if (!result || result.trainingId !== trainingId) notFound();
  const Icon = result.passed ? CheckCircle2 : XCircle;

  return (
    <div className="space-y-6">
      <Link
        href={`/portal/trainings/${trainingId}`}
        className="focus-visible:ring-ring text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center gap-1 rounded-md text-sm outline-none focus-visible:ring-2"
      >
        <ChevronLeft aria-hidden="true" className="size-4" /> {training?.title ?? 'Capacitación'}
      </Link>

      <section
        aria-labelledby="attempt-result"
        className={cn(
          'space-y-3 rounded-xl p-6 text-center',
          result.passed ? 'bg-ok-subtle text-ok-subtle-foreground' : 'bg-danger-subtle text-danger-subtle-foreground'
        )}
      >
        <Icon aria-hidden="true" className="mx-auto size-12" />
        <h1 id="attempt-result" className="text-2xl font-semibold text-balance">
          {result.passed ? '¡Aprobaste!' : 'No aprobaste esta vez'}
        </h1>
        <p className="text-4xl font-bold tabular-nums">{formatPercent(result.scorePercent)}</p>
        <p className="text-sm tabular-nums">
          {result.scorePoints} de {result.maxPoints} puntos · intento {result.number}
          {training ? ` · se aprueba con el ${training.passingScore} %` : ''}
        </p>
        {result.status === 'expired' && (
          <p className="text-sm">{HSE_ATTEMPT_STATUS_LABELS.expired}: se corrigió con lo que respondiste a tiempo.</p>
        )}
        {result.submittedAt && (
          <p className="text-xs tabular-nums opacity-80">{formatArgentinaDateTime(result.submittedAt)}</p>
        )}
      </section>

      {!result.passed && training && (
        <p className="bg-card rounded-xl border p-4 text-sm text-pretty">
          {training.attemptsLeft > 0
            ? `Te ${training.attemptsLeft === 1 ? 'queda 1 intento' : `quedan ${training.attemptsLeft} intentos`}. Repasá el material antes de volver a rendir.`
            : 'No te quedan intentos. Consultá con el área de HSE.'}
        </p>
      )}

      {result.passed &&
        training?.certificate?.attemptId === result.attemptId &&
        !training.certificate.certificateId && (
          <p className="bg-card rounded-xl border p-4 text-sm text-pretty">
            Te falta firmar la constancia: la encontrás en la capacitación. Con tu firma queda guardada en tu legajo.
          </p>
        )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href={`/portal/trainings/${trainingId}`}
          className="bg-primary text-primary-foreground focus-visible:ring-ring inline-flex min-h-12 w-full items-center justify-center rounded-md px-4 text-sm font-medium outline-none hover:opacity-90 focus-visible:ring-2 sm:w-auto"
        >
          {result.passed && training?.certificate && !training.certificate.certificateId
            ? 'Firmar la constancia'
            : 'Volver a la capacitación'}
        </Link>
        <HseEvaluationPdfButton
          attemptId={result.attemptId}
          scope="portal"
          label="Descargar mi resultado (PDF)"
          accessibleLabel={`Descargar en PDF el resultado del intento ${result.number}`}
        />
      </div>
    </div>
  );
}
