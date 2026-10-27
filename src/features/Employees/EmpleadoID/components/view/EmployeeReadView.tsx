import { EmployeeDeliveriesTabContent } from '@/features/Clothing/EmployeeDeliveries/EmployeeDeliveriesTabContent';
import { ClothingTableSkeleton } from '@/features/Clothing/fallback/ClothingTableSkeleton';
import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { createTabVisibilityChecker } from '@/features/Permissions/lib/tab-visibility';
import { RecordSectionsServer } from '@/features/TabsManager/RecordSectionsServer';
import { RecordHeader } from '@/shared/components/common/RecordHeader';
import { CalendarDays, ChevronRight, FileText, IdCard, Shirt, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { PortalAccessTabContent } from '../../PortalAccess/PortalAccessTabContent';
import { PortalAccessSkeleton } from '../../PortalAccess/fallback/PortalAccessSkeleton';
import type { EmployeeDetailData } from '../../actions.server';
import { EmployeeDiagramsSection } from '../EmployeeDiagramsSection';
import { EmployeeHeaderContent } from '../EmployeeHeaderContent';
import { EmployeeRecordData } from '../EmployeeViewDisplay';
import { EmployeeDocumentDetail } from '../employee-document-detail';
import { EmployeeQuickActions } from '../employee-quick-actions';
import { EmployeeDiagramsSkeleton } from '../skeletons/employee-diagrams-skeleton';
import { EmployeeEditButton } from './EmployeeEditButton';

interface EmployeeReadViewProps {
  employee: NonNullable<EmployeeDetailData>;
  searchParams: Record<string, string | string[] | undefined>;
}

/**
 * Ficha del empleado en lectura: ruta de vuelta al listado, cabecera con el legajo y las acciones,
 * e índice de secciones (`?tab=`) a la izquierda. Solo se arma la sección activa.
 *
 * `aliases`: los valores de `?tab=` de la ficha anterior (`personalData`, `workData`) caen en "Legajo";
 * `documents` y `clothing` se conservan y `diagrams` es alias de `novedades` (los mails de vencimientos enlazan a `tab=documents`).
 */
export async function EmployeeReadView({ employee, searchParams }: EmployeeReadViewProps) {
  const permissions = await getUserPermissionsMapServer();
  const isTabVisible = createTabVisibilityChecker(permissions);
  const employeeId = employee.id;
  const listHref = `/dashboard/employee?tab=employees&subtab=${employee.is_active ? 'empleados-activos' : 'empleados-inactivos'}`;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <nav aria-label="Ruta" className="text-muted-foreground flex min-w-0 items-center gap-1 text-sm">
        <Link
          href={listHref}
          className="hover:text-foreground focus-visible:ring-ring rounded-sm outline-none focus-visible:ring-2"
        >
          Personal · {employee.is_active ? 'Activos' : 'Bajas'}
        </Link>
        <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
        <span aria-current="page" className="text-foreground min-w-0 truncate font-mono tabular-nums">
          Legajo {employee.file ?? '—'}
        </span>
      </nav>

      <RecordHeader
        identity={
          <EmployeeHeaderContent
            employee={employee}
            canViewDocuments={isTabVisible('documentacion', 'documentos-de-empleados')}
          />
        }
        actions={
          <>
            <PermissionGuard module="empleados" tab="employees" action="update">
              <EmployeeEditButton />
            </PermissionGuard>
            <EmployeeQuickActions
              employeeId={employeeId}
              isActive={employee.is_active ?? true}
              email={employee.email ?? undefined}
            />
          </>
        }
      />

      <RecordSectionsServer<'empleados' | 'documentacion'>
        paramName="tab"
        searchParams={searchParams}
        permissions={permissions}
        defaultSection="legajo"
        preserveParams={['action', 'employee_id']}
        ariaLabel="Secciones del legajo"
        sections={[
          {
            value: 'legajo',
            aliases: ['personalData', 'workData'],
            label: 'Legajo',
            description: 'Identidad, puesto y asignaciones',
            icon: <IdCard aria-hidden="true" />,
            visibleWhenAny: [
              { moduleSlug: 'empleados', tabSlug: 'datos-personales' },
              { moduleSlug: 'empleados', tabSlug: 'datos-laborales' },
            ],
            content: (
              <EmployeeRecordData
                employee={employee}
                showPersonal={isTabVisible('empleados', 'datos-personales')}
                showContact={isTabVisible('empleados', 'datos-contacto')}
                showWork={isTabVisible('empleados', 'datos-laborales')}
              />
            ),
          },
          {
            value: 'documents',
            label: 'Documentación',
            description: 'Permanentes y mensuales',
            icon: <FileText aria-hidden="true" />,
            moduleSlug: 'documentacion',
            tabSlug: 'documentos-de-empleados',
            content: (
              <EmployeeDocumentDetail employeeId={employeeId} searchParams={searchParams} permissions={permissions} />
            ),
          },
          {
            // No `diagrams`: el sidebar marcaría su ítem "Diagramas" (mira `?tab=`). El valor viejo queda como alias.
            value: 'novedades',
            aliases: ['diagrams'],
            label: 'Diagrama',
            description: 'Novedades día por día',
            icon: <CalendarDays aria-hidden="true" />,
            // Como antes: visible con la consulta de novedades del empleado o con la carga de diagramas.
            visibleWhenAny: [
              { moduleSlug: 'empleados', tabSlug: 'diagramas-empleado' },
              { moduleSlug: 'empleados', tabSlug: 'new' },
            ],
            content: (
              <Suspense fallback={<EmployeeDiagramsSkeleton />}>
                <EmployeeDiagramsSection employeeId={employeeId} />
              </Suspense>
            ),
          },
          {
            value: 'clothing',
            label: 'Indumentaria y EPP',
            description: 'Entregas registradas',
            icon: <Shirt aria-hidden="true" />,
            moduleSlug: 'empleados',
            tabSlug: 'indumentaria_empleado',
            content: (
              <Suspense fallback={<ClothingTableSkeleton />}>
                <EmployeeDeliveriesTabContent employeeId={employeeId} searchParams={searchParams} />
              </Suspense>
            ),
          },
          {
            value: 'portal',
            label: 'Portal',
            description: 'Acceso del empleado al portal',
            icon: <Smartphone aria-hidden="true" />,
            moduleSlug: 'empleados',
            tabSlug: 'portal_empleado',
            content: (
              <Suspense fallback={<PortalAccessSkeleton />}>
                <PortalAccessTabContent employeeId={employeeId} />
              </Suspense>
            ),
          },
        ]}
      />
    </div>
  );
}
