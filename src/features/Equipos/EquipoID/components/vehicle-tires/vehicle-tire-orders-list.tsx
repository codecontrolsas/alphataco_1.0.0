import { getTablePreferences } from '@/shared/actions/table-preferences';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable';
import { getVehicleTireOrdersPaginated } from './actions/orders.server';
import { VehicleTireOrdersDataTable } from './vehicle-tire-orders/_VehicleTireOrdersDataTable';

// ============================================================================
// CONSTANTS
// ============================================================================

const TABLE_ID = 'vehicle-tire-orders';

// ============================================================================
// SERVER COMPONENT
// ============================================================================

interface VehicleTireOrdersListProps {
  vehicleId: string;
  searchParams: DataTableSearchParams;
}

export async function VehicleTireOrdersList({ vehicleId, searchParams }: VehicleTireOrdersListProps) {
  const tableParams = stripPrefixFromSearchParams(searchParams, TABLE_ID);

  const [{ data, total }, preferences] = await Promise.all([
    getVehicleTireOrdersPaginated(vehicleId, tableParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <VehicleTireOrdersDataTable
      vehicleId={vehicleId}
      data={data}
      totalRows={total}
      searchParams={tableParams}
      initialColumnVisibility={preferences.columnVisibility ?? {}}
      initialFilterVisibility={preferences.filterVisibility ?? {}}
    />
  );
}
