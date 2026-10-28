import { HseStatusBadge } from '@/features/Hse/components/HseStatusBadge';
import { HSE_TRAINING_KIND_LABELS } from '@/features/Hse/lib/constants';
import { HSE_ASSIGNMENT_STATUS_UI, HSE_ATTEMPT_STATUS_UI } from '@/features/Hse/lib/status-presentation';
import { formatPercent } from '@/features/Hse/lib/training-status';
import { getMyHseTraining, type PortalHseTrainingDetail } from '@/features/Portal/actions/hse-trainings.queries';
import { getPortalEmployeeForPage } from '@/features/Portal/actions/perimeter';
import { formatArgentinaDateTime, formatArgentinaDay } from '@/shared/lib/argentina-time';
import { CheckCircle2, ChevronLeft, Download, ExternalLink, FileText, Link2 } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { HseCertificatePanel } from './HseCertificatePanel';
import { HseMaterialReadButton } from './HseMaterialReadButton';
import { HseStartAttemptButton } from './HseStartAttemptButton';

const actionLink =
  'focus-visible:ring-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2';

/** Qué le falta al empleado para rendir (lo mismo que controla la base al empezar), o null si puede. */
function blocker(t: PortalHseTrainingDetail): string | null {
  if (t.openAttemptId) return null;
  if (t.status === 'passed') return null;
  if (t.status === 'failed' || t.attemptsLeft === 0) return 'No te quedan intentos. Consultá con el área de HSE.';
  if (t.questions === 0) return 'El examen todavía no tiene preguntas.';
  if (t.pendingMaterials > 0)
    return t.pendingMaterials === 1
      ? 'Antes de rendir tenés que leer el material obligatorio y marcarlo como leído.'
      : `Antes de rendir tenés que leer ${t.pendingMaterials} materiales obligatorios y marcarlos como leídos.`;
  return null;
}

/** Una capacitación del empleado: estado, material (con su lectura), examen e intentos. Lo que no es suyo → 404. */
export async function HseTrainingView({ trainingId }: { trainingId: string }) {
  const employee = await getPortalEmployeeForPage();
  const training = await getMyHseTraining(employee, trainingId);
  if (!training) notFound();

  const reason = blocker(training);
  const canStart = training.status !== 'passed' && reason === null;
  const passedAttempt = training.certificate
    ? training.attempts.find((a) => a.id === training.certificate?.attemptId)
    : undefined;

  return (
    <div className="space-y-6">
      <Link
        href="/portal/trainings"
        className="focus-visible:ring-ring text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center gap-1 rounded-md text-sm outline-none focus-visible:ring-2"
      >
        <ChevronLeft aria-hidden="true" className="size-4" /> Mis capacitaciones
      </Link>

      <header className="space-y-2">
        <HseStatusBadge ui={HSE_ASSIGNMENT_STATUS_UI[training.status]} />
        <h1 className="text-2xl font-semibold tracking-tight text-balance break-words">{training.title}</h1>
        <p className="text-muted-foreground text-sm">{HSE_TRAINING_KIND_LABELS[training.kind]}</p>
        {training.description && <p className="text-pretty whitespace-pre-line">{training.description}</p>}
      </header>

      {training.status === 'passed' && (
        <section
          aria-labelledby="training-passed"
          className="bg-ok-subtle text-ok-subtle-foreground flex gap-3 rounded-xl p-4"
        >
          <CheckCircle2 aria-hidden="true" className="size-6 shrink-0" />
          <div className="space-y-0.5">
            <h2 id="training-passed" className="font-medium">
              Aprobaste esta capacitación
            </h2>
            <p className="text-sm text-pretty">
              {training.passedAt && `El ${formatArgentinaDay(training.passedAt)}. `}
              {training.validUntil
                ? `Vigente hasta el ${moment(training.validUntil, 'YYYY-MM-DD').format('DD/MM/YYYY')}.`
                : 'No vence.'}
            </p>
          </div>
        </section>
      )}

      {training.certificate && (
        <HseCertificatePanel
          trainingTitle={training.title}
          attemptId={training.certificate.attemptId}
          certificateId={training.certificate.certificateId}
          signedAt={training.certificate.signedAt}
          employeeName={`${employee.lastname} ${employee.firstname}`.trim()}
          employeeFile={employee.file}
          scoreText={passedAttempt ? `${formatPercent(passedAttempt.scorePercent)} · aprobado` : 'Aprobado'}
        />
      )}

      <section aria-labelledby="training-materials" className="space-y-3">
        <h2 id="training-materials" className="font-semibold">
          Material
        </h2>
        {training.materials.length === 0 ? (
          <p className="text-muted-foreground text-sm">Esta capacitación no tiene material para leer.</p>
        ) : (
          <ul className="space-y-3">
            {training.materials.map((m) => {
              const Icon = m.kind === 'file' ? FileText : Link2;
              return (
                <li key={m.id} className="bg-card space-y-3 rounded-xl border p-4">
                  <div className="flex items-start gap-3">
                    <Icon aria-hidden="true" className="text-muted-foreground mt-0.5 size-5 shrink-0" />
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium text-pretty break-words">{m.title}</p>
                      <p className="text-muted-foreground text-sm">
                        {m.isRequired ? 'Lectura obligatoria' : 'Opcional'}
                        {m.readAt ? ` · leído el ${formatArgentinaDay(m.readAt)}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:flex sm:flex-wrap">
                    {m.url && (
                      <a href={m.url} target="_blank" rel="noopener noreferrer" className={actionLink}>
                        <ExternalLink aria-hidden="true" className="size-4" />
                        {m.kind === 'file' ? 'Abrir el PDF' : 'Abrir el enlace'}
                        <span className="sr-only"> «{m.title}» (se abre en otra pestaña)</span>
                      </a>
                    )}
                    {m.downloadUrl && (
                      <a href={m.downloadUrl} className={actionLink}>
                        <Download aria-hidden="true" className="size-4" /> Descargar
                        <span className="sr-only"> «{m.title}»</span>
                      </a>
                    )}
                    {!m.readAt && training.status !== 'passed' && (
                      <HseMaterialReadButton materialId={m.id} trainingId={training.trainingId} title={m.title} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="training-exam" className="bg-card space-y-3 rounded-xl border p-4">
        <h2 id="training-exam" className="font-semibold">
          Examen
        </h2>
        <ul className="text-muted-foreground space-y-1 text-sm">
          <li>
            {training.questions} pregunta{training.questions === 1 ? '' : 's'} · aprobás con el{' '}
            <span className="tabular-nums">{training.passingScore} %</span> de los puntos
          </li>
          <li>
            {training.timeLimitMinutes ? `${training.timeLimitMinutes} minutos para responder` : 'Sin límite de tiempo'}
          </li>
          {training.status !== 'passed' && (
            <li className="tabular-nums">
              Te quedan {training.attemptsLeft} de {training.maxAttempts} intento{training.maxAttempts === 1 ? '' : 's'}
            </li>
          )}
        </ul>
        {reason && (
          <p className="bg-warn-subtle text-warn-subtle-foreground rounded-lg p-3 text-sm text-pretty" role="status">
            {reason}
          </p>
        )}
        {(canStart || training.openAttemptId) && (
          <HseStartAttemptButton
            trainingId={training.trainingId}
            resume={training.openAttemptId !== null}
            attemptsLeft={training.attemptsLeft}
            timeLimitMinutes={training.timeLimitMinutes}
            questions={training.questions}
          />
        )}
      </section>

      {training.attempts.length > 0 && (
        <section aria-labelledby="training-attempts" className="space-y-3">
          <h2 id="training-attempts" className="font-semibold">
            Tus intentos
          </h2>
          <ul className="space-y-2">
            {training.attempts.map((a) => (
              <li
                key={a.id}
                className="bg-card flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-medium tabular-nums">Intento {a.number}</p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {formatArgentinaDateTime(a.submittedAt ?? a.startedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {a.status === 'in_progress' ? (
                    <HseStatusBadge ui={HSE_ATTEMPT_STATUS_UI.in_progress} />
                  ) : (
                    <>
                      <span className="text-sm font-semibold tabular-nums">{formatPercent(a.scorePercent)}</span>
                      <span
                        className={
                          a.passed
                            ? 'text-ok-subtle-foreground text-sm font-medium'
                            : 'text-danger-subtle-foreground text-sm font-medium'
                        }
                      >
                        {a.passed ? 'Aprobado' : 'Desaprobado'}
                      </span>
                      {a.status === 'expired' && <HseStatusBadge ui={HSE_ATTEMPT_STATUS_UI.expired} />}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
