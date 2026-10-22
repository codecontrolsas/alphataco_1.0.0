import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { SectionManagerServer } from '@/features/TabsManager/SectionManagerServer';
import { Suspense } from 'react';
import PartesDiariosTabContent from './PartesDiarios/PartesDiariosTabContent';
import { DailyReportTableSkeleton } from './PartesDiarios/list/fallback/DailyReportTableSkeleton';
import PreparteTabContent from './Preparte/PreparteTabContent';
import { PreparteSkeleton } from './Preparte/fallback/PreparteSkeleton';

export default async function OperacionesComponent({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  // Obtener permisos (usará cache pre-cargado en layout, sin query adicional)
  const permissions = await getUserPermissionsMapServer();

  return (
    <div>
      <SectionManagerServer
        paramName="tab"
        searchParams={searchParams}
        defaultTab="preparte"
        permissions={permissions}
        tabs={[
          {
            value: 'preparte',
            label: 'Planificador',
            description: 'Pedidos de los clientes y su programación.',
            moduleSlug: 'operaciones',
            tabSlug: 'preparte',
            content: (
              <Suspense fallback={<PreparteSkeleton />}>
                <PreparteTabContent searchParams={searchParams} permissionsMap={permissions} />
              </Suspense>
            ),
          },
          {
            value: 'dailyreportstable',
            label: 'Partes de operaciones',
            description: 'Un parte por día con las líneas de servicio y los recursos asignados.',
            moduleSlug: 'operaciones',
            tabSlug: 'dailyreportstable',
            content: (
              <Suspense fallback={<DailyReportTableSkeleton />}>
                <PartesDiariosTabContent searchParams={searchParams} />
              </Suspense>
            ),
          },
        ]}
      />
    </div>
  );
}
