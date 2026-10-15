import { Button } from '@/components/ui/button';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { RequestsList } from './RequestsList/RequestsList';
import { RequestsTableSkeleton } from './RequestsList/fallback/RequestsTableSkeleton';

/** Solicitudes de compra (spec Compras etapa 1 §4). */
export default async function RequestsTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: Record<string, boolean>;
}) {
  if (permissions['compras:solicitudes:view'] !== true) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;

  return (
    <div className="space-y-4">
      {permissions['compras:solicitudes:create'] === true && (
        <div className="flex justify-end">
          <Button asChild variant="brand" size="sm">
            <Link href="/dashboard/purchases/requests/new">
              <Plus className="mr-2 h-4 w-4" />
              Nueva solicitud
            </Link>
          </Button>
        </div>
      )}
      <Suspense fallback={<RequestsTableSkeleton />}>
        <RequestsList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
