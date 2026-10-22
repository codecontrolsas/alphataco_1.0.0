import { createTabVisibilityChecker } from '@/features/Permissions/lib/tab-visibility';
import { ViewManagerServer } from '@/features/TabsManager/ViewManagerServer';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import EquipmentBrandList from './EquipmentBrands/EquipmentBrandList';
import EquipmentModelList from './EquipmentModels/EquipmentModelList';
import { EquipmentModelTableSkeleton } from './EquipmentModels/fallback/EquipmentModelTableSkeleton';
import EquipmentOwnersTabContent from './EquipmentOwners/EquipmentOwnersTabContent';
import EquipmentSubTypeList from './EquipmentSubTypes/EquipmentSubTypeList';
import { EquipmentSubTypeTableSkeleton } from './EquipmentSubTypes/fallback/EquipmentSubTypeTableSkeleton';
import EquipmentTypeList from './EquipmentTypes/EquipmentTypeList';
import { EquipmentTypeTableSkeleton } from './EquipmentTypes/fallback/EquipmentTypeTableSkeleton';
import { EquiposSubtabSkeleton } from './fallback/EquiposSubtabSkeleton';

type SearchParams = { [key: string]: string | string[] | undefined };

/**
 * Bloque de una vista agrupada: encabezado + la tabla del catálogo (que trae su propia superficie).
 * El `id` es el ancla de las acciones de fila "Ver subtipos" / "Ver modelos".
 */
function CatalogBlock({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="min-w-0 scroll-mt-20">
      <div className="mb-2 min-w-0">
        <h3 id={`${id}-heading`} className="text-base font-semibold tracking-tight">
          {title}
        </h3>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {children}
    </section>
  );
}

export default function EquipmentsTabContent({
  searchParams,
  permissions,
}: {
  searchParams: SearchParams;
  permissions: Record<string, boolean>;
}) {
  const isTabVisible = createTabVisibilityChecker(permissions);
  const canViewTypes = isTabVisible('configuracion', 'tipos');
  const canViewSubTypes = isTabVisible('configuracion', 'subtipos');
  const canViewBrands = isTabVisible('configuracion', 'marcas');
  const canViewModels = isTabVisible('configuracion', 'modelos');

  return (
    <ViewManagerServer
      paramName="subtab"
      searchParams={searchParams}
      defaultView="tipos"
      permissions={permissions}
      preserveParams={['tab']}
      layout="rail"
      ariaLabel="Flota"
      views={[
        {
          value: 'tipos',
          label: 'Tipos y subtipos',
          description:
            canViewTypes && canViewSubTypes
              ? 'Tipos de unidad de la flota y los subtipos de cada uno'
              : canViewTypes
                ? 'Tipos de unidad de la flota'
                : 'Subtipos de cada tipo de unidad',
          aliases: ['subtipos'],
          visibleWhenAny: [
            { moduleSlug: 'configuracion', tabSlug: 'tipos' },
            { moduleSlug: 'configuracion', tabSlug: 'subtipos' },
          ],
          content: (
            <div className="flex min-w-0 flex-col gap-6">
              {canViewTypes ? (
                <CatalogBlock id="tipos" title="Tipos de unidad" description="Tipos de unidad de la flota">
                  <Suspense fallback={<EquipmentTypeTableSkeleton />}>
                    <EquipmentTypeList searchParams={searchParams} permissions={permissions} />
                  </Suspense>
                </CatalogBlock>
              ) : null}
              {canViewSubTypes ? (
                <CatalogBlock id="subtipos" title="Subtipos" description="Subtipos de cada tipo de unidad">
                  <Suspense fallback={<EquipmentSubTypeTableSkeleton />}>
                    <EquipmentSubTypeList searchParams={searchParams} permissions={permissions} />
                  </Suspense>
                </CatalogBlock>
              ) : null}
            </div>
          ),
        },
        {
          value: 'marcas',
          label: 'Marcas y modelos',
          description:
            canViewBrands && canViewModels
              ? 'Marcas de los equipos y los modelos de cada una'
              : canViewBrands
                ? 'Marcas de los equipos'
                : 'Modelos de los equipos',
          aliases: ['modelos'],
          visibleWhenAny: [
            { moduleSlug: 'configuracion', tabSlug: 'marcas' },
            { moduleSlug: 'configuracion', tabSlug: 'modelos' },
          ],
          content: (
            <div className="flex min-w-0 flex-col gap-6">
              {canViewBrands ? (
                <CatalogBlock id="marcas" title="Marcas" description="Marcas de los equipos">
                  <Suspense fallback={<EquiposSubtabSkeleton />}>
                    <EquipmentBrandList searchParams={searchParams} permissions={permissions} />
                  </Suspense>
                </CatalogBlock>
              ) : null}
              {canViewModels ? (
                <CatalogBlock id="modelos" title="Modelos" description="Modelos de los equipos">
                  <Suspense fallback={<EquipmentModelTableSkeleton />}>
                    <EquipmentModelList searchParams={searchParams} permissions={permissions} />
                  </Suspense>
                </CatalogBlock>
              ) : null}
            </div>
          ),
        },
        {
          value: 'titulares',
          label: 'Titulares',
          description: 'Titulares de los equipos y los equipos de cada uno',
          moduleSlug: 'configuracion',
          tabSlug: 'titulares',
          content: (
            <Suspense fallback={<EquiposSubtabSkeleton />}>
              <EquipmentOwnersTabContent searchParams={searchParams} />
            </Suspense>
          ),
        },
      ]}
    />
  );
}
