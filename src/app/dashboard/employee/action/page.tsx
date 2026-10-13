import { EmployeeDeliveriesTableSkeleton } from '@/features/Clothing/EmployeeDeliveries/EmployeeDeliveriesList/fallback/EmployeeDeliveriesTableSkeleton';
import { EmployeeDeliveriesTabContent } from '@/features/Clothing/EmployeeDeliveries/EmployeeDeliveriesTabContent';
import { getEmployeeByIdCached } from '@/features/Employees/EmpleadoID/actions.server';
import { EmployeeDetailClient } from '@/features/Employees/EmpleadoID/components/EmployeeDetailClient';
import { EmployeeDiagramsSection } from '@/features/Employees/EmpleadoID/components/EmployeeDiagramsSection';
import { EmployeeHeaderContent } from '@/features/Employees/EmpleadoID/components/EmployeeHeaderContent';
import { EmployeeDocumentDetail } from '@/features/Employees/EmpleadoID/components/employee-document-detail';
import { EmployeeDiagramsSkeleton } from '@/features/Employees/EmpleadoID/components/skeletons/employee-diagrams-skeleton';
import { Logger } from '@/lib/logger';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

const logger = new Logger('EmployeePage');

interface EmployeePageProps {
  searchParams: Promise<{
    action?: 'view' | 'edit' | 'new';
    employee_id?: string;
    [key: string]: string | string[] | undefined;
  }>;
}

export default async function EmployeePage({ searchParams }: EmployeePageProps) {
  const resolvedSearchParams = await searchParams;
  const mode = (resolvedSearchParams.action as 'view' | 'edit' | 'new') || 'view';
  const employeeId = resolvedSearchParams.employee_id ?? '';

  // Empresa activa del request: el claim crudo dejaba `companyId: ''` en toda sesión que la
  // resuelve por cookie (panel de ropa, QR), sin que se notara.
  const companyId = await getActiveCompanyId();

  // Cargar empleado: única query bloqueante (cached con React.cache)
  let employee: Awaited<ReturnType<typeof getEmployeeByIdCached>> = null;

  if (mode !== 'new') {
    if (!employeeId) {
      notFound();
    }

    try {
      employee = await getEmployeeByIdCached(employeeId);
      if (!employee) {
        notFound();
      }
    } catch (error) {
      logger.error('Error al obtener empleado', { data: { error, employeeId } });
      notFound();
    }
  }

  // Normalizar searchParams para los slots (Record<string, string | undefined>)
  const searchParamsForSlots: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(resolvedSearchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  return (
    <EmployeeDetailClient
      // Al cambiar de empleado (o al terminar un alta) el estado interno se reinicia. NO incluye el
      // modo: `Editar` lo cambia con `replaceState`, y un `key` que cambiara al guardar desmontaría
      // el formulario con el guardado en curso.
      key={employeeId}
      employee={employee}
      employeeId={employeeId}
      initialMode={mode}
      header={employee ? <EmployeeHeaderContent employee={employee} /> : null}
      documentsSlot={
        employeeId ? <EmployeeDocumentDetail employeeId={employeeId} searchParams={resolvedSearchParams} /> : null
      }
      diagramsSlot={
        employeeId && employee ? (
          <Suspense fallback={<EmployeeDiagramsSkeleton />}>
            <EmployeeDiagramsSection
              employeeId={employeeId}
              companyId={companyId}
              employee={employee}
              searchParams={searchParamsForSlots}
            />
          </Suspense>
        ) : null
      }
      clothingSlot={
        employeeId ? (
          <Suspense fallback={<EmployeeDeliveriesTableSkeleton />}>
            <EmployeeDeliveriesTabContent employeeId={employeeId} searchParams={resolvedSearchParams} />
          </Suspense>
        ) : null
      }
    />
  );
}

// ─── Metadata ────────────────────────────────────────────────────────────────

export async function generateMetadata({ searchParams }: EmployeePageProps) {
  const resolvedSearchParams = await searchParams;
  const { employee_id } = resolvedSearchParams;

  if (!employee_id) {
    return {
      title: 'Registrar Nuevo Empleado',
      description: 'Crear y registrar un nuevo perfil de empleado en el sistema',
    };
  }

  // getEmployeeByIdCached está wrapped con React.cache — reutiliza el resultado
  // ya obtenido en el render principal sin hacer una query adicional
  const employee = await getEmployeeByIdCached(employee_id);
  return {
    title: employee ? `Empleado - ${employee.firstname} ${employee.lastname}` : 'Empleado no encontrado',
    description: 'Información detallada del empleado',
  };
}
