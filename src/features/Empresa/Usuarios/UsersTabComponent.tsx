import { AccesosExternosTabContent } from '@/features/Empresa/AccesosExternos/AccesosExternosTabContent';
import { ExternalApiClientsTableSkeleton } from '@/features/Empresa/AccesosExternos/list/fallback/ExternalApiClientsTableSkeleton';
import { ViewManagerServer } from '@/features/TabsManager/ViewManagerServer';
import { RoleManagerContent } from '@/features/UserPermissionsManager/components/RoleManagerContent';
import { RoleManagerSkeleton } from '@/features/UserPermissionsManager/fallback/RoleManagerSkeleton';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Suspense } from 'react';
import { UsersTableSkeleton } from './fallback/UsersTableSkeleton';
import { UsersTableList } from './table/UsersTableList';

export default function UsersTabComponent({
  searchParams,
  permissions,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
  permissions: Record<string, boolean>;
}) {
  return (
    <ViewManagerServer
      paramName="usertab"
      searchParams={searchParams}
      defaultView="usuarios-empleados"
      layout="tabs"
      ariaLabel="Usuarios y accesos"
      preserveParams={['tab', 'subtab']}
      permissions={permissions}
      views={[
        {
          value: 'usuarios-empleados',
          description: 'Usuarios con acceso al sistema',
          label: 'Usuarios',
          moduleSlug: 'configuracion',
          tabSlug: 'usuarios-empleados',
          content: (
            <Suspense fallback={<UsersTableSkeleton />}>
              <UsersTableList searchParams={searchParams as DataTableSearchParams} permissionsMap={permissions} />
            </Suspense>
          ),
        },
        {
          value: 'gestion-roles',
          description: 'Roles y permisos de cada usuario',
          label: 'Roles y permisos',
          moduleSlug: 'configuracion',
          tabSlug: 'gestion-roles',
          content: (
            <Suspense fallback={<RoleManagerSkeleton />}>
              <RoleManagerContent />
            </Suspense>
          ),
        },
        {
          value: 'accesos-externos',
          description: 'Credenciales para integraciones externas',
          label: 'Accesos externos',
          moduleSlug: 'configuracion',
          tabSlug: 'accesos-externos',
          content: (
            <Suspense fallback={<ExternalApiClientsTableSkeleton />}>
              <AccesosExternosTabContent
                searchParams={searchParams as DataTableSearchParams}
                permissionsMap={permissions}
              />
            </Suspense>
          ),
        },
      ]}
    />
  );
}
