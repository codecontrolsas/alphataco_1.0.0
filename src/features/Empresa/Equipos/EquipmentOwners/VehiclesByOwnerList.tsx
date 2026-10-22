'use client';

import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import { _VehiclesByOwnerDataTable } from './_VehiclesByOwnerDataTable';

// ============================================================================
// TABLE ID
// ============================================================================

export const VEHICLES_BY_OWNER_TABLE_ID = 'vehicles-by-owner';

// ============================================================================
// CLIENT COMPONENT — se renderiza dentro de _EquipmentOwnerDataTable (Client)
// No puede ser async Server Component porque su padre es 'use client'.
// Los datos se cargan via queryFn del DataTable internamente.
// ============================================================================

interface VehiclesByOwnerListProps {
  ownerId: string;
  ownerName: string;
  searchParams: DataTableSearchParams;
}

export function VehiclesByOwnerList({ ownerId, ownerName, searchParams }: VehiclesByOwnerListProps) {
  const tableParams = stripPrefixFromSearchParams(searchParams, VEHICLES_BY_OWNER_TABLE_ID);

  return (
    <_VehiclesByOwnerDataTable
      ownerId={ownerId}
      ownerName={ownerName}
      data={[]}
      totalRows={0}
      searchParams={tableParams}
      tableId={VEHICLES_BY_OWNER_TABLE_ID}
      initialColumnVisibility={{}}
      initialFilterVisibility={{}}
    />
  );
}
