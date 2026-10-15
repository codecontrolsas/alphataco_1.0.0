import ClothingCatalogTabContent from '@/features/Clothing/ClothingCatalogTabContent';
import CovenantTreeFileWrapper from '@/features/Empresa/CCT/components/CovenantTreeFileWrapper';
import ContractTypeList from '@/features/Empresa/RRHH/ContractTypes/ContractTypeList';
import { ContractTypeTableSkeleton } from '@/features/Empresa/RRHH/ContractTypes/fallback/ContractTypeTableSkeleton';
import DiagramTypeList from '@/features/Empresa/RRHH/DiagramTypes/DiagramTypeList';
import { DiagramTypeTableSkeleton } from '@/features/Empresa/RRHH/DiagramTypes/fallback/DiagramTypeTableSkeleton';
import { createTabVisibilityChecker } from '@/features/Permissions/lib/tab-visibility';
import { ViewManagerServer } from '@/features/TabsManager';
import { CatalogTableSurface } from '@/shared/components/common/CatalogFormSheet';
import { Suspense } from 'react';
import AptitudesList from './AptitudesTecnicas/AptitudesList';
import { AptitudesTableSkeleton } from './AptitudesTecnicas/fallback/AptitudesTableSkeleton';
import PositionsList from './Positions/PositionsList';
import { PositionsTableSkeleton } from './Positions/fallback/PositionsTableSkeleton';
import WorkDiagramList from './WorkDiagrams/WorkDiagramList';
import { WorkDiagramTableSkeleton } from './WorkDiagrams/fallback/WorkDiagramTableSkeleton';
import { CctSubtabSkeleton } from './fallback/RrhhSubtabSkeleton';

export default function RrhhTabContent({
  searchParams,
  permissions,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
  permissions: Record<string, boolean>;
}) {
  // Cada bloque de una vista fusionada se renderiza solo si su pestaña es visible
  const isTabVisible = createTabVisibilityChecker(permissions);
  const canSee = (tabSlug: string) => isTabVisible('configuracion', tabSlug);

  return (
    <ViewManagerServer
      paramName="subtab"
      searchParams={searchParams}
      defaultView="positions"
      permissions={permissions}
      preserveParams={['tab']}
      layout="rail"
      ariaLabel="Personal"
      views={[
        {
          value: 'positions',
          label: 'Puestos, aptitudes y contratos',
          description: 'Puestos de trabajo, aptitudes técnicas del personal y modalidades de contratación',
          aliases: ['aptitudes', 'contract-types'],
          visibleWhenAny: [
            { moduleSlug: 'configuracion', tabSlug: 'positions' },
            { moduleSlug: 'configuracion', tabSlug: 'aptitudes' },
            { moduleSlug: 'configuracion', tabSlug: 'contract-types' },
          ],
          content: (
            <div className="flex min-w-0 flex-col gap-6">
              {canSee('positions') ? (
                <CatalogTableSurface
                  id="positions"
                  title="Puestos"
                  description="Puestos de trabajo que se asignan al personal"
                >
                  <Suspense fallback={<PositionsTableSkeleton />}>
                    <PositionsList searchParams={searchParams} permissions={permissions} />
                  </Suspense>
                </CatalogTableSurface>
              ) : null}
              {canSee('aptitudes') ? (
                <CatalogTableSurface
                  id="aptitudes"
                  title="Aptitudes técnicas"
                  description="Aptitudes técnicas que puede tener el personal"
                >
                  <Suspense fallback={<AptitudesTableSkeleton />}>
                    <AptitudesList searchParams={searchParams} permissions={permissions} />
                  </Suspense>
                </CatalogTableSurface>
              ) : null}
              {canSee('contract-types') ? (
                <CatalogTableSurface
                  id="contract-types"
                  title="Tipos de contrato"
                  description="Modalidades de contratación del personal"
                >
                  <Suspense fallback={<ContractTypeTableSkeleton />}>
                    <ContractTypeList searchParams={searchParams} permissions={permissions} />
                  </Suspense>
                </CatalogTableSurface>
              ) : null}
            </div>
          ),
        },
        {
          value: 'listado',
          label: 'Diagramas y novedades',
          description: 'Diagramas de trabajo (esquemas de francos y días trabajados) y los tipos de novedad que usan',
          aliases: ['diagrams'],
          visibleWhenAny: [
            { moduleSlug: 'configuracion', tabSlug: 'listado' },
            { moduleSlug: 'configuracion', tabSlug: 'diagrams' },
          ],
          content: (
            <div className="flex min-w-0 flex-col gap-6">
              {canSee('listado') ? (
                <CatalogTableSurface
                  id="listado"
                  title="Diagramas de trabajo"
                  description="Esquemas de francos y días trabajados"
                >
                  <Suspense fallback={<WorkDiagramTableSkeleton />}>
                    <WorkDiagramList searchParams={searchParams} permissions={permissions} />
                  </Suspense>
                </CatalogTableSurface>
              ) : null}
              {canSee('diagrams') ? (
                <CatalogTableSurface
                  id="diagrams"
                  title="Tipos de novedad"
                  description="Tipos de novedad que se registran sobre el personal"
                >
                  <Suspense fallback={<DiagramTypeTableSkeleton />}>
                    <DiagramTypeList searchParams={searchParams} permissions={permissions} />
                  </Suspense>
                </CatalogTableSurface>
              ) : null}
            </div>
          ),
        },
        {
          value: 'convenios',
          label: 'Convenios colectivos',
          description: 'Convenios colectivos de trabajo (CCT) y sus categorías',
          moduleSlug: 'configuracion',
          tabSlug: 'convenios',
          content: (
            <Suspense fallback={<CctSubtabSkeleton />}>
              <CovenantTreeFileWrapper />
            </Suspense>
          ),
        },
        {
          value: 'items-maestro',
          label: 'Indumentaria y EPP',
          description: 'Catálogo maestro de indumentaria y elementos de protección personal',
          moduleSlug: 'configuracion',
          tabSlug: 'listado_maestro_articulos',
          content: <ClothingCatalogTabContent searchParams={searchParams} permissions={permissions} />,
        },
      ]}
    />
  );
}
