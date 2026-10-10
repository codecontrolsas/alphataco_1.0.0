import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getActiveTreasuryAccountOptions } from '../actions/accounts.server';
import { Suspense } from 'react';
import { NoPermission } from '../fallback/NoPermission';
import { NewTransferButton } from './components/NewTransferButton';
import { TransfersTableSkeleton } from './TransfersList/fallback/TransfersTableSkeleton';
import { TransfersList } from './TransfersList/TransfersList';

/** Tab Transferencias: traspasos entre cuentas y cajas. Alta con `create`; anular con `update`. */
export default async function TransfersTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: Record<string, boolean>;
}) {
  if (permissions['tesoreria:transferencias:view'] !== true) return <NoPermission />;
  const canCreate = permissions['tesoreria:transferencias:create'] === true;
  const canUpdate = permissions['tesoreria:transferencias:update'] === true;
  const accounts = canCreate ? await getActiveTreasuryAccountOptions() : [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canCreate && <NewTransferButton accounts={accounts} />}
      </div>
      <Suspense fallback={<TransfersTableSkeleton />}>
        <TransfersList searchParams={searchParams} canUpdate={canUpdate} />
      </Suspense>
    </div>
  );
}
