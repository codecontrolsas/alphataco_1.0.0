import 'server-only';

import { EmployeeExpiringDocsList } from '@/features/Dashboard/Documentacion/Empleados/EmployeeExpiringDocsList';
import {
  EmployeeExpiringCounter,
  VehicleExpiringCounter,
} from '@/features/Dashboard/Documentacion/ExpiringDocsCounters';
import { VehicleExpiringDocsList } from '@/features/Dashboard/Documentacion/Vehiculos/VehicleExpiringDocsList';
import { ExpiringDocsSkeleton } from '@/features/Dashboard/Documentacion/fallback/ExpiringDocsSkeleton';
import GraficosTabContent from '@/features/Dashboard/Estadisticas/KPIs/Graficos/GraficosTabContent';
import { GraficosGridSkeleton } from '@/features/Dashboard/Estadisticas/KPIs/Graficos/fallback/KpiChartSkeleton';
import { KpisIndicadoresSkeleton } from '@/features/Dashboard/Estadisticas/KPIs/Indicadores/fallback/KpisIndicadoresSkeleton';
import KpisIndicadoresContent from '@/features/Dashboard/Estadisticas/KPIs/KpisIndicadoresContent';
import MantenimientoTabContent from '@/features/Dashboard/Estadisticas/Mantenimiento/MantenimientoTabContent';
import { MantenimientoChartsSkeleton } from '@/features/Dashboard/Estadisticas/Mantenimiento/fallback/MantenimientoChartsSkeleton';
import OperacionesTabContent from '@/features/Dashboard/Estadisticas/Operaciones/OperacionesTabContent';
import { OperacionesChartsSkeleton } from '@/features/Dashboard/Estadisticas/Operaciones/fallback/OperacionesChartsSkeleton';
import { AbsenteeismTrendChart } from '@/features/Dashboard/Estadisticas/RecursosHumanos/components/AbsenteeismTrendChart';
import { DepartmentAbsenceCharts } from '@/features/Dashboard/Estadisticas/RecursosHumanos/components/DepartmentAbsenceCharts';
import { DepartmentSummaryTable } from '@/features/Dashboard/Estadisticas/RecursosHumanos/components/DepartmentSummaryTable';
import { DetailedAbsenceTable } from '@/features/Dashboard/Estadisticas/RecursosHumanos/components/DetailedAbsenceTable';
import { HeadcountTrendChart } from '@/features/Dashboard/Estadisticas/RecursosHumanos/components/HeadcountTrendChart';
import { SummaryCards } from '@/features/Dashboard/Estadisticas/RecursosHumanos/components/SummaryCards';
import { EmployeeAbsenceTable } from '@/features/Dashboard/Estadisticas/RecursosHumanos/components/employee-absence-table';
import EmployeeDistributionCharts from '@/features/Dashboard/Estadisticas/RecursosHumanos/components/employee-distribution-charts';
import {
  ChartCardSkeleton,
  DistributionSkeleton,
  SummaryCardsSkeleton,
  TableCardSkeleton,
} from '@/features/Dashboard/Estadisticas/RecursosHumanos/fallback/RrhhSkeletons';
import {
  DesviosSection,
  OrderManagementSection,
} from '@/features/Dashboard/Estadisticas/SalaDeControl/components/SalaDeControlSections';
import { DesviosChartsSkeleton } from '@/features/Dashboard/Estadisticas/SalaDeControl/fallback/DesviosChartsSkeleton';
import { OrderManagementSkeleton } from '@/features/Dashboard/Estadisticas/SalaDeControl/fallback/OrderManagementSkeleton';
import { EquipmentFleetSection } from '@/features/Dashboard/Principal/components/EquipmentFleetSection';
import { EquipmentOperationSection } from '@/features/Dashboard/Principal/components/EquipmentOperationSection';
import {
  ActiveVehiclesCard,
  ChecklistMissingKpi,
  EmployeesCard,
  OperativeFleetCard,
  OperativityCard,
  TodayServicesCard,
} from '@/features/Dashboard/Principal/components/KpiCards';
import { RrhhSection } from '@/features/Dashboard/Principal/components/RrhhSection';
import { ServicesSectionLoader } from '@/features/Dashboard/Principal/components/ServicesSectionLoader';
import { KpiCardSkeleton } from '@/features/Dashboard/Principal/fallback/KpiCardsSkeleton';
import { SectionSkeleton } from '@/features/Dashboard/Principal/fallback/SectionSkeleton';
import type { WidgetDefinition, WidgetId } from '@/features/Dashboard/lib/widget-registry';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { SectionErrorBoundary } from '@/shared/components/common/SectionErrorBoundary';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { Suspense, type ReactNode } from 'react';

type SearchParams = Record<string, string | string[] | undefined>;

interface WidgetRenderer {
  skeleton: ReactNode;
  render: (ctx: { searchParams: SearchParams }) => ReactNode;
  /**
   * El contenido no trae título propio (una tabla suelta): el tablero lo envuelve en una
   * superficie con el título del widget y, opcionalmente, un contador.
   */
  frame?: { counter?: ReactNode };
}

/** Gráficos de RRHH que se consultan desde el cliente con el id de empresa. */
async function HrAbsenteeismTrend() {
  return <AbsenteeismTrendChart companyId={await getActiveCompanyId()} />;
}

async function HrHeadcountTrend() {
  return <HeadcountTrendChart companyId={await getActiveCompanyId()} />;
}

const counterFallback = <span aria-hidden="true" className="bg-muted inline-block h-4 w-6 animate-pulse rounded" />;

/** Cómo se dibuja cada widget del registro. Mismos componentes y cálculos que las secciones anteriores. */
const RENDERERS: Record<WidgetId, WidgetRenderer> = {
  'kpi-employees': { skeleton: <KpiCardSkeleton />, render: () => <EmployeesCard /> },
  'kpi-active-vehicles': { skeleton: <KpiCardSkeleton />, render: () => <ActiveVehiclesCard /> },
  'kpi-operative-fleet': { skeleton: <KpiCardSkeleton />, render: () => <OperativeFleetCard /> },
  'kpi-today-services': { skeleton: <KpiCardSkeleton />, render: () => <TodayServicesCard /> },
  'kpi-operativity': { skeleton: <KpiCardSkeleton />, render: () => <OperativityCard /> },
  'kpi-checklist-missing': { skeleton: <KpiCardSkeleton />, render: () => <ChecklistMissingKpi /> },
  'services-today': { skeleton: <SectionSkeleton />, render: () => <ServicesSectionLoader /> },
  'hr-today': {
    skeleton: <SectionSkeleton />,
    render: ({ searchParams }) => <RrhhSection searchParams={searchParams} />,
  },
  'equipment-operation': {
    skeleton: <SectionSkeleton />,
    render: ({ searchParams }) => <EquipmentOperationSection searchParams={searchParams} />,
  },
  'equipment-fleet': { skeleton: <SectionSkeleton />, render: () => <EquipmentFleetSection /> },
  'expiring-employee-docs': {
    skeleton: <ExpiringDocsSkeleton />,
    render: ({ searchParams }) => <EmployeeExpiringDocsList searchParams={searchParams} />,
    frame: {
      counter: (
        <Suspense fallback={counterFallback}>
          <EmployeeExpiringCounter />
        </Suspense>
      ),
    },
  },
  'expiring-vehicle-docs': {
    skeleton: <ExpiringDocsSkeleton />,
    render: ({ searchParams }) => <VehicleExpiringDocsList searchParams={searchParams} />,
    frame: {
      counter: (
        <Suspense fallback={counterFallback}>
          <VehicleExpiringCounter />
        </Suspense>
      ),
    },
  },
  'operations-charts': { skeleton: <OperacionesChartsSkeleton />, render: () => <OperacionesTabContent /> },
  'maintenance-charts': { skeleton: <MantenimientoChartsSkeleton />, render: () => <MantenimientoTabContent /> },
  'hr-summary': { skeleton: <SummaryCardsSkeleton />, render: () => <SummaryCards /> },
  'hr-absenteeism-trend': { skeleton: <ChartCardSkeleton />, render: () => <HrAbsenteeismTrend /> },
  'hr-absence-reasons': { skeleton: <ChartCardSkeleton height={300} />, render: () => <DepartmentAbsenceCharts /> },
  'hr-department-summary': { skeleton: <TableCardSkeleton />, render: () => <DepartmentSummaryTable /> },
  'hr-daily-absence': { skeleton: <TableCardSkeleton />, render: () => <DetailedAbsenceTable /> },
  'hr-distribution': { skeleton: <DistributionSkeleton />, render: () => <EmployeeDistributionCharts /> },
  'hr-headcount-trend': { skeleton: <ChartCardSkeleton />, render: () => <HrHeadcountTrend /> },
  'hr-employee-absence': { skeleton: <TableCardSkeleton rows={8} />, render: () => <EmployeeAbsenceTable /> },
  'deviations-series': { skeleton: <DesviosChartsSkeleton />, render: () => <DesviosSection /> },
  'order-management': { skeleton: <OrderManagementSkeleton />, render: () => <OrderManagementSection /> },
  'kpi-charts': { skeleton: <GraficosGridSkeleton />, render: () => <GraficosTabContent /> },
  'kpi-indicators': {
    skeleton: <KpisIndicadoresSkeleton />,
    render: ({ searchParams }) => <KpisIndicadoresContent searchParams={searchParams} />,
    frame: {},
  },
};

/**
 * Árbol de un widget: su propio límite de error y su propio `<Suspense>` con skeleton, así el más
 * lento no demora a los demás y uno que falla no tira abajo el tablero.
 */
export function renderWidget(widget: WidgetDefinition, searchParams: SearchParams): ReactNode {
  const renderer = RENDERERS[widget.id as WidgetId];
  if (!renderer) return null;

  const body = (
    <SectionErrorBoundary title={`No se pudo mostrar «${widget.title}»`}>
      <Suspense fallback={renderer.skeleton}>{renderer.render({ searchParams })}</Suspense>
    </SectionErrorBoundary>
  );

  if (!renderer.frame) return body;

  return (
    <SectionCard
      className="@container min-w-0"
      title={
        <span className="inline-flex items-center gap-2">
          {widget.title}
          {renderer.frame.counter ? (
            <span className="bg-muted text-muted-foreground rounded-md px-1.5 text-xs font-medium">
              {renderer.frame.counter}
            </span>
          ) : null}
        </span>
      }
      description={widget.description}
    >
      {body}
    </SectionCard>
  );
}
