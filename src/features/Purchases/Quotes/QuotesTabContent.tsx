import { Button } from '@/components/ui/button';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { QuotesList } from './QuotesList/QuotesList';
import { QuotesTableSkeleton } from './QuotesList/fallback/QuotesTableSkeleton';

/** Pedidos de cotización (spec Compras etapa 2 §4). */
export default async function QuotesTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: Record<string, boolean>;
}) {
  if (permissions['compras:cotizaciones:view'] !== true) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;

  return (
    <div className="space-y-4">
      {permissions['compras:cotizaciones:create'] === true && (
        <div className="flex justify-end">
          <Button asChild variant="brand" size="sm">
            <Link href="/dashboard/purchases/quotes/new">
              <Plus className="mr-2 h-4 w-4" />
              Nuevo pedido de cotización
            </Link>
          </Button>
        </div>
      )}
      <Suspense fallback={<QuotesTableSkeleton />}>
        <QuotesList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
