import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getActiveMoneyAccountOptions } from '../actions/accounts.server';
import { getTreasuryConcepts } from '../actions/concepts.server';
import { Suspense } from 'react';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { NewMovementButton } from './components/NewMovementButton';
import { MovementsList } from './MovementsList/MovementsList';
import { MovementsTableSkeleton } from './MovementsList/fallback/MovementsTableSkeleton';

/**
 * Tab Movimientos: todos los movimientos de las cuentas y cajas (manuales, saldos iniciales,
 * transferencias y pagos de Compras). Alta con `create`; editar y anular manuales con `update`.
 */
export default async function MovementsTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: Record<string, boolean>;
}) {
  if (permissions['tesoreria:movimientos:view'] !== true) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;
  const canCreate = permissions['tesoreria:movimientos:create'] === true;
  const canUpdate = permissions['tesoreria:movimientos:update'] === true;
  const [accounts, concepts] = canCreate || canUpdate ? await Promise.all([getActiveMoneyAccountOptions(), getTreasuryConcepts()]) : [[], []];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canCreate && <NewMovementButton accounts={accounts} concepts={concepts} />}
      </div>
      <Suspense fallback={<MovementsTableSkeleton />}>
        <MovementsList searchParams={searchParams} canUpdate={canUpdate} accounts={accounts} concepts={concepts} />
      </Suspense>
    </div>
  );
}
