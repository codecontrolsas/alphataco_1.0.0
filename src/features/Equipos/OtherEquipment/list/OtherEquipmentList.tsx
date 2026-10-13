import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { applyTablePreferences, stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Suspense } from 'react';
import { getOtherEquipmentPaginated } from './actions.server';
import { OtherEquipmentMetricsSection } from './components/OtherEquipmentMetricsSection';
import { _OtherEquipmentDataTable } from './components/_OtherEquipmentDataTable';
import { OtherEquipmentMetricsSkeleton } from './fallback/OtherEquipmentMetricsSkeleton';

// ============================================================================
// TYPES
// ============================================================================

interface OtherEquipmentListProps {
  searchParams: Record<string, string | string[] | undefined>;
  permissions: Record<string, boolean>;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export async function OtherEquipmentList({ searchParams, permissions }: OtherEquipmentListProps) {
  const tableId = 'other-equipment';

  // Extraer solo los params de esta tabla (quitar prefijo)
  const urlParams = stripPrefixFromSearchParams(searchParams as DataTableSearchParams, tableId);

  // Las preferencias se leen ANTES del fetch: completan los params que la URL no trae
  // (filas por página y orden guardados), para que el SSR muestre lo mismo que el cliente.
  const preferences = await getTablePreferences(tableId);
  const tableParams = applyTablePreferences(urlParams, preferences);

  const { data, total } = await getOtherEquipmentPaginated(tableParams);

  return (
    <div className="space-y-6">
      {/* Las tarjetas resumen llegan por su propio Suspense: no frenan la tabla. */}
      <Suspense fallback={<OtherEquipmentMetricsSkeleton />}>
        <OtherEquipmentMetricsSection tableId={tableId} />
      </Suspense>

      <Card>
        <CardContent className="pt-6">
          <_OtherEquipmentDataTable
            data={data}
            totalRows={total}
            searchParams={tableParams}
            tableId={tableId}
            permissionsMap={permissions}
            initialColumnVisibility={preferences.columnVisibility ?? {}}
            initialFilterVisibility={preferences.filterVisibility ?? {}}
            initialPageSize={preferences.pageSize}
            initialSorting={preferences.sorting}
            initialColumnOrder={preferences.columnOrder}
          />
        </CardContent>
      </Card>
    </div>
  );
}
