import { canViewDashboard } from '@/features/Dashboard/lib/permissions.server';
import { DashboardNoPermission } from '@/features/Dashboard/shared/DashboardNoPermission';
import { ChartColorVars } from '@/features/Dashboard/shared/charts/ChartColorVars';
import { SectionErrorBoundary } from '@/shared/components/common/SectionErrorBoundary';
import { Suspense } from 'react';
import { EquipmentFleetSection } from './components/EquipmentFleetSection';
import { EquipmentOperationSection } from './components/EquipmentOperationSection';
import { KpiCardsRow } from './components/KpiCardsRow';
import { RrhhSection } from './components/RrhhSection';
import { ServicesSectionLoader } from './components/ServicesSectionLoader';
import { SectionSkeleton } from './fallback/SectionSkeleton';

export default async function PrincipalTabContent() {
  if (!(await canViewDashboard('principal'))) return <DashboardNoPermission />;

  return (
    // El atributo `data-dashboard-colors` es el ancestro común de TODOS los gráficos y KPI de la pestaña:
    // las variables --dash-* de `ChartColorVars` (con su versión oscura) se resuelven desde acá.
    <section data-dashboard-colors="" className="flex flex-col gap-4 mb-4">
      <ChartColorVars />

      {/* Cada tarjeta tiene su propio Suspense y manejo de error dentro de la fila. */}
      <KpiCardsRow />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <SectionErrorBoundary title="No se pudo mostrar Servicios del Día">
          <Suspense fallback={<SectionSkeleton />}>
            <ServicesSectionLoader />
          </Suspense>
        </SectionErrorBoundary>

        <SectionErrorBoundary title="No se pudo mostrar Recursos Humanos">
          <Suspense fallback={<SectionSkeleton />}>
            <RrhhSection />
          </Suspense>
        </SectionErrorBoundary>

        <SectionErrorBoundary title="No se pudo mostrar Estado de Equipos">
          <Suspense fallback={<SectionSkeleton />}>
            <EquipmentOperationSection />
          </Suspense>
        </SectionErrorBoundary>

        <SectionErrorBoundary title="No se pudo mostrar Estado de Flota">
          <Suspense fallback={<SectionSkeleton />}>
            <EquipmentFleetSection />
          </Suspense>
        </SectionErrorBoundary>
      </div>
    </section>
  );
}
