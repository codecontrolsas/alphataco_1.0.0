import { MonthlyEmployeeDocumentsList } from '@/features/Documentacion/DocumentosEmpleados/Mensuales/MonthlyEmployeeDocumentsList';
import { MonthlyEmployeeDocumentsSkeleton } from '@/features/Documentacion/DocumentosEmpleados/Mensuales/fallback/MonthlyEmployeeDocumentsSkeleton';
import { EmployeePermanentDocumentsList } from '@/features/Documentacion/DocumentosEmpleados/Permanentes/EmployeePermanentDocumentsList';
import { EmployeePermanentDocumentsSkeleton } from '@/features/Documentacion/DocumentosEmpleados/Permanentes/fallback/EmployeePermanentDocumentsSkeleton';
import { ViewManagerServer } from '@/features/TabsManager/ViewManagerServer';
import { Suspense } from 'react';

interface EmployeeDocumentDetailProps {
  employeeId: string;
  searchParams: Record<string, string | string[] | undefined>;
  permissions: Record<string, boolean>;
}

/**
 * Documentación del empleado dentro de su ficha: permanentes o mensuales (`?subtab=`), sin perder la
 * ficha ni la sección (`action`, `employee_id`, `tab`) al cambiar de vista.
 */
export async function EmployeeDocumentDetail({ employeeId, searchParams, permissions }: EmployeeDocumentDetailProps) {
  return (
    <ViewManagerServer
      paramName="subtab"
      searchParams={searchParams}
      defaultView="permanentes"
      permissions={permissions}
      preserveParams={['action', 'employee_id', 'tab']}
      ariaLabel="Tipo de documentación"
      views={[
        {
          value: 'permanentes',
          label: 'Permanentes',
          description: 'Documentos de presentación única',
          moduleSlug: 'documentacion',
          tabSlug: 'docs-empleados-permanentes',
          content: (
            <Suspense fallback={<EmployeePermanentDocumentsSkeleton />}>
              <EmployeePermanentDocumentsList searchParams={searchParams} employeeId={employeeId} />
            </Suspense>
          ),
        },
        {
          value: 'mensuales',
          label: 'Mensuales',
          description: 'Documentos que se presentan por período',
          moduleSlug: 'documentacion',
          tabSlug: 'docs-empleados-mensuales',
          content: (
            <Suspense fallback={<MonthlyEmployeeDocumentsSkeleton />}>
              <MonthlyEmployeeDocumentsList searchParams={searchParams} employeeId={employeeId} />
            </Suspense>
          ),
        },
      ]}
    />
  );
}
