import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Suspense } from 'react';
import { NoPermission } from '../fallback/NoPermission';
import { canWarehouse, type PermissionsMap } from '../lib/permissions';
import { DepotFormDialog } from './components/DepotFormDialog';
import { DepotsList } from './components/DepotsList/DepotsList';
import { DepotsTableSkeleton } from './components/DepotsList/fallback/DepotsTableSkeleton';

export default async function DepotsTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: PermissionsMap;
}) {
  if (!canWarehouse(permissions, 'depositos', 'view')) return <NoPermission />;

  return (
    <div className="space-y-4">
      {canWarehouse(permissions, 'depositos', 'create') && (
        <div className="flex justify-end">
          <DepotFormDialog />
        </div>
      )}
      <Suspense fallback={<DepotsTableSkeleton />}>
        <DepotsList searchParams={searchParams} permissionsMap={permissions} />
      </Suspense>
    </div>
  );
}
