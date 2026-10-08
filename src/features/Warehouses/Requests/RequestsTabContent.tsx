import { Button } from '@/components/ui/button';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { NoPermission } from '../fallback/NoPermission';
import { canWarehouse, type PermissionsMap } from '../lib/permissions';
import { RequestsList } from './components/RequestsList/RequestsList';
import { RequestsTableSkeleton } from './components/RequestsList/fallback/RequestsTableSkeleton';

/** Pedidos de materiales (spec etapa 3 §4.2). */
export default async function RequestsTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: PermissionsMap;
}) {
  if (!canWarehouse(permissions, 'pedidos', 'view')) return <NoPermission />;

  return (
    <div className="space-y-4">
      {canWarehouse(permissions, 'pedidos', 'create') && (
        <div className="flex justify-end">
          <Button asChild variant="brand" size="sm">
            <Link href="/dashboard/warehouse/requests/new">
              <Plus className="mr-2 h-4 w-4" />
              Nuevo pedido
            </Link>
          </Button>
        </div>
      )}
      <Suspense fallback={<RequestsTableSkeleton />}>
        <RequestsList searchParams={searchParams} permissionsMap={permissions} />
      </Suspense>
    </div>
  );
}
