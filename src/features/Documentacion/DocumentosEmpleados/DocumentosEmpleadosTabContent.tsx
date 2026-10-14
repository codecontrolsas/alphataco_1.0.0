import DocumentNav from '@/features/Documentacion/shared/components/DocumentNav';
import { PermissionGuardServer } from '@/features/Permissions';
import { TabsManagerServer } from '@/features/TabsManager';
import { Calendar, FileArchive } from 'lucide-react';
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
    <div>
      {/* Subtítulo y botón de carga; el botón se apila debajo en pantallas chicas */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground">
          Documentación de cada persona de la empresa, con su estado y vencimiento.
        </p>
        <PermissionGuardServer module="documentacion" tab="documentos-de-empleados" action="create">
          <DocumentNav onlyEmployees />
        </PermissionGuardServer>
      </div>
      <TabsManagerServer
        paramName="subtab"
        searchParams={searchParams}
        defaultTab="empleados-permanentes"
        permissions={permissions}
        tabs={[
          {
            value: 'empleados-permanentes',
            label: (
              <span className="flex items-center gap-2">
                <FileArchive className="h-4 w-4" />
                Permanentes
              </span>
            ),
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
            label: (
              <span className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Mensuales
              </span>
            ),
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
    </div>
  );
}
