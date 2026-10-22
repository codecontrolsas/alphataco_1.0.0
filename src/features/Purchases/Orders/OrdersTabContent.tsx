import { TableSkeleton } from '@/shared/components/skeletons/TableSkeleton';
import { Button } from '@/components/ui/button';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { OrdersList } from './OrdersList/OrdersList';


/** Órdenes de compra (spec Compras etapa 2 §4). */
export default async function OrdersTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: Record<string, boolean>;
}) {
  if (permissions['compras:ordenes:view'] !== true) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;

  return (
    <div className="space-y-4">
      {permissions['compras:ordenes:create'] === true && (
        <div className="flex justify-end">
          <Button asChild variant="brand" size="sm">
            <Link href="/dashboard/purchases/orders/new">
              <Plus className="mr-2 h-4 w-4" />
              Nueva orden de compra
            </Link>
          </Button>
        </div>
      )}
      <Suspense fallback={<TableSkeleton inCard columnCount={7} rowCount={7} />}>
        <OrdersList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
