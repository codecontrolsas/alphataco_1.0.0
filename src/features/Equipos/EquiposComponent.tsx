import { SectionManagerServer } from '@/features/TabsManager/SectionManagerServer';
import { Suspense } from 'react';
import DadosDeBajaTabContent from './Equipos/DadosDeBaja/DadosDeBajaTabContent';
import { VehicleTabContent } from './Equipos/VehicleList/VehicleTabContent';
import { VehicleTableSkeleton } from './Equipos/VehicleList/fallback/VehicleTableSkeleton';
import { OtherEquipmentTabContent } from './OtherEquipment/OtherEquipmentTabContent';
import { OtherEquipmentTableSkeleton } from './OtherEquipment/fallback/OtherEquipmentTableSkeleton';

/**
 * Equipos: tres secciones (sidebar → `?tab=`) — Vehículos, Equipamiento y Dados de Baja —, esta última
 * con sus propias vistas (`?inactive_subtab=`). Los valores de URL son los de siempre.
 *
 * Los permisos siguen siendo las subtabs `vehicles`/`others`/`inactive` de la tab `equipos`, que
 * `createTabVisibilityChecker` encuentra a cualquier profundidad.
 */
export default async function EquiposComponent({
  searchParams,
  permissions,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
  permissions: Record<string, boolean>;
}) {
  return (
    <SectionManagerServer
      paramName="tab"
      searchParams={searchParams}
      defaultTab="vehicles"
      permissions={permissions}
      tabs={[
        {
          value: 'vehicles',
          label: 'Vehículos',
          description: 'Flota activa, su estado documental y de mantenimiento.',
          moduleSlug: 'equipos',
          tabSlug: 'vehicles',
          content: (
            <Suspense fallback={<VehicleTableSkeleton />}>
              <VehicleTabContent searchParams={searchParams} />
            </Suspense>
          ),
        },
        {
          value: 'others',
          label: 'Equipamiento',
          description: 'Contenedores, trailers y demás equipos que no son vehículos.',
          moduleSlug: 'equipos',
          tabSlug: 'others',
          content: (
            <Suspense fallback={<OtherEquipmentTableSkeleton />}>
              <OtherEquipmentTabContent searchParams={searchParams} permissions={permissions} />
            </Suspense>
          ),
        },
        {
          value: 'inactive',
          label: 'Dados de Baja',
          description: 'Equipos retirados de la operación y su documentación de baja.',
          moduleSlug: 'equipos',
          tabSlug: 'inactive',
          content: <DadosDeBajaTabContent searchParams={searchParams} permissions={permissions} />,
        },
      ]}
    />
  );
}
