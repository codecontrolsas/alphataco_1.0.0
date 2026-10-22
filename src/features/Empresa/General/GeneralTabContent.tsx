import { Skeleton } from '@/components/ui/skeleton';
import KpisTabContent from '@/features/Dashboard/Estadisticas/KPIs/KpisTabContent';
import { _CreateDocumentTypeButton } from '@/features/Documentacion/TiposDocumentos/components/_CreateDocumentTypeButton';
import CompanyDocsList from '@/features/Empresa/General/Documentacion/components/CompanyDocsList';
import { CompanyDocsTableSkeleton } from '@/features/Documentacion/DocumentosEmpresa/fallback/CompanyDocsTableSkeleton';
import { PermissionGuardServer } from '@/features/Permissions/components/PermissionGuardServer';
import { createTabVisibilityChecker } from '@/features/Permissions/lib/tab-visibility';
import { ViewManagerServer } from '@/features/TabsManager/ViewManagerServer';
import { document_applies } from '@/generated/prisma/enums';
import { CatalogTableSurface } from '@/shared/components/common/CatalogFormSheet';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { Suspense } from 'react';
import UsersTabComponent from '../Usuarios/UsersTabComponent';
import CostCenterList from './CostCenter/CostCenterList';
import { CostCenterTableSkeleton } from './CostCenter/fallback/CostCenterTableSkeleton';
import FiscalDataTabContent from './FiscalData/FiscalDataTabContent';
import { FiscalDataSkeleton } from './FiscalData/fallback/FiscalDataSkeleton';
import HierarchyList from './Hierarchy/HierarchyList';
import { HierarchyTableSkeleton } from './Hierarchy/fallback/HierarchyTableSkeleton';
import OrgChartSection from './OrgChart/OrgChartSection';
import { OrgChartSkeleton } from './OrgChart/fallback/OrgChartSkeleton';
import CompanyComponent from './components/company/CompanyComponent';
import { CompanySkeleton } from './fallback/CompanySkeleton';
import { TableSubtabSkeleton } from './fallback/SubtabSkeletons';

/** Configuración › Organización: ficha de la empresa y todo lo que define su estructura. */
export default function GeneralTabContent({
  searchParams,
  permissions,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
  permissions: Record<string, boolean>;
}) {
  // Cada bloque de la vista fusionada se renderiza solo si su pestaña es visible
  const isTabVisible = createTabVisibilityChecker(permissions);
  const canSee = (tabSlug: string) => isTabVisible('configuracion', tabSlug);

  return (
    <ViewManagerServer
      paramName="subtab"
      searchParams={searchParams}
      defaultView="company"
      permissions={permissions}
      preserveParams={['tab']}
      layout="rail"
      ariaLabel="Organización"
      views={[
        {
          value: 'company',
          label: 'Datos de la empresa',
          description: 'Identificación, contacto y ubicación',
          moduleSlug: 'configuracion',
          tabSlug: 'company',
          content: (
            <Suspense fallback={<CompanySkeleton />}>
              <CompanyComponent />
            </Suspense>
          ),
        },
        {
          value: 'datos-fiscales',
          label: 'Datos fiscales',
          description: 'Facturación electrónica ARCA: emisor, puntos de venta y certificado',
          moduleSlug: 'configuracion',
          tabSlug: 'datos-fiscales',
          content: (
            <SectionCard>
              <Suspense fallback={<FiscalDataSkeleton />}>
                <FiscalDataTabContent searchParams={searchParams} />
              </Suspense>
            </SectionCard>
          ),
        },
        {
          value: 'cost-center',
          label: 'Estructura',
          description: 'Organigrama, sectores y centros de costo de la empresa',
          aliases: ['organigrama', 'org-chart'],
          visibleWhenAny: [
            { moduleSlug: 'configuracion', tabSlug: 'org-chart' },
            { moduleSlug: 'configuracion', tabSlug: 'organigrama' },
            { moduleSlug: 'configuracion', tabSlug: 'cost-center' },
          ],
          content: (
            <div className="flex min-w-0 flex-col gap-6">
              {canSee('org-chart') ? (
                <CatalogTableSurface
                  id="org-chart"
                  title="Organigrama"
                  description="Cargos de cada sector, a quién reportan y quién es su titular"
                >
                  <Suspense fallback={<OrgChartSkeleton />}>
                    <OrgChartSection permissions={permissions} />
                  </Suspense>
                </CatalogTableSurface>
              ) : null}
              {canSee('organigrama') ? (
                <CatalogTableSurface
                  id="organigrama"
                  title="Sectores"
                  description="Sectores de la empresa y de qué sector depende cada uno"
                >
                  <Suspense fallback={<HierarchyTableSkeleton />}>
                    <HierarchyList searchParams={searchParams} permissions={permissions} />
                  </Suspense>
                </CatalogTableSurface>
              ) : null}
              {canSee('cost-center') ? (
                <CatalogTableSurface
                  id="cost-center"
                  title="Centros de costo"
                  description="Gestión de centros de costos"
                >
                  <Suspense fallback={<CostCenterTableSkeleton />}>
                    <CostCenterList searchParams={searchParams} permissions={permissions} />
                  </Suspense>
                </CatalogTableSurface>
              ) : null}
            </div>
          ),
        },
        {
          value: 'documentacion',
          label: 'Documentos de la empresa',
          description: 'Documentación que se exige y se carga a nivel empresa',
          moduleSlug: 'configuracion',
          tabSlug: 'documentacion',
          content: (
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <PermissionGuardServer module="configuracion" tab="documentacion" action="create">
                  <_CreateDocumentTypeButton defaultApplies={document_applies.Empresa} />
                </PermissionGuardServer>
              </div>
              <SectionCard>
                <Suspense fallback={<CompanyDocsTableSkeleton />}>
                  <CompanyDocsList searchParams={searchParams} />
                </Suspense>
              </SectionCard>
            </div>
          ),
        },
        {
          value: 'kpis',
          label: 'Indicadores',
          description: 'Indicadores clave de la empresa',
          moduleSlug: 'configuracion',
          tabSlug: 'kpis',
          content: (
            <Suspense fallback={<Skeleton className="h-[300px] w-full rounded-md" />}>
              <KpisTabContent searchParams={searchParams} permissions={permissions} />
            </Suspense>
          ),
        },
        {
          value: 'users',
          label: 'Usuarios y accesos',
          description: 'Usuarios, roles, permisos y accesos externos',
          moduleSlug: 'configuracion',
          tabSlug: 'users',
          content: (
            <Suspense fallback={<TableSubtabSkeleton />}>
              <UsersTabComponent searchParams={searchParams} permissions={permissions} />
            </Suspense>
          ),
        },
      ]}
    />
  );
}
