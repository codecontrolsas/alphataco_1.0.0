import { canViewDashboard } from '@/features/Dashboard/lib/permissions.server';
import { DashboardNoPermission } from '@/features/Dashboard/shared/DashboardNoPermission';
import { ChartColorVars } from '@/features/Dashboard/shared/charts/ChartColorVars';
import { SectionErrorBoundary } from '@/shared/components/common/SectionErrorBoundary';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { Suspense } from 'react';
import { AbsenteeismTrendChart } from './components/AbsenteeismTrendChart';
import { DepartmentAbsenceCharts } from './components/DepartmentAbsenceCharts';
import { DepartmentSummaryTable } from './components/DepartmentSummaryTable';
import { DetailedAbsenceTable } from './components/DetailedAbsenceTable';
import { HeadcountTrendChart } from './components/HeadcountTrendChart';
import { SummaryCards } from './components/SummaryCards';
import { EmployeeAbsenceTable } from './components/employee-absence-table';
import EmployeeDistributionCharts from './components/employee-distribution-charts';
import {
  ChartCardSkeleton,
  DistributionSkeleton,
  SummaryCardsSkeleton,
  TableCardSkeleton,
} from './fallback/RrhhSkeletons';

export async function AbsenteeismDashboard() {
  if (!(await canViewDashboard('rrhh'))) return <DashboardNoPermission />;

  const companyId = await getActiveCompanyId();

  return (
    // `data-dashboard-colors`: ancestro común de los gráficos de la pestaña; las variables --dash-*
    // (con su versión oscura) de `ChartColorVars` se resuelven desde acá.
    <div data-dashboard-colors="" className="space-y-8">
      <ChartColorVars />

      {/* Cada widget carga y falla por su cuenta: el más lento no demora a los demás. */}
      <SectionErrorBoundary title="No se pudo mostrar el resumen de ausentismo">
        <Suspense fallback={<SummaryCardsSkeleton />}>
          <SummaryCards />
        </Suspense>
      </SectionErrorBoundary>

      <div className="flex flex-wrap gap-8">
        <div className="w-full lg:w-[calc(50%-1rem)] space-y-8">
          <SectionErrorBoundary title="No se pudo mostrar la variación de ausentismo">
            <AbsenteeismTrendChart companyId={companyId} />
          </SectionErrorBoundary>
          <SectionErrorBoundary title="No se pudo mostrar el resumen por sector">
            <Suspense fallback={<TableCardSkeleton />}>
              <DepartmentSummaryTable />
            </Suspense>
          </SectionErrorBoundary>
          <SectionErrorBoundary title="No se pudo mostrar la distribución de empleados">
            <Suspense fallback={<DistributionSkeleton />}>
              <EmployeeDistributionCharts />
            </Suspense>
          </SectionErrorBoundary>
        </div>
        <div className="w-full lg:w-[calc(50%-1rem)] space-y-8">
          <SectionErrorBoundary title="No se pudo mostrar los motivos de ausencia">
            <Suspense fallback={<ChartCardSkeleton height={300} />}>
              <DepartmentAbsenceCharts />
            </Suspense>
          </SectionErrorBoundary>
          <SectionErrorBoundary title="No se pudo mostrar el ausentismo diario">
            <Suspense fallback={<TableCardSkeleton />}>
              <DetailedAbsenceTable />
            </Suspense>
          </SectionErrorBoundary>
          <SectionErrorBoundary title="No se pudo mostrar la variación de dotación">
            <HeadcountTrendChart companyId={companyId} />
          </SectionErrorBoundary>
        </div>
      </div>

      <SectionErrorBoundary title="No se pudo mostrar el detalle de ausencias">
        <Suspense fallback={<TableCardSkeleton rows={8} />}>
          <EmployeeAbsenceTable />
        </Suspense>
      </SectionErrorBoundary>
    </div>
  );
}
