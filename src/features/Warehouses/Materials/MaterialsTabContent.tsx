import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Suspense } from 'react';
import { getMaterialFormLookups } from '../actions/catalog.server';
import { NoPermission } from '../fallback/NoPermission';
import { canWarehouse, type PermissionsMap } from '../lib/permissions';
import { MaterialFormDialog } from './components/MaterialFormDialog';
import { MaterialsList } from './components/MaterialsList/MaterialsList';
import { MaterialsTableSkeleton } from './components/MaterialsList/fallback/MaterialsTableSkeleton';

export default async function MaterialsTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: PermissionsMap;
}) {
  if (!canWarehouse(permissions, 'materiales', 'view')) return <NoPermission />;
  const canCreate = canWarehouse(permissions, 'materiales', 'create');
  const lookups = canCreate ? await getMaterialFormLookups() : null;

  return (
    <div className="space-y-4">
      {lookups && (
        <div className="flex justify-end">
          <MaterialFormDialog lookups={lookups} />
        </div>
      )}
      <Suspense fallback={<MaterialsTableSkeleton />}>
        <MaterialsList searchParams={searchParams} permissionsMap={permissions} />
      </Suspense>
    </div>
  );
}
