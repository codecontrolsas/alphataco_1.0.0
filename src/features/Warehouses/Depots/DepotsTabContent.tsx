import { TableSkeleton } from '@/shared/components/skeletons/TableSkeleton';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Suspense } from 'react';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { canWarehouse, type PermissionsMap } from '../lib/permissions';
import { DepotFormDialog } from './components/DepotFormDialog';
import { DepotsList } from './components/DepotsList/DepotsList';


export default async function DepotsTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: PermissionsMap;
}) {
  if (!canWarehouse(permissions, 'depositos', 'view')) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información." />;

  return (
    <div className="space-y-4">
      {canWarehouse(permissions, 'depositos', 'create') && (
        <div className="flex justify-end">
          <DepotFormDialog />
        </div>
      )}
      <Suspense fallback={<TableSkeleton inCard columnCount={6} rowCount={8} />}>
        <DepotsList searchParams={searchParams} permissionsMap={permissions} />
      </Suspense>
    </div>
  );
}
