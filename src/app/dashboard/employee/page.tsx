import EmployeesDiagram from '@/features/Employees/Diagrams/EmployeesDiagram';
import { DiagramsSkeleton } from '@/features/Employees/Diagrams/fallback/DiagramsSkeleton';
import EmployeeList from '@/features/Employees/Empleados/EmployeeList/EmployeeList';
import { EmployeeTableSkeleton } from '@/features/Employees/Empleados/EmployeeList/fallback/EmployeeTableSkeleton';
import { getCompanyName } from '@/features/Empresa/General/actions/company.server';
import { getUserPermissionsMapServer } from '@/features/Permissions';
import { SectionManagerServer, TabsManagerServer } from '@/features/TabsManager';
import { GitBranch, UserCheck, UserX, Users } from 'lucide-react';
import { cookies } from 'next/headers';
import { Suspense } from 'react';

export async function generateMetadata() {
  const cookiesStore = await cookies();
  const companyName = cookiesStore.get('actualCompName')?.value;
  if (companyName) {
    return {
      title: `Empleados | ${companyName}`,
      description: `Pagina de empresa de ${companyName} con informacion general, comercial, HR y equipos`,
    };
  } else {
    const actualCompany = await getCompanyName();
    if (actualCompany) {
      return {
        title: `Empleados | ${actualCompany.company_name}`,
        description: `Pagina de empresa de ${actualCompany.company_name} con informacion general, comercial, HR y equipos`,
      };
    }
  }
}

export default async function EmployeePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const permissions = await getUserPermissionsMapServer();
  const resolvedSearchParams = await searchParams;

  return (
    <SectionManagerServer
      paramName="tab"
      searchParams={resolvedSearchParams}
      defaultTab="employees"
      permissions={permissions}
      tabs={[
        {
          value: 'employees',
          label: (
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Empleados
            </span>
          ),
          moduleSlug: 'empleados' as const,
          tabSlug: 'employees' as const,
          content: (
            <TabsManagerServer
              paramName="subtab"
              searchParams={resolvedSearchParams}
              defaultTab="empleados-activos"
              permissions={permissions}
              tabs={[
                {
                  value: 'empleados-activos',
                  label: (
                    <span className="flex items-center gap-2">
                      <UserCheck className="h-4 w-4" />
                      Activos
                    </span>
                  ),
                  moduleSlug: 'empleados',
                  tabSlug: 'empleados-activos',
                  content: (
                    <Suspense fallback={<EmployeeTableSkeleton />}>
                      <EmployeeList searchParams={resolvedSearchParams} isActive={true} permissions={permissions} />
                    </Suspense>
                  ),
                },
                {
                  value: 'empleados-inactivos',
                  label: (
                    <span className="flex items-center gap-2">
                      <UserX className="h-4 w-4" />
                      Bajas
                    </span>
                  ),
                  moduleSlug: 'empleados',
                  tabSlug: 'empleados-inactivos',
                  content: (
                    <Suspense fallback={<EmployeeTableSkeleton />}>
                      <EmployeeList searchParams={resolvedSearchParams} isActive={false} permissions={permissions} />
                    </Suspense>
                  ),
                },
              ]}
            />
          ),
        },
        {
          value: 'diagrams',
          label: (
            <span className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              Diagramas
            </span>
          ),
          moduleSlug: 'empleados' as const,
          tabSlug: 'diagrams' as const,
          content: (
            <Suspense fallback={<DiagramsSkeleton />}>
              <EmployeesDiagram searchParams={resolvedSearchParams} permissions={permissions} />
            </Suspense>
          ),
        },
      ]}
    />
  );
}
