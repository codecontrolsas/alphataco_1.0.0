import { Card } from '@/components/ui/card';
import MantenimientoTabContent from '@/features/Dashboard/Estadisticas/Mantenimiento/MantenimientoTabContent';
import { MantenimientoChartsSkeleton } from '@/features/Dashboard/Estadisticas/Mantenimiento/fallback/MantenimientoChartsSkeleton';
import OperacionesTabContent from '@/features/Dashboard/Estadisticas/Operaciones/OperacionesTabContent';
import { OperacionesChartsSkeleton } from '@/features/Dashboard/Estadisticas/Operaciones/fallback/OperacionesChartsSkeleton';
import SalaDeControlTabContent from '@/features/Dashboard/Estadisticas/SalaDeControl/SalaDeControlTabContent';
import { SalaDeControlSkeleton } from '@/features/Dashboard/Estadisticas/SalaDeControl/fallback/SalaDeControlSkeleton';
import { TabsManagerServer } from '@/features/TabsManager';
import { SectionErrorBoundary } from '@/shared/components/common/SectionErrorBoundary';
import FeatureFlagShow from '@/shared/components/posthug/FeatureFlagShow';
import { Calendar, MonitorDot, Users, Wrench } from 'lucide-react';
import { Suspense } from 'react';
import { AbsenteeismDashboard } from './RecursosHumanos/absenteeism-dashboard';
import { RrhhTabSkeleton } from './RecursosHumanos/fallback/RrhhSkeletons';

function EstadisticasTabComponent({
  searchParams,
  permissions,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
  permissions: Record<string, boolean>;
}) {
  return (
    <FeatureFlagShow featureFlagName="mostrar_tab_de_graficos_en_dashboard">
      {/* Nested Tabs para Estadísticas */}
      <TabsManagerServer
        paramName="subtab"
        searchParams={searchParams}
        defaultTab="operaciones"
        permissions={permissions}
        tabs={[
          {
            value: 'operaciones',
            label: (
              <span className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Operaciones
              </span>
            ),
            moduleSlug: 'dashboard',
            tabSlug: 'operaciones',
            content: (
              <Suspense fallback={<OperacionesChartsSkeleton />}>
                <OperacionesTabContent />
              </Suspense>
            ),
          },
          {
            value: 'rrhh',
            label: (
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                RRHH
              </span>
            ),
            moduleSlug: 'dashboard',
            tabSlug: 'rrhh',
            content: (
              <Card className="grid grid-cols-1 gap-3 mb-4 p-4">
                <SectionErrorBoundary title="No se pudo mostrar Recursos Humanos">
                  <Suspense fallback={<RrhhTabSkeleton />}>
                    <AbsenteeismDashboard />
                  </Suspense>
                </SectionErrorBoundary>
              </Card>
            ),
          },
          {
            value: 'mantenimiento',
            label: (
              <span className="flex items-center gap-2">
                <Wrench className="h-4 w-4" />
                Mantenimiento
              </span>
            ),
            moduleSlug: 'dashboard',
            tabSlug: 'mantenimiento',
            content: (
              <Suspense fallback={<MantenimientoChartsSkeleton />}>
                <MantenimientoTabContent />
              </Suspense>
            ),
          },
          {
            value: 'desvios',
            label: (
              <span className="flex items-center gap-2">
                <MonitorDot className="h-4 w-4" />
                Sala de Control
              </span>
            ),
            moduleSlug: 'dashboard',
            tabSlug: 'desvios',
            content: (
              <Suspense fallback={<SalaDeControlSkeleton />}>
                <SalaDeControlTabContent />
              </Suspense>
            ),
          },
        ]}
      />
    </FeatureFlagShow>
  );
}

export default EstadisticasTabComponent;
