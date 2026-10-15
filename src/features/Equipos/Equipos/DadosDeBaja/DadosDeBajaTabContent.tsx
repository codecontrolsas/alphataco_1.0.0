import { ViewManagerServer } from '@/features/TabsManager';
import { Suspense } from 'react';
import { InactiveOtherEquipmentList } from './OtrosEquipos/InactiveOtherEquipmentList';
import { InactiveOtherEquipmentTableSkeleton } from './OtrosEquipos/fallback/InactiveOtherEquipmentTableSkeleton';
import { InactiveVehicleList } from './Vehiculos/InactiveVehicleList';
import { InactiveVehicleTableSkeleton } from './Vehiculos/fallback/InactiveVehicleTableSkeleton';

interface Props {
  searchParams: Record<string, string | string[] | undefined>;
  permissions: Record<string, boolean>;
}

/**
 * Sección "Dados de Baja": dos vistas (`?inactive_subtab=`), vehículos y otros equipos.
 * `aliases`: `vehicles` / `others` por si algún enlace usa los nombres cortos de las listas activas.
 */
export default function DadosDeBajaTabContent({ searchParams, permissions }: Props) {
  return (
    <ViewManagerServer
      paramName="inactive_subtab"
      searchParams={searchParams}
      defaultView="inactive_vehicles"
      permissions={permissions}
      ariaLabel="Equipos dados de baja"
      views={[
        {
          value: 'inactive_vehicles',
          aliases: ['vehicles'],
          label: 'Vehículos',
          description: 'Vehículos dados de baja',
          moduleSlug: 'equipos',
          tabSlug: 'inactive',
          content: (
            <Suspense fallback={<InactiveVehicleTableSkeleton />}>
              <InactiveVehicleList searchParams={searchParams} permissions={permissions} />
            </Suspense>
          ),
        },
        {
          value: 'inactive_others',
          aliases: ['others'],
          label: 'Otros equipos',
          description: 'Equipamiento dado de baja',
          moduleSlug: 'equipos',
          tabSlug: 'inactive',
          content: (
            <Suspense fallback={<InactiveOtherEquipmentTableSkeleton />}>
              <InactiveOtherEquipmentList searchParams={searchParams} />
            </Suspense>
          ),
        },
      ]}
    />
  );
}
