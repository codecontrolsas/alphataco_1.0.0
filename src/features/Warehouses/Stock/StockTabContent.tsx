import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Suspense } from 'react';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { canWarehouse, type PermissionsMap } from '../lib/permissions';
import { StockList } from './components/StockList/StockList';
import { StockTableSkeleton } from './components/StockList/fallback/StockTableSkeleton';

export default async function StockTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: PermissionsMap;
}) {
  if (!canWarehouse(permissions, 'stock', 'view')) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información." />;

  return (
    <div className="space-y-4">
      <Suspense fallback={<StockTableSkeleton />}>
        <StockList searchParams={searchParams} permissionsMap={permissions} />
      </Suspense>
    </div>
  );
}
