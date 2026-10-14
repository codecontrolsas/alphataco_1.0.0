import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Suspense } from 'react';
import { getVehiclesPaginated } from './actions/actions.server';
import { VehicleMetricsSection } from './components/VehicleMetricsSection';
import { _VehicleDataTable } from './components/_VehicleDataTable';
import { VehicleMetricsSkeleton } from './fallback/VehicleMetricsSkeleton';
import { getVehicleConditionMetrics } from './metrics.server';

// ============================================================================
// TYPES
// ============================================================================

interface VehicleListProps {
  searchParams: Record<string, string | string[] | undefined>;
  permissions: Record<string, boolean>;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export async function VehicleList({ searchParams, permissions }: VehicleListProps) {
  const tableId = 'vehicles';

  // Extraer solo los params de esta tabla (quitar prefijo)
  const tableParams = stripPrefixFromSearchParams(searchParams as DataTableSearchParams, tableId);

  // Las tarjetas arrancan YA, en paralelo con la tabla (si no, su consulta esperaría a que la tabla resuelva).
  const metrics = getVehicleConditionMetrics();
  const [{ data, total }, preferences] = await Promise.all([
    getVehiclesPaginated(tableParams),
    getTablePreferences(tableId),
  ]);

  return (
    <div className="space-y-6">
      {/* Las tarjetas resumen llegan por su propio Suspense: no frenan la tabla. */}
      <Suspense fallback={<VehicleMetricsSkeleton />}>
        <VehicleMetricsSection tableId={tableId} metrics={metrics} />
      </Suspense>

      <Card>
        <CardContent className="pt-6">
          <_VehicleDataTable
            data={data}
            totalRows={total}
            searchParams={tableParams}
            tableId={tableId}
            permissionsMap={permissions}
            initialColumnVisibility={preferences.columnVisibility ?? {}}
            initialFilterVisibility={preferences.filterVisibility ?? {}}
          />
        </CardContent>
      </Card>
    </div>
  );
}
