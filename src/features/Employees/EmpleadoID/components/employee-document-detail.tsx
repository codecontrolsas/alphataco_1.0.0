import { MonthlyEmployeeDocumentsList } from '@/features/Documentacion/DocumentosEmpleados/Mensuales/MonthlyEmployeeDocumentsList';
import { MonthlyEmployeeDocumentsSkeleton } from '@/features/Documentacion/DocumentosEmpleados/Mensuales/fallback/MonthlyEmployeeDocumentsSkeleton';
import { EmployeePermanentDocumentsList } from '@/features/Documentacion/DocumentosEmpleados/Permanentes/EmployeePermanentDocumentsList';
import { EmployeePermanentDocumentsSkeleton } from '@/features/Documentacion/DocumentosEmpleados/Permanentes/fallback/EmployeePermanentDocumentsSkeleton';
import { getUserPermissionsMapServer } from '@/features/Permissions';
import { TabsManagerServer } from '@/features/TabsManager';
import { Calendar, FileArchive } from 'lucide-react';
import { Suspense } from 'react';

// ============================================================================
// TYPES
// ============================================================================

interface EmployeeDocumentDetailProps {
  employeeId: string;
  searchParams: Record<string, string | string[] | undefined>;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export async function EmployeeDocumentDetail({ employeeId, searchParams }: EmployeeDocumentDetailProps) {
  // Obtener permisos (usa cache pre-cargado en layout, sin query adicional)
  const permissions = await getUserPermissionsMapServer();

  return (
    <TabsManagerServer
      paramName="subtab"
      searchParams={searchParams}
      defaultTab="permanentes"
      permissions={permissions}
      tabs={[
        {
          value: 'permanentes',
          label: (
            <span className="flex items-center gap-2">
              <FileArchive className="h-4 w-4" />
              Documentos Permanentes
            </span>
          ),
          moduleSlug: 'documentacion',
          tabSlug: 'docs-empleados-permanentes',
          content: (
            <div>
              <Suspense fallback={<EmployeePermanentDocumentsSkeleton />}>
                <EmployeePermanentDocumentsList searchParams={searchParams} employeeId={employeeId} />
              </Suspense>
            </div>
          ),
        },
        {
          value: 'mensuales',
          label: (
            <span className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Documentos Mensuales
            </span>
          ),
          moduleSlug: 'documentacion',
          tabSlug: 'docs-empleados-mensuales',
          content: (
            <div>
              <Suspense fallback={<MonthlyEmployeeDocumentsSkeleton />}>
                <MonthlyEmployeeDocumentsList searchParams={searchParams} employeeId={employeeId} />
              </Suspense>
            </div>
          ),
        },
      ]}
    />
  );
}
