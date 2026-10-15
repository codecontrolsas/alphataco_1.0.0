import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { _EquipmentOwnerDataTable } from './_EquipmentOwnerDataTable';
import { getEquipmentOwnersPaginated } from './owners.server';

// ============================================================================
// TABLE ID
// ============================================================================

export const EQUIPMENT_OWNER_TABLE_ID = 'equipment-owners';

// ============================================================================
// SERVER COMPONENT — mismo patrón que EquipmentTypeList
// ============================================================================

interface EquipmentOwnerListProps {
  searchParams: Record<string, string | string[] | undefined>;
  permissions: Record<string, boolean>;
}

export default async function EquipmentOwnerList({ searchParams, permissions }: EquipmentOwnerListProps) {
  const tableParams = stripPrefixFromSearchParams(searchParams as DataTableSearchParams, EQUIPMENT_OWNER_TABLE_ID);

  const [{ data, total }, preferences] = await Promise.all([
    getEquipmentOwnersPaginated(tableParams),
    getTablePreferences(EQUIPMENT_OWNER_TABLE_ID),
  ]);

  return (
    <_EquipmentOwnerDataTable
      data={data}
      totalRows={total}
      searchParams={tableParams}
      tableId={EQUIPMENT_OWNER_TABLE_ID}
      permissionsMap={permissions}
      initialColumnVisibility={preferences.columnVisibility ?? {}}
      initialFilterVisibility={preferences.filterVisibility ?? {}}
    />
  );
}
