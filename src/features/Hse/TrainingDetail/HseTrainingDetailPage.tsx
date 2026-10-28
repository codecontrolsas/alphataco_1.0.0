import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { RecordHeader } from '@/shared/components/common/RecordHeader';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { TableSkeleton } from '@/shared/components/skeletons/TableSkeleton';
import { formatArgentinaDateTime, formatDateAr } from '@/shared/lib/argentina-time';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { NewHseRecordButton } from '../Records/components/NewHseRecordButton';
import { getHseTrainingInstructorsAndRecords } from '../actions/records.queries';
import { getHseTrainingDetail, type HseTrainingDetail } from '../actions/trainings.queries';
import { HseStatusBadge } from '../components/HseStatusBadge';
import { InstructorsEditor } from '../components/InstructorsEditor';
import { HSE_ASSIGNMENT_STATUS_LABELS, HSE_EXAM_LIMITS, HSE_TRAINING_KIND_LABELS } from '../lib/constants';
import { HSE_RECORD_STATUS_UI, HSE_TRAINING_STATUS_UI } from '../lib/status-presentation';
import { TrainingComplianceList } from './ComplianceList/TrainingComplianceList';
import { MaterialsSection } from './components/MaterialsSection';
import { QuestionsEditor } from './components/QuestionsEditor';
import { TrainingActions } from './components/TrainingActions';

export async function getHseTrainingTitle(id: string) {
  const training = await getHseTrainingDetail(id).catch(() => null);
  return training ? `${training.title} | HSE` : 'Capacitación | HSE';
}

/** Lo que falta para poder publicar (mismas reglas que valida `publishHseTraining`), o null si está lista. */
function publishBlocker(training: HseTrainingDetail): string | null {
  if (training.targets.length === 0) return 'Falta elegir a quién aplica.';
  if (training.questions.length === 0) return 'Falta agregar al menos una pregunta.';
  const incomplete = training.questions.filter(
    (q) => !q.correctOptionId || q.options.length < HSE_EXAM_LIMITS.minOptions
  ).length;
  if (incomplete > 0) return `Hay ${incomplete} pregunta(s) sin respuesta correcta o con menos de 2 opciones.`;
  return null;
}

/** Detalle de una capacitación: datos, examen, material, destinatarios, cumplimiento y acciones por permiso. */
export async function HseTrainingDetailPage({ id, searchParams }: { id: string; searchParams: DataTableSearchParams }) {
  const [training, canView, canUpdate, canApprove, canDelete, people, canCreateRecord] = await Promise.all([
    getHseTrainingDetail(id),
    checkPermissionServer('hse', 'capacitaciones', 'view'),
    checkPermissionServer('hse', 'capacitaciones', 'update'),
    checkPermissionServer('hse', 'capacitaciones', 'approve'),
    checkPermissionServer('hse', 'capacitaciones', 'delete'),
    getHseTrainingInstructorsAndRecords(id),
    checkPermissionServer('hse', 'actas', 'create'),
  ]);
  if (!canView) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;
  if (!training) notFound();

  const isDraft = training.status === 'draft';
  const editable = isDraft && canUpdate;
  const { summary } = training;
  const assigned = summary.pending + summary.in_progress + summary.passed + summary.failed + summary.expired;

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/hse?tab=capacitaciones"
        className="inline-flex min-h-11 items-center gap-1 rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
      >
        <ChevronLeft aria-hidden="true" className="size-4" /> Capacitaciones
      </Link>

      <RecordHeader
        identity={
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <HseStatusBadge ui={HSE_TRAINING_STATUS_UI[training.status]} />
              <span className="text-sm text-muted-foreground">{HSE_TRAINING_KIND_LABELS[training.kind]}</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{training.title}</h1>
            {training.description && (
              <p className="max-w-prose text-muted-foreground text-pretty whitespace-pre-line">
                {training.description}
              </p>
            )}
          </div>
        }
        actions={
          <TrainingActions
            trainingId={training.id}
            title={training.title}
            status={training.status}
            formValues={training.formValues}
            publishBlocker={publishBlocker(training)}
            can={{ update: canUpdate, approve: canApprove, delete: canDelete }}
          />
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Examen">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Aprueba con</dt>
              <dd className="tabular-nums">{training.passingScore} % de los puntos</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Intentos</dt>
              <dd className="tabular-nums">{training.maxAttempts}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Tiempo</dt>
              <dd className="tabular-nums">
                {training.timeLimitMinutes ? `${training.timeLimitMinutes} minutos` : 'Sin límite'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Orden de las preguntas</dt>
              <dd>{training.shuffleQuestions ? 'Mezclado en cada intento' : 'Fijo'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Vigencia de la aprobación</dt>
              <dd className="tabular-nums">
                {training.validityMonths ? `${training.validityMonths} meses` : 'No vence'}
              </dd>
            </div>
            {training.publishedAt && (
              <div>
                <dt className="text-muted-foreground">Publicada</dt>
                <dd className="tabular-nums">{formatArgentinaDateTime(training.publishedAt)}</dd>
              </div>
            )}
          </dl>
        </SectionCard>

        <SectionCard title="A quién aplica">
          {training.targets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin destinatarios: no se puede publicar hasta elegir a quién aplica.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {training.targets.map((t) => (
                <li key={`${t.kind}:${t.refId ?? ''}`} className="rounded-full border bg-muted/40 px-3 py-1 text-sm">
                  {t.label}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Cumplimiento">
          {isDraft ? (
            <p className="text-sm text-muted-foreground">
              Al publicarla, cada destinatario la va a ver pendiente en su portal.
            </p>
          ) : assigned === 0 ? (
            <p className="text-sm text-muted-foreground">Nadie la tiene asignada en este momento.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {(['passed', 'pending', 'in_progress', 'failed', 'expired'] as const).map((key) => (
                <div key={key}>
                  <dt className="text-muted-foreground">{HSE_ASSIGNMENT_STATUS_LABELS[key]}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{summary[key]}</dd>
                </div>
              ))}
            </dl>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Material"
        description={
          isDraft
            ? 'Lo que el empleado estudia antes de rendir. Lo obligatorio tiene que marcarlo como leído.'
            : 'Congelado al publicar.'
        }
      >
        <MaterialsSection
          trainingId={training.id}
          materials={training.materials}
          editable={editable}
          published={!isDraft}
        />
      </SectionCard>

      <SectionCard
        title="Preguntas"
        description={
          isDraft
            ? 'Opción única. La respuesta correcta se guarda aparte y el portal nunca la recibe.'
            : 'Congeladas al publicar. La respuesta correcta solo se ve acá.'
        }
      >
        <QuestionsEditor
          trainingId={training.id}
          questions={training.questions}
          totalPoints={training.totalPoints}
          editable={editable}
        />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Capacitadores habituales"
          description="Se copian a cada acta nueva y aparecen en la constancia si no hay acta del dictado."
        >
          <InstructorsEditor
            target={{ kind: 'training', id: training.id }}
            instructors={people.instructors}
            editable={canUpdate && training.status !== 'archived'}
            emptyText="Sin capacitadores cargados."
          />
        </SectionCard>
        {people.canViewRecords && (
          <SectionCard
            title="Actas de dictado"
            action={
              !isDraft && canCreateRecord ? (
                <NewHseRecordButton
                  trainings={[{ id: training.id, name: training.title }]}
                  trainingId={training.id}
                  label="Nueva acta"
                />
              ) : undefined
            }
          >
            {isDraft ? (
              <p className="text-sm text-muted-foreground">Se labra un acta cuando la capacitación está publicada.</p>
            ) : people.records.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay actas de esta capacitación.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {people.records.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/dashboard/hse/records/${r.id}?tab=actas`}
                      className="flex min-h-11 flex-wrap items-center justify-between gap-2 p-3 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="font-medium tabular-nums">
                        Acta {r.number} · {formatDateAr(r.heldOn)}
                      </span>
                      <span className="flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
                        {r.present} presentes <HseStatusBadge ui={HSE_RECORD_STATUS_UI[r.status]} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        )}
      </div>

      {!isDraft && (
        <section aria-labelledby="hse-training-compliance" className="space-y-3">
          <h2 id="hse-training-compliance" className="text-lg font-semibold">
            Resultados por empleado
          </h2>
          <Suspense fallback={<TableSkeleton inCard columnCount={8} rowCount={6} />}>
            <TrainingComplianceList searchParams={searchParams} trainingId={training.id} />
          </Suspense>
        </section>
      )}
    </div>
  );
}
