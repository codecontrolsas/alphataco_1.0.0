import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Suspense } from 'react';
import { NoPermission } from '../fallback/NoPermission';
import { canWarehouse, type PermissionsMap } from '../lib/permissions';
import { BatchExpiryAlert } from './components/BatchExpiryAlert';
import { BelowMinimumAlert } from './components/BelowMinimumAlert';
import { StockList } from './components/StockList/StockList';
import { StockTableSkeleton } from './components/StockList/fallback/StockTableSkeleton';

export default async function StockTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: PermissionsMap;
}) {
  if (!canWarehouse(permissions, 'stock', 'view')) return <NoPermission />;

  return (
    <div className="space-y-4">
      {/* Sin fallback visible: el aviso aparece solo si hay algo que avisar, y un skeleton
          anunciaria un bloque que la mayoria de las veces no existe. */}
      <Suspense fallback={null}>
        <BatchExpiryAlert />
      </Suspense>
      <Suspense fallback={null}>
        <BelowMinimumAlert />
      </Suspense>
      <Suspense fallback={<StockTableSkeleton />}>
        <StockList searchParams={searchParams} permissionsMap={permissions} />
      </Suspense>
    </div>
  );
}
