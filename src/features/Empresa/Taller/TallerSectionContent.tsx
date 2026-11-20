import { Skeleton } from '@/components/ui/skeleton';
import MaintenanceGroupsWrapper from '@/features/Mantenimiento/TiposReparaciones/MaintenanceGroupsWrapper';
import RepairTypeFormWrapper from '@/features/Mantenimiento/TiposReparaciones/RepairTypeFormWrapper';
import { createTabVisibilityChecker } from '@/features/Permissions/lib/tab-visibility';
import { ViewManagerServer } from '@/features/TabsManager/ViewManagerServer';
import { CatalogTableSurface } from '@/shared/components/common/CatalogFormSheet';
import MarcasTabContent from '@/features/Mantenimiento/Gomeria/Marcas/MarcasTabContent';
import PlantillasTabContent from '@/features/Mantenimiento/Gomeria/Plantillas/PlantillasTabContent';
import TiposTabContent from '@/features/Mantenimiento/Gomeria/Tipos/TiposTabContent';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import TalleresTab from '../General/components/mantenimiento/TalleresTab';
import { buildSectorsAdminHref } from '../General/lib/sectors-admin-href';

/** Pestañas de Mantenimiento (permiso heredado de Gomería) cuyas pantallas se configuran en la vista Cubiertas. */
const TIRE_CATALOG_TABS = ['plantillas_cubiertas', 'marcas_cubiertas', 'tipos_cubiertas'] as const;

/**
 * Sección Taller de Configuración: las pantallas que definen cómo trabaja el taller
 * (talleres, los tipos de reparación y los grupos de mantenimiento), reagrupadas en tres vistas; la tercera,
 * Cubiertas, reúne plantillas, marcas y tipos de cubierta (antes pestañas de Mantenimiento > Gomería, 778).
 * Los sectores de taller se administran desde Mantenimiento > Sectores: un enlace viejo
 * `?subtab=sectores_taller` redirige ahí; `?subtab=maintenance_groups` cae en la vista de su grupo.
 */
export default function TallerSectionContent({
  searchParams,
  permissions,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
  permissions: Record<string, boolean>;
}) {
  // Cada bloque de una vista fusionada conserva su propio guard: sin permiso sobre una pestaña, no se monta su bloque.
  const isTabVisible = createTabVisibilityChecker(permissions);

  // Los sectores se mudaron a Mantenimiento > Sectores (778): el enlace viejo va ahí, y también quien solo
  // tenía permiso sobre los sectores (acá ya no vería nada).
  // Las vistas de cubiertas (plantillas, marcas, tipos) cuentan: quien solo tiene esas y los sectores se queda acá.
  const onlySectors =
    isTabVisible('configuracion', 'sectores_taller') &&
    !['talleres', 'type_of_repair', 'maintenance_groups'].some((tab) => isTabVisible('configuracion', tab)) &&
    !TIRE_CATALOG_TABS.some((tab) => isTabVisible('mantenimiento', tab));
  if (searchParams.subtab === 'sectores_taller' || onlySectors) redirect(buildSectorsAdminHref());

  return (
    <ViewManagerServer
      paramName="subtab"
      searchParams={searchParams}
      defaultView="talleres"
      permissions={permissions}
      layout="tabs"
      ariaLabel="Taller"
      preserveParams={['tab']}
      views={[
        {
          value: 'talleres',
          label: 'Talleres',
          description: 'Talleres propios y externos. Los sectores se administran en Mantenimiento > Sectores',
          moduleSlug: 'configuracion',
          tabSlug: 'talleres',
          content: (
            <div className="flex min-w-0 flex-col gap-6">
              {isTabVisible('configuracion', 'talleres') ? (
                <CatalogTableSurface id="talleres-taller" title="Talleres">
                  <Suspense fallback={<Skeleton className="h-[400px] w-full rounded-md" />}>
                    <TalleresTab />
                  </Suspense>
                </CatalogTableSurface>
              ) : null}
            </div>
          ),
        },
        {
          value: 'type_of_repair',
          aliases: ['maintenance_groups'],
          label: 'Reparaciones y grupos',
          description: 'Catálogo de reparaciones que se pueden pedir y registrar, y sus grupos de mantenimiento',
          visibleWhenAny: [
            { moduleSlug: 'configuracion', tabSlug: 'type_of_repair' },
            { moduleSlug: 'configuracion', tabSlug: 'maintenance_groups' },
          ],
          content: (
            <div className="flex min-w-0 flex-col gap-6">
              {isTabVisible('configuracion', 'type_of_repair') ? (
                <CatalogTableSurface id="tipos-reparacion" title="Tipos de reparación">
                  <Suspense fallback={<Skeleton className="h-[400px] w-full rounded-md" />}>
                    <RepairTypeFormWrapper />
                  </Suspense>
                </CatalogTableSurface>
              ) : null}
              {isTabVisible('configuracion', 'maintenance_groups') ? (
                <CatalogTableSurface id="grupos-mantenimiento" title="Grupos de mantenimiento">
                  <Suspense fallback={<Skeleton className="h-[400px] w-full rounded-md" />}>
                    <MaintenanceGroupsWrapper />
                  </Suspense>
                </CatalogTableSurface>
              ) : null}
            </div>
          ),
        },
        {
          value: 'cubiertas',
          label: 'Cubiertas',
          description: 'Plantillas de ejes por tipo de vehículo, marcas y tipos de cubierta',
          visibleWhenAny: TIRE_CATALOG_TABS.map((tabSlug) => ({ moduleSlug: 'mantenimiento', tabSlug })),
          content: (
            <div className="flex min-w-0 flex-col gap-6">
              {isTabVisible('mantenimiento', 'plantillas_cubiertas') ? (
                <CatalogTableSurface id="plantillas-cubiertas" title="Plantillas de ejes">
                  <PlantillasTabContent searchParams={searchParams} />
                </CatalogTableSurface>
              ) : null}
              {isTabVisible('mantenimiento', 'marcas_cubiertas') ? (
                <CatalogTableSurface id="marcas-cubiertas" title="Marcas de cubiertas">
                  <MarcasTabContent searchParams={searchParams} />
                </CatalogTableSurface>
              ) : null}
              {isTabVisible('mantenimiento', 'tipos_cubiertas') ? (
                <CatalogTableSurface id="tipos-cubiertas" title="Tipos de cubierta">
                  <TiposTabContent searchParams={searchParams} />
                </CatalogTableSurface>
              ) : null}
            </div>
          ),
        },
      ]}
    />
  );
}
