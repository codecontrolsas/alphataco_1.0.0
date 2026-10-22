import { companyPageMetadata } from '@/app/_lib/company-metadata';
import EmployeesDiagram from '@/features/Employees/Diagrams/EmployeesDiagram';
import { DiagramsSkeleton } from '@/features/Employees/Diagrams/fallback/DiagramsSkeleton';
import EmployeeList from '@/features/Employees/Empleados/EmployeeList/EmployeeList';
import { EmployeeTableSkeleton } from '@/features/Employees/Empleados/EmployeeList/fallback/EmployeeTableSkeleton';
import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { SectionManagerServer } from '@/features/TabsManager/SectionManagerServer';
import { ViewManagerServer } from '@/features/TabsManager/ViewManagerServer';
import { Suspense } from 'react';

export async function generateMetadata() {
  return companyPageMetadata('Empleados', (name) => `Legajos, bajas y novedades del personal de ${name}`);
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
