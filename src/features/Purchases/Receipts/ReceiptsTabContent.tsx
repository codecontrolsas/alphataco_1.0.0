import { TableSkeleton } from '@/shared/components/skeletons/TableSkeleton';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Suspense } from 'react';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { ReceiptsList } from './ReceiptsList/ReceiptsList';


/**
 * Recepciones (spec Compras etapa 3 §4). No hay "Nueva recepcion": se registra desde el detalle
 * de la orden de compra, que es donde se sabe que se esta recibiendo.
 */
export default async function ReceiptsTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: Record<string, boolean>;
}) {
  if (permissions['compras:recepciones:view'] !== true) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Para registrar una recepción, abrí la orden de compra y tocá «Registrar recepción».</p>
      <Suspense fallback={<TableSkeleton inCard columnCount={6} rowCount={6} />}>
        <ReceiptsList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
