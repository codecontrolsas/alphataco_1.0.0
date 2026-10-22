import { Suspense } from 'react';

import { getTallerSummaryCached } from '../../lib/section-counts';
import { PipelineLayout, type PipelineStepEntry } from '../components/PipelineLayout';
import type { PipelineStep } from '../types';
import { getTallerPipelineSummary } from './actions/pipeline-summary.server';

import { ApprovalInboxSkeleton } from '@/features/Mantenimiento/ApprovalInbox/fallback/ApprovalInboxSkeleton';
import { ApprovalInboxTabContent } from '@/features/Mantenimiento/ApprovalInbox/ApprovalInboxTabContent';
import { MaintenanceOrdersSkeleton } from '@/features/Mantenimiento/MaintenanceOrders/fallback/MaintenanceOrdersSkeleton';
import { MaintenanceOrdersTabContent } from '@/features/Mantenimiento/MaintenanceOrders/MaintenanceOrdersTabContent';
import { ConfirmadosTabContent } from '@/features/Mantenimiento/PedidosMantenimiento/Confirmados/ConfirmadosTabContent';
import { PendientesTabContent } from '@/features/Mantenimiento/PedidosMantenimiento/Pendientes/PendientesTabContent';
import { ConfirmadosTableSkeleton, PendientesTableSkeleton } from '@/features/Mantenimiento/PedidosMantenimiento/fallback/PendientesTableSkeleton';
import { StateBlock } from '@/shared/components/common/StateBlock';

const PARAM_NAME = 'taller_step';
const DEFAULT_STEP = 'schedule';

const TALLER_STEPS: PipelineStep[] = [
  {
    id: 'schedule',
    stepNumber: 1,
    label: 'Programación pendiente',
    description: 'Pedidos aprobados sin fecha. Asigná fecha y reparaciones',
    iconName: 'Clock',
    permissionTab: 'pedidos_pendientes',
  },
  {
    id: 'confirmed',
    stepNumber: 2,
    label: 'Para ingreso',
    description: 'Pedidos con fecha asignada. Registrá el ingreso al taller',
    // Calendar (no CheckCircle): el paso está pendiente, y lo que lo define es
    // que ya tiene fecha. El tilde daba a entender que el trabajo estaba hecho.
    iconName: 'Calendar',
    permissionTab: 'pedidos_confirmados',
  },
  {
    id: 'in_workshop',
    stepNumber: 3,
    label: 'En mantenimiento',
    description: 'Equipos activos en taller. Gestioná sectores y OTs',
    iconName: 'Warehouse',
    permissionTab: 'ordenes_mantenimiento',
  },
  {
    id: 'approvals',
    stepNumber: 4,
    label: 'Aprobaciones',
    description: 'Trabajos que requieren tu autorización',
    iconName: 'Inbox',
    permissionTab: 'bandeja_aprobaciones',
  },
];

interface TallerPipelineContentProps {
  searchParams: Record<string, string | string[] | undefined>;
  /** Mapa `modulo:tab:accion -> boolean` del usuario; cada paso exige el `view` de SU tab. */
  permissions: Record<string, boolean>;
}

export async function TallerPipelineContent({ searchParams, permissions }: TallerPipelineContentProps) {
  const visibleSteps = TALLER_STEPS.filter(
    (step) => step.permissionTab && permissions[`mantenimiento:${step.permissionTab}:view`] === true
  );

  if (visibleSteps.length === 0) {
    return (
      <StateBlock variant="noperm" title="Sin acceso" description="No tenés permisos para ver ningún paso de Taller." />
    );
  }

  // Contadores y atención por paso. Nunca rechaza: un paso que falla queda en `null` y la cabecera muestra "—".
  const summary = await getTallerSummaryCached();

  const rawStep = searchParams[PARAM_NAME];
  const initialStep =
    typeof rawStep === 'string' && visibleSteps.some((s) => s.id === rawStep)
      ? rawStep
      : (visibleSteps.find((s) => s.id === DEFAULT_STEP) ?? visibleSteps[0]).id;

  // Todos los pasos se renderizan simultáneamente (show/hide con CSS)
  const allStepContents: PipelineStepEntry[] = [
    {
      id: 'schedule',
      content: (
        <Suspense fallback={<PendientesTableSkeleton />}>
          <PendientesTabContent searchParams={searchParams} />
        </Suspense>
      ),
    },
    {
      id: 'confirmed',
      content: (
        <Suspense fallback={<ConfirmadosTableSkeleton />}>
          <ConfirmadosTabContent searchParams={searchParams} />
        </Suspense>
      ),
    },
    {
      id: 'in_workshop',
      content: (
        <Suspense fallback={<MaintenanceOrdersSkeleton />}>
          <MaintenanceOrdersTabContent searchParams={searchParams} />
        </Suspense>
      ),
    },
    {
      id: 'approvals',
      content: (
        <Suspense fallback={<ApprovalInboxSkeleton />}>
          <ApprovalInboxTabContent />
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
        queryKey: ['maintenance', 'pipeline', 'taller'],
        queryFn: getTallerPipelineSummary,
        initialData: summary,
      }}
      initialStep={initialStep}
      paramName={PARAM_NAME}
      stepContents={stepContents}
    />
  );
}
