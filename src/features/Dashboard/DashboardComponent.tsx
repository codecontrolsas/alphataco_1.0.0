import PrincipalSkeleton from '@/features/Dashboard/Principal/components/PrincipalSkeleton';
import { getUserPermissionsMapServer } from '@/features/Permissions';
import { SectionManagerServer } from '@/features/TabsManager';
import { SectionErrorBoundary } from '@/shared/components/common/SectionErrorBoundary';
import { BarChart3, FileText, Home } from 'lucide-react';
import { Suspense } from 'react';
import DocumentsTabContent from './Documentacion/DocumentsTabContent';
import EstadisticasTabComponent from './Estadisticas/EstadisticasTabComponent';
import PrincipalTabContent from './Principal/PrincipalTabContent';

export default async function DashboardComponent({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  // Obtener permisos (usará cache pre-cargado en layout, sin query adicional)
  const permissions = await getUserPermissionsMapServer();

  return (
    <div>
      {/* Main Tabs con TabsManagerServer */}
      <SectionManagerServer
        paramName="tab"
        searchParams={searchParams}
        defaultTab="principal"
        permissions={permissions} // ← Pasar permisos explícitamente como prop
        sectionNav
        tabs={[
          {
            value: 'principal',
            label: (
              <span className="flex items-center gap-2">
                <Home className="h-4 w-4" />
                Principal
              </span>
            ),
            moduleSlug: 'dashboard',
            tabSlug: 'principal',
            content: (
              <SectionErrorBoundary title="No se pudo mostrar Principal">
                <Suspense fallback={<PrincipalSkeleton />}>
                  <PrincipalTabContent />
                </Suspense>
              </SectionErrorBoundary>
            ),
          },
          {
            value: 'documentacion',
            label: (
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Documentación
              </span>
            ),
            moduleSlug: 'dashboard',
            tabSlug: 'documentacion',
            content: (
              <SectionErrorBoundary title="No se pudo mostrar Documentación">
                <DocumentsTabContent searchParams={searchParams} permissions={permissions} />
              </SectionErrorBoundary>
            ),
          },
          {
            value: 'estadisticas',
            label: (
              <span className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Estadísticas
              </span>
            ),
            moduleSlug: 'dashboard',
            tabSlug: 'estadisticas',
            content: (
              <SectionErrorBoundary title="No se pudo mostrar Estadísticas">
                <EstadisticasTabComponent searchParams={searchParams} permissions={permissions} />
              </SectionErrorBoundary>
            ),
          },
        ]}
      />
    </div>
  );
}
