import { StateBlock } from '@/shared/components/common/StateBlock';
import { Suspense } from 'react';
import { getOperacionesSummaryCached } from '../../lib/section-counts';
import { PipelineLayout, type PipelineStepEntry } from '../components/PipelineLayout';
import type { PipelineStep } from '../types';
import { getOperacionesPipelineSummary } from './actions/pipeline-summary.server';

// TabContent components existentes
import { SolicitudesMantenimientoTabContent } from '@/features/Mantenimiento/SolicitudesMantenimiento';
import { SolicitudesTableSkeleton } from '@/features/Mantenimiento/SolicitudesMantenimiento/fallback';
import { WorkshopTrackingSkeleton, WorkshopTrackingTabContent } from '@/features/Mantenimiento/WorkshopTracking';

const PARAM_NAME = 'op_step';
const DEFAULT_STEP = 'validate';

/**
 * Pasos del pipeline de Operaciones.
 *
 * Los pasos "Aprobar Fecha" y "Para Taller" fueron eliminados del circuito:
 * la fecha que programa el taller es directamente la fecha de reparación
 * (ya no requiere aprobación de Operaciones), y la información que mostraba
 * "Para Taller" se migró a Seguimiento con el estado "Pendiente de ingreso a taller".
 */
const OPERACIONES_STEPS: PipelineStep[] = [
  {
    id: 'validate',
    stepNumber: 1,
    label: 'Por validar',
    description: 'Solicitudes nuevas pendientes de tu aprobación',
    iconName: 'ClipboardCheck',
    permissionTab: 'maintenance_requests',
  },
  {
    id: 'in_workshop',
    stepNumber: 2,
    label: 'Seguimiento',
    description: 'Equipos pendientes de ingreso y actualmente en taller',
    iconName: 'Eye',
    permissionTab: 'seguimiento_taller',
  },
];

interface OperacionesPipelineContentProps {
  searchParams: Record<string, string | string[] | undefined>;
  /** Mapa `modulo:tab:accion -> boolean` del usuario; cada paso exige el `view` de SU tab. */
  permissions: Record<string, boolean>;
}

export async function OperacionesPipelineContent({ searchParams, permissions }: OperacionesPipelineContentProps) {
  const visibleSteps = OPERACIONES_STEPS.filter(
    (step) => step.permissionTab && permissions[`mantenimiento:${step.permissionTab}:view`] === true
  );

  if (visibleSteps.length === 0) {
    return (
      <StateBlock
        variant="noperm"
        title="Sin acceso"
        description="No tenés permisos para ver ningún paso de Operaciones."
      />
    );
  }

  // Contadores y atención de la cabecera (mismo `where` que cada tabla). Hidratan el cliente, que los refresca solo.
  const summary = await getOperacionesSummaryCached();

  // Determinar paso inicial desde la URL o usar el default
  const rawStep = searchParams[PARAM_NAME];
  const initialStep =
    typeof rawStep === 'string' && visibleSteps.some((s) => s.id === rawStep)
      ? rawStep
      : (visibleSteps.find((s) => s.id === DEFAULT_STEP) ?? visibleSteps[0]).id;

  // Todos los pasos se renderizan simultáneamente (show/hide con CSS)
  const allStepContents: PipelineStepEntry[] = [
    {
      id: 'validate',
      content: (
        <Suspense fallback={<SolicitudesTableSkeleton />}>
          <SolicitudesMantenimientoTabContent searchParams={searchParams} />
        </Suspense>
      ),
    },
    {
      id: 'in_workshop',
      content: (
        <Suspense fallback={<WorkshopTrackingSkeleton />}>
          <WorkshopTrackingTabContent searchParams={searchParams} />
        </Suspense>
      ),
    },
  ];

  const visibleIds = new Set(visibleSteps.map((step) => step.id));
  const stepContents = allStepContents.filter((entry) => visibleIds.has(entry.id));

  return (
    <PipelineLayout
      steps={visibleSteps}
      summaryQuery={{
        queryKey: ['maintenance', 'pipeline', 'operaciones'],
        queryFn: getOperacionesPipelineSummary,
        initialData: summary,
      }}
      initialStep={initialStep}
      paramName={PARAM_NAME}
      stepContents={stepContents}
    />
  );
}
