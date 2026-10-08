import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Suspense } from 'react';
import { NoPermission } from '../fallback/NoPermission';
import { canWarehouse, type PermissionsMap } from '../lib/permissions';
import { LoansList } from './components/LoansList/LoansList';
import { LoansTableSkeleton } from './components/LoansList/fallback/LoansTableSkeleton';

/** Herramientas prestadas: quien tiene cada una y desde cuando (spec etapa 2 §4.1). */
export default async function LoansTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: PermissionsMap;
}) {
  if (!canWarehouse(permissions, 'prestamos', 'view')) return <NoPermission />;

  return (
    <Suspense fallback={<LoansTableSkeleton />}>
      <LoansList searchParams={searchParams} permissionsMap={permissions} />
    </Suspense>
  );
}
