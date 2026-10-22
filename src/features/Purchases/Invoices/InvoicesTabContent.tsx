import { TableSkeleton } from '@/shared/components/skeletons/TableSkeleton';
import { Button } from '@/components/ui/button';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { InvoicesList } from './InvoicesList/InvoicesList';


/** Facturas, notas de débito y de crédito de proveedores (spec Compras etapa 4 §4). */
export default async function InvoicesTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: Record<string, boolean>;
}) {
  if (permissions['compras:facturas:view'] !== true) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;

  return (
    <div className="space-y-4">
      {permissions['compras:facturas:create'] === true && (
        <div className="flex justify-end">
          <Button asChild variant="brand" size="sm">
            <Link href="/dashboard/purchases/invoices/new">
              <Plus className="mr-2 h-4 w-4" />
              Cargar comprobante
            </Link>
          </Button>
        </div>
      )}
      <Suspense fallback={<TableSkeleton inCard columnCount={6} rowCount={6} />}>
        <InvoicesList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
