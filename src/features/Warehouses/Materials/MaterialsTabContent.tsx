import { TableSkeleton } from '@/shared/components/skeletons/TableSkeleton';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Suspense } from 'react';
import { getMaterialFormLookups } from '../actions/catalog.server';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { canWarehouse, type PermissionsMap } from '../lib/permissions';
import { MaterialFormDialog } from './components/MaterialFormDialog';
import { MaterialsList } from './components/MaterialsList/MaterialsList';


export default async function MaterialsTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: PermissionsMap;
}) {
  if (!canWarehouse(permissions, 'materiales', 'view')) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información." />;
  const canCreate = canWarehouse(permissions, 'materiales', 'create');
  const lookups = canCreate ? await getMaterialFormLookups() : null;

  return (
    <div className="space-y-4">
      {lookups && (
        <div className="flex justify-end">
          <MaterialFormDialog lookups={lookups} />
        </div>
      )}
      <Suspense fallback={<TableSkeleton inCard columnCount={8} rowCount={8} />}>
        <MaterialsList searchParams={searchParams} permissionsMap={permissions} />
      </Suspense>
    </div>
  );
}
