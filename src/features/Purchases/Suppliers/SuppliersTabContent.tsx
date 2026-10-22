import { TableSkeleton } from '@/shared/components/skeletons/TableSkeleton';
import { Button } from '@/components/ui/button';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { SuppliersList } from './SuppliersList/SuppliersList';


/** Proveedores (spec Compras etapa 1 §4). */
export default async function SuppliersTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: Record<string, boolean>;
}) {
  if (permissions['compras:proveedores:view'] !== true) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;

  return (
    <div className="space-y-4">
      {permissions['compras:proveedores:create'] === true && (
        <div className="flex justify-end">
          <Button asChild variant="brand" size="sm">
            <Link href="/dashboard/purchases/suppliers/new">
              <Plus className="mr-2 h-4 w-4" />
              Nuevo proveedor
            </Link>
          </Button>
        </div>
      )}
      <Suspense fallback={<TableSkeleton inCard columnCount={7} rowCount={7} />}>
        <SuppliersList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
