import { TableSkeleton } from '@/shared/components/skeletons/TableSkeleton';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getActiveMoneyAccountOptions } from '../actions/accounts.server';
import { Suspense } from 'react';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { NewTransferButton } from './components/NewTransferButton';

import { TransfersList } from './TransfersList/TransfersList';

/** Tab Transferencias: traspasos entre cuentas y cajas. Alta con `create`; anular con `update`. */
export default async function TransfersTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: Record<string, boolean>;
}) {
  if (permissions['tesoreria:transferencias:view'] !== true) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;
  const canCreate = permissions['tesoreria:transferencias:create'] === true;
  const canUpdate = permissions['tesoreria:transferencias:update'] === true;
  const accounts = canCreate ? await getActiveMoneyAccountOptions() : [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canCreate && <NewTransferButton accounts={accounts} />}
      </div>
      <Suspense fallback={<TableSkeleton inCard columnCount={6} rowCount={6} />}>
        <TransfersList searchParams={searchParams} canUpdate={canUpdate} />
      </Suspense>
    </div>
  );
}
