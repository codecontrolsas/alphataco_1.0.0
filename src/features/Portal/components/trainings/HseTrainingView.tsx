import { buttonVariants } from '@/components/ui/button';
import { HseEvaluationPdfButton } from '@/features/Hse/components/HseEvaluationPdfButton';
import { HSE_TRAINING_KIND_LABELS } from '@/features/Hse/lib/constants';
import { HSE_ASSIGNMENT_STATUS_UI, HSE_ATTEMPT_STATUS_UI } from '@/features/Hse/lib/status-presentation';
import { formatPercent } from '@/features/Hse/lib/training-status';
import { getMyHseTraining, type PortalHseTrainingDetail } from '@/features/Portal/actions/hse-trainings.queries';
import { ATTEMPT_RESULT_UI } from '@/features/Portal/lib/training-copy';
import { requirePortalSection } from '@/features/Portal/navigation/sections.server';
import { cn } from '@/lib/utils';
import { formatArgentinaDateTime, formatArgentinaDay, formatDateAr } from '@/shared/lib/argentina-time';
import { Check, CheckCircle2, Download, ExternalLink, Eye, FileText, Link2 } from 'lucide-react';
import { notFound } from 'next/navigation';
import { PageHeader } from '../ui/PageHeader';
import { StatusBadge } from '../ui/StatusBadge';
import { HseCertificatePanel } from './HseCertificatePanel';
import { HseMaterialOpenLink } from './HseMaterialOpenLink';
import { HseMaterialReadButton } from './HseMaterialReadButton';
import { HseStartAttemptButton } from './HseStartAttemptButton';

const outlineAction = cn(buttonVariants({ variant: 'outline' }), 'min-h-11 justify-center');

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

type StepState = 'done' | 'current' | 'todo';

/** Los tres pasos de una capacitación (material → examen → constancia), derivados de lo que ya hizo el empleado. */
function stepsOf(t: PortalHseTrainingDetail): { label: string; hint: string; state: StepState }[] {
  const materialDone = t.pendingMaterials === 0;
  const examDone = t.status === 'passed';
  const signed = Boolean(t.certificate?.certificateId);
  return [
    {
      label: 'Material',
      hint:
        t.materials.length === 0
          ? 'Sin material'
          : materialDone
            ? 'Leído'
            : t.pendingMaterials === 1
              ? 'Falta 1 obligatorio'
              : `Faltan ${t.pendingMaterials} obligatorios`,
      state: materialDone ? 'done' : 'current',
    },
    {
      label: 'Examen',
      hint: examDone ? 'Aprobado' : t.openAttemptId ? 'En curso' : `${t.attemptsLeft} de ${t.maxAttempts} intentos`,
      state: examDone ? 'done' : materialDone ? 'current' : 'todo',
    },
    {
      label: 'Constancia',
      hint: signed ? 'Firmada' : examDone ? 'Por firmar' : 'Al aprobar',
      state: signed ? 'done' : examDone ? 'current' : 'todo',
    },
  ];
}

function Steps({ training }: { training: PortalHseTrainingDetail }) {
  const steps = stepsOf(training);
  return (
    <ol aria-label="Pasos de la capacitación" className="grid grid-cols-3 gap-2">
      {steps.map((step, i) => (
        <li
          key={step.label}
          aria-current={step.state === 'current' ? 'step' : undefined}
          className={cn(
            'min-w-0 rounded-xl border p-2.5 sm:p-3',
            step.state === 'current' && 'border-brand/50 bg-brand-subtle/30',
            step.state === 'done' && 'bg-card'
          )}
        >
          <span className="flex items-center gap-1.5 sm:gap-2">
            <span
              aria-hidden="true"
              className={cn(
                'flex size-5 sm:size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                step.state === 'done'
                  ? 'bg-ok-subtle text-ok-subtle-foreground'
                  : step.state === 'current'
                    ? 'bg-brand text-brand-foreground'
                    : 'bg-muted text-muted-foreground'
              )}
            >
              {step.state === 'done' ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className="min-w-0 text-[0.8125rem] font-medium break-words sm:text-sm">{step.label}</span>
          </span>
          <span className="text-muted-foreground mt-1 block text-xs text-pretty">
            <span className="sr-only">
              {step.state === 'done' ? 'Hecho: ' : step.state === 'current' ? 'Ahora: ' : 'Después: '}
            </span>
            {step.hint}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Una capacitación del empleado: pasos, material (con su lectura), examen, constancia e intentos. Lo ajeno → 404. */
export async function HseTrainingView({ trainingId }: { trainingId: string }) {
  const employee = await requirePortalSection('trainings');
  const training = await getMyHseTraining(employee, trainingId);
  if (!training) notFound();

  const reason = blocker(training);
  const canStart = training.status !== 'passed' && reason === null;
  const passedAttempt = training.certificate
    ? training.attempts.find((a) => a.id === training.certificate?.attemptId)
    : undefined;

  return (
    <div className="space-y-8">
      <PageHeader
        breadcrumbs={[{ label: 'Mis capacitaciones', href: '/portal/trainings' }]}
        status={<StatusBadge ui={HSE_ASSIGNMENT_STATUS_UI[training.status]} />}
        title={training.title}
        description={HSE_TRAINING_KIND_LABELS[training.kind]}
        className="mb-0"
      />

      {training.description && <p className="max-w-prose text-pretty whitespace-pre-line">{training.description}</p>}

      <Steps training={training} />

      {training.status === 'passed' && (
        <section
          aria-labelledby="training-passed"
          className="bg-ok-subtle text-ok-subtle-foreground flex gap-3 rounded-xl p-4"
        >
          <CheckCircle2 aria-hidden="true" className="size-6 shrink-0" />
          <div className="space-y-0.5">
            <h2 id="training-passed" className="font-semibold">
              Aprobaste esta capacitación
            </h2>
            <p className="text-sm text-pretty">
              {training.passedAt && `El ${formatArgentinaDay(training.passedAt)}. `}
              {training.validUntil ? `Vigente hasta el ${formatDateAr(training.validUntil)}.` : 'No vence.'}
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
        <h2 id="training-materials" className="text-base font-semibold">
          Material
        </h2>
        {training.materials.length === 0 ? (
          <p className="text-muted-foreground bg-card rounded-xl border p-4 text-sm">
            Esta capacitación no tiene material para leer.
          </p>
        ) : (
          <ul className="bg-card divide-y rounded-xl border">
            {training.materials.map((m) => {
              const Icon = m.kind === 'file' ? FileText : Link2;
              return (
                <li key={m.id} className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <Icon aria-hidden="true" className="text-muted-foreground mt-0.5 size-5 shrink-0" />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="font-medium text-pretty break-words">{m.title}</p>
                      <p className="text-muted-foreground text-sm">
                        {m.isRequired ? 'Lectura obligatoria' : 'Opcional'}
                        {m.readAt ? (
                          <span className="text-ok-subtle-foreground"> · leído el {formatArgentinaDay(m.readAt)}</span>
                        ) : m.isRequired ? (
                          ' · sin leer'
                        ) : (
                          ''
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:flex sm:flex-wrap">
                    {m.kind === 'file' && m.url && (
                      <HseMaterialOpenLink
                        materialId={m.id}
                        href={`/portal/trainings/${training.trainingId}/material/${m.id}`}
                        className={cn(buttonVariants(), 'min-h-11 justify-center')}
                        trackOpen={!m.readAt}
                      >
                        <Eye aria-hidden="true" className="size-4" /> Ver el material
                        <span className="sr-only"> «{m.title}»</span>
                      </HseMaterialOpenLink>
                    )}
                    {m.kind !== 'file' && m.url && (
                      <HseMaterialOpenLink
                        materialId={m.id}
                        href={m.url}
                        newTab
                        className={outlineAction}
                        trackOpen={!m.readAt}
                      >
                        <ExternalLink aria-hidden="true" className="size-4" /> Abrir el enlace
                        <span className="sr-only"> «{m.title}» (se abre en otra pestaña)</span>
                      </HseMaterialOpenLink>
                    )}
                    {m.downloadUrl && (
                      <HseMaterialOpenLink
                        materialId={m.id}
                        href={m.downloadUrl}
                        className={outlineAction}
                        trackOpen={!m.readAt}
                      >
                        <Download aria-hidden="true" className="size-4" /> Descargar
                        <span className="sr-only"> «{m.title}»</span>
                      </HseMaterialOpenLink>
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

      <section aria-labelledby="training-exam" className="bg-card space-y-4 rounded-xl border p-4 sm:p-6">
        <div className="space-y-1">
          <h2 id="training-exam" className="text-base font-semibold">
            Examen
          </h2>
          <ul className="text-muted-foreground space-y-1 text-sm">
            <li>
              {training.questions} pregunta{training.questions === 1 ? '' : 's'} · aprobás con el{' '}
              <span className="tabular-nums">{training.passingScore} %</span> de los puntos
            </li>
            <li>
              {training.timeLimitMinutes
                ? `${training.timeLimitMinutes} minutos para responder`
                : 'Sin límite de tiempo'}
            </li>
            {training.status !== 'passed' && (
              <li className="tabular-nums">
                Te quedan {training.attemptsLeft} de {training.maxAttempts} intento
                {training.maxAttempts === 1 ? '' : 's'}
              </li>
            )}
          </ul>
        </div>
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
          <h2 id="training-attempts" className="text-base font-semibold">
            Tus intentos
          </h2>
          <ul className="bg-card divide-y rounded-xl border">
            {training.attempts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 p-4">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium tabular-nums">Intento {a.number}</p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {formatArgentinaDateTime(a.submittedAt ?? a.startedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {a.status === 'in_progress' ? (
                    <StatusBadge ui={HSE_ATTEMPT_STATUS_UI.in_progress} />
                  ) : (
                    <>
                      <span className="text-sm font-semibold tabular-nums">{formatPercent(a.scorePercent)}</span>
                      <StatusBadge ui={a.passed ? ATTEMPT_RESULT_UI.passed : ATTEMPT_RESULT_UI.failed} />
                      {a.status === 'expired' && <StatusBadge ui={HSE_ATTEMPT_STATUS_UI.expired} />}
                      <HseEvaluationPdfButton
                        attemptId={a.id}
                        scope="portal"
                        size="sm"
                        variant="ghost"
                        label="PDF"
                        accessibleLabel={`Descargar en PDF el resultado del intento ${a.number}`}
                      />
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
