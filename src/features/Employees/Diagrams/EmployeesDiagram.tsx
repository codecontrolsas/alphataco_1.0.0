import { Skeleton } from '@/components/ui/skeleton';
import { ViewManagerServer } from '@/features/TabsManager';
import { Suspense } from 'react';
import DiagramFormUpdatedWrapper from './DiagramFormUpdatedWrapper';
import DiagramMassive from './DiagramMassive';
import EmployeesDiagramWrapper from './EmployeesDiagramWrapper';
import { DiagramReportsList } from './Reports/DiagramReportsList';
import { DiagramReportsSkeleton } from './Reports/fallback/DiagramReportsSkeleton';

/**
 * Sección Diagramas: una vista por tarea (consultar, cargar uno, cargar en lote, informar).
 * Los valores de `?subtab=` son los de siempre (el Dashboard enlaza a `old` con filtros `diagOld_*`).
 */
export default async function EmployeesDiagram({
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
      defaultView="old"
      permissions={permissions}
      ariaLabel="Vistas de diagramas"
      views={[
        {
          value: 'old',
          aliases: ['calendario'],
          label: 'Calendario',
          description: 'Novedades cargadas por empleado y día',
          moduleSlug: 'empleados',
          tabSlug: 'old',
          content: (
            <Suspense fallback={<Skeleton className="h-[300px] w-full rounded-xl" />}>
              <EmployeesDiagramWrapper searchParams={searchParams} />
            </Suspense>
          ),
        },
        {
          value: 'new',
          aliases: ['carga'],
          label: 'Carga individual',
          description: 'Un empleado, uno o varios días',
          moduleSlug: 'empleados',
          tabSlug: 'new',
          content: (
            <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
              <DiagramFormUpdatedWrapper />
            </Suspense>
          ),
        },
        {
          value: 'massive_diagram',
          aliases: ['masiva'],
          label: 'Carga masiva',
          description: 'Un patrón o una novedad para varios empleados',
          moduleSlug: 'empleados',
          tabSlug: 'massive_diagram',
          surface: true,
          content: <DiagramMassive />,
        },
        {
          value: 'reports',
          aliases: ['reportes'],
          label: 'Reportes',
          description: 'Totales de novedades por período',
          moduleSlug: 'empleados',
          tabSlug: 'reports',
          content: (
            <Suspense fallback={<DiagramReportsSkeleton />}>
              <DiagramReportsList searchParams={searchParams} />
            </Suspense>
          ),
        },
      ]}
    />
  );
}
