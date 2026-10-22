import { Skeleton } from '@/components/ui/skeleton';
import MaintenanceGroupsWrapper from '@/features/Mantenimiento/TiposReparaciones/MaintenanceGroupsWrapper';
import RepairTypeFormWrapper from '@/features/Mantenimiento/TiposReparaciones/RepairTypeFormWrapper';
import { createTabVisibilityChecker } from '@/features/Permissions/lib/tab-visibility';
import { ViewManagerServer } from '@/features/TabsManager/ViewManagerServer';
import { CatalogTableSurface } from '@/shared/components/common/CatalogFormSheet';
import { Suspense } from 'react';
import TalleresTab from '../General/components/mantenimiento/TalleresTab';

/**
 * Sección Taller de Configuración: las cuatro pantallas que definen cómo trabaja el taller
 * (talleres, los tipos de reparación y los grupos de mantenimiento), reagrupadas en dos vistas.
 * Los sectores de taller se administran desde Mantenimiento > Sectores; los enlaces viejos
 * `?subtab=sectores_taller|maintenance_groups` caen en la vista de su grupo.
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

  return (
    <ViewManagerServer
      paramName="subtab"
      searchParams={searchParams}
      defaultView="talleres"
      permissions={permissions}
      layout="menu"
      ariaLabel="Taller"
      preserveParams={['tab']}
      views={[
        {
          value: 'talleres',
          aliases: ['sectores_taller'],
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
      ]}
    />
  );
}
