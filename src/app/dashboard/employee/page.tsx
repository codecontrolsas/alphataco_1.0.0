import EmployeesDiagram from '@/features/Employees/Diagrams/EmployeesDiagram';
import { DiagramsSkeleton } from '@/features/Employees/Diagrams/fallback/DiagramsSkeleton';
import EmployeeList from '@/features/Employees/Empleados/EmployeeList/EmployeeList';
import { EmployeeTableSkeleton } from '@/features/Employees/Empleados/EmployeeList/fallback/EmployeeTableSkeleton';
import { getCompanyName } from '@/features/Empresa/General/actions/company.server';
import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { SectionManagerServer } from '@/features/TabsManager/SectionManagerServer';
import { ViewManagerServer } from '@/features/TabsManager/ViewManagerServer';
import { cookies } from 'next/headers';
import { Suspense } from 'react';

export async function generateMetadata() {
  const cookiesStore = await cookies();
  const companyName = cookiesStore.get('actualCompName')?.value ?? (await getCompanyName())?.company_name;
  if (!companyName) return undefined;
  return {
    title: `Empleados | ${companyName}`,
    description: `Legajos, bajas y novedades del personal de ${companyName}`,
  };
}

/**
 * Empleados: dos secciones (sidebar → `?tab=`) — Personal (`employees`) y Diagramas (`diagrams`) —, cada una
 * con sus vistas (`?subtab=`). Los valores de URL son los de siempre: los sub-items del sidebar y los enlaces
 * del Dashboard y del manual los siguen usando; los `aliases` cubren nombres cortos.
 */
export default async function EmployeePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [permissions, resolvedSearchParams] = await Promise.all([getUserPermissionsMapServer(), searchParams]);

  return (
    <SectionManagerServer
      paramName="tab"
      searchParams={resolvedSearchParams}
      defaultTab="employees"
      permissions={permissions}
      tabs={[
        {
          value: 'employees',
          label: 'Personal',
          description: 'Personal de la empresa y su estado documental.',
          moduleSlug: 'empleados' as const,
          tabSlug: 'employees' as const,
          content: (
            <ViewManagerServer
              paramName="subtab"
              searchParams={resolvedSearchParams}
              defaultView="empleados-activos"
              permissions={permissions}
              ariaLabel="Vistas de legajos"
              views={[
                {
                  value: 'empleados-activos',
                  aliases: ['activos'],
                  label: 'Activos',
                  description: 'Personal en actividad',
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
                  aliases: ['bajas', 'inactivos'],
                  label: 'Bajas',
                  description: 'Egresos y su documentación de baja',
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
          label: 'Diagramas',
          description: 'Diagramas de trabajo y novedades diarias del personal.',
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
