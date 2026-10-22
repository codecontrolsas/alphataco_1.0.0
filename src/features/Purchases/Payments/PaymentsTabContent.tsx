import { TableSkeleton } from '@/shared/components/skeletons/TableSkeleton';
import { Button } from '@/components/ui/button';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { DueInvoicesList } from './DueInvoicesList/DueInvoicesList';

import { PaymentOrdersList } from './PaymentOrdersList/PaymentOrdersList';

import { PaymentsViewNav, resolvePaymentsView } from './PaymentsViewNav';

/**
 * Pagos (spec Compras etapa 5 §5): vencimientos de los comprobantes y ordenes de pago.
 * La vista activa viaja en la URL (`?vista=vencimientos|ordenes`) y solo se renderiza y consulta esa vista.
 */
export default async function PaymentsTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: Record<string, boolean>;
}) {
  if (permissions['compras:pagos:view'] !== true) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;
  const canCreate = permissions['compras:pagos:create'] === true;
  const view = resolvePaymentsView(searchParams);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PaymentsViewNav searchParams={searchParams} active={view} />
        {canCreate && (
          <Button asChild variant="brand" size="sm">
            <Link href="/dashboard/purchases/payments/new">
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Nueva orden de pago
            </Link>
          </Button>
        )}
      </div>
      {view === 'vencimientos' ? (
        <Suspense key="vencimientos" fallback={<TableSkeleton inCard columnCount={6} rowCount={6} />}>
          <DueInvoicesList searchParams={searchParams} canCreate={canCreate} />
        </Suspense>
      ) : (
        <Suspense key="ordenes" fallback={<TableSkeleton inCard columnCount={6} rowCount={6} />}>
          <PaymentOrdersList searchParams={searchParams} />
        </Suspense>
      )}
    </div>
  );
}
