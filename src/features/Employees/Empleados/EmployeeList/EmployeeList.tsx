import { isModuleEnabled } from '@/features/Modules/server/modules.server';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { CatalogTableSurface } from '@/shared/components/common/CatalogFormSheet';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Suspense } from 'react';
import { getEmployeeStatusMetrics, getEmployeesPaginated } from './actions.server';
import { EmployeeMetricsSection } from './components/EmployeeMetricsSection';
import _EmployeeDataTable from './components/_EmployeeDataTable';
import { EmployeeMetricsSkeleton } from './fallback/EmployeeMetricsSkeleton';

// ============================================================================
// TYPES
// ============================================================================

interface EmployeeListProps {
  searchParams: Record<string, string | string[] | undefined>;
  isActive: boolean;
  permissions: Record<string, boolean>;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export default async function EmployeeList({ searchParams, isActive, permissions }: EmployeeListProps) {
  const tableId = isActive ? 'employees-active' : 'employees-inactive';

  // Extraer solo los params de esta tabla (quitar prefijo del namespace)
  const tableParams = stripPrefixFromSearchParams(searchParams as DataTableSearchParams, tableId);

  // Facets se cargan lazy (on-demand al abrir cada popover) — no en SSR
  // Las tarjetas arrancan YA, en paralelo con la tabla (si no, su consulta esperaría a que la tabla resuelva).
  const metrics = isActive ? getEmployeeStatusMetrics() : undefined;
  const [{ data, total }, preferences, showDocumentStatus] = await Promise.all([
    getEmployeesPaginated(tableParams, isActive),
    getTablePreferences(tableId),
    // `documentacion` apagado: sin tarjetas, columna ni filtro de estado documental (F3.2).
    isModuleEnabled('documentacion'),
  ]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Las tarjetas resumen sólo existen para los activos y llegan por su propio Suspense. */}
      {metrics && (
        <Suspense fallback={<EmployeeMetricsSkeleton />}>
          <EmployeeMetricsSection tableId={tableId} metrics={metrics} showDocumentStatus={showDocumentStatus} />
        </Suspense>
      )}

      <CatalogTableSurface>
        <_EmployeeDataTable
          data={data}
          totalRows={total}
          searchParams={tableParams}
          isActive={isActive}
          tableId={tableId}
          permissionsMap={permissions}
          showDocumentStatus={showDocumentStatus}
          initialColumnVisibility={preferences.columnVisibility ?? {}}
          initialFilterVisibility={preferences.filterVisibility ?? {}}
        />
      </CatalogTableSurface>
    </div>
  );
}
