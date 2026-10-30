import { HSE_TRAINING_KIND_LABELS } from '@/features/Hse/lib/constants';
import { HSE_ASSIGNMENT_STATUS_UI } from '@/features/Hse/lib/status-presentation';
import { getMyHseTrainings, type PortalHseTraining } from '@/features/Portal/actions/hse-trainings.queries';
import { PortalListSkeleton } from '@/features/Portal/fallback/PortalListSkeleton';
import { CERTIFICATE_PENDING_UI, trainingNextStep } from '@/features/Portal/lib/training-copy';
import { trainingNeedsAction } from '@/features/Portal/lib/work-summary';
import { requirePortalSection } from '@/features/Portal/navigation/sections.server';
import { CheckCircle2, GraduationCap, Inbox } from 'lucide-react';
import { Suspense } from 'react';
import { DataList, type DataListItem } from '../ui/DataList';
import { EmptyState } from '../ui/EmptyState';
import { PageHeader } from '../ui/PageHeader';
import { SectionCard } from '../ui/SectionCard';
import { StatusBadge } from '../ui/StatusBadge';

function trainingItem(t: PortalHseTraining): DataListItem {
  return {
    key: t.trainingId,
    href: `/portal/trainings/${t.trainingId}`,
    leading: <GraduationCap className="size-5" />,
    title: t.title,
    meta: `${HSE_TRAINING_KIND_LABELS[t.kind]} · ${trainingNextStep(t)}`,
    aside: (
      <>
        <StatusBadge ui={HSE_ASSIGNMENT_STATUS_UI[t.status]} />
        {t.certificatePending && <StatusBadge ui={CERTIFICATE_PENDING_UI} />}
      </>
    ),
  };
}

/** "Mis capacitaciones": encabezado inmediato y la lista en su propio Suspense. */
export function PortalTrainingsPage() {
  return (
    <>
      <PageHeader
        title="Mis capacitaciones"
        description="Leé el material, rendí el examen y firmá la constancia de cada capacitación que te asignaron."
      />
      <Suspense fallback={<PortalListSkeleton label="Cargando tus capacitaciones" />}>
        <HseTrainingList />
      </Suspense>
    </>
  );
}

/** Primero lo que requiere acción (rindiendo, pendiente, vencida, constancia sin firmar), después lo aprobado. */
async function HseTrainingList() {
  const employee = await requirePortalSection('trainings');
  const trainings = await getMyHseTrainings(employee);
  if (trainings.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        headingLevel="h2"
        title="No tenés capacitaciones asignadas"
        description="Cuando la empresa te asigne una capacitación, vas a ver acá el material y el examen."
      />
    );
  }
  const todo = trainings.filter(trainingNeedsAction);
  const done = trainings.filter((t) => !trainingNeedsAction(t));
  return (
    <div className="space-y-8">
      <SectionCard id="trainings-todo" title="Para hacer" count={todo.length} bare={todo.length > 0}>
        {todo.length > 0 ? (
          <DataList items={todo.map(trainingItem)} />
        ) : (
          <EmptyState
            compact
            tone="success"
            icon={CheckCircle2}
            title="Estás al día"
            description="Aprobaste todas tus capacitaciones y firmaste sus constancias."
          />
        )}
      </SectionCard>
      {done.length > 0 && (
        <SectionCard id="trainings-done" title="Aprobadas" count={done.length} bare>
          <DataList items={done.map(trainingItem)} />
        </SectionCard>
      )}
    </div>
  );
}
