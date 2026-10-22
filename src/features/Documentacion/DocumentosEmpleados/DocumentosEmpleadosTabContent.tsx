import DocumentNav from '@/features/Documentacion/shared/components/DocumentNav';
import { PermissionGuardServer } from '@/features/Permissions/components/PermissionGuardServer';
import { ViewManagerServer } from '@/features/TabsManager/ViewManagerServer';
import { Suspense } from 'react';
import { MonthlyEmployeeDocumentsList } from './Mensuales/MonthlyEmployeeDocumentsList';
import { MonthlyEmployeeDocumentsSkeleton } from './Mensuales/fallback/MonthlyEmployeeDocumentsSkeleton';
import { EmployeePermanentDocumentsList } from './Permanentes/EmployeePermanentDocumentsList';
import { EmployeePermanentDocumentsSkeleton } from './Permanentes/fallback/EmployeePermanentDocumentsSkeleton';

export default async function DocumentosEmpleadosTabContent({
  searchParams,
  permissions,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
  permissions: Record<string, boolean>;
}) {
  return (
    <ViewManagerServer
      paramName="subtab"
      searchParams={searchParams}
      defaultView="empleados-permanentes"
      permissions={permissions}
      ariaLabel="Documentos del personal"
      actions={
        <PermissionGuardServer module="documentacion" tab="documentos-de-empleados" action="create">
          <DocumentNav onlyEmployees />
        </PermissionGuardServer>
      }
      views={[
        {
          value: 'empleados-permanentes',
          aliases: ['permanentes'],
          label: 'Permanentes',
          description: 'Documentos sin período, con o sin vencimiento',
          moduleSlug: 'documentacion',
          tabSlug: 'docs-empleados-permanentes',
          content: (
            <Suspense fallback={<EmployeePermanentDocumentsSkeleton />}>
              <EmployeePermanentDocumentsList searchParams={searchParams} />
            </Suspense>
          ),
        },
        {
          value: 'empleados-mensuales',
          aliases: ['mensuales'],
          label: 'Mensuales',
          description: 'Documentos que se presentan cada mes',
          moduleSlug: 'documentacion',
          tabSlug: 'docs-empleados-mensuales',
          content: (
            <Suspense fallback={<MonthlyEmployeeDocumentsSkeleton />}>
              <MonthlyEmployeeDocumentsList searchParams={searchParams} />
            </Suspense>
          ),
        },
      ]}
    />
  );
}
