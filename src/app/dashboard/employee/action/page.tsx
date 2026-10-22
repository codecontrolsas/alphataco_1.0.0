import { getEmployeeByIdCached } from '@/features/Employees/EmpleadoID/actions.server';
import { EmployeeDetailClient } from '@/features/Employees/EmpleadoID/components/EmployeeDetailClient';
import { EmployeeReadView } from '@/features/Employees/EmpleadoID/components/view/EmployeeReadView';
import { canViewServer, checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { notFound } from 'next/navigation';

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

  // Gate por modo (permisos de `empleados:employees`): alta → create, edición → update, lectura → view.
  // Un `?action=edit` o `?action=new` armado a mano no abre el formulario sin el permiso correspondiente.
  const allowed =
    mode === 'new'
      ? await checkPermissionServer('empleados', 'employees', 'create')
      : mode === 'edit'
        ? await checkPermissionServer('empleados', 'employees', 'update')
        : await canViewServer('empleados', 'employees');
  if (!allowed) notFound();

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

  return (
    <EmployeeDetailClient
      // Al cambiar de empleado (o al terminar un alta) el estado interno se reinicia. NO incluye el
      // modo: `Editar` lo cambia con `replaceState`, y un `key` que cambiara al guardar desmontaría
      // el formulario con el guardado en curso.
      key={employeeId}
      employee={employee}
      employeeId={employeeId}
      initialMode={mode}
      readView={employee ? <EmployeeReadView employee={employee} searchParams={resolvedSearchParams} /> : null}
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
