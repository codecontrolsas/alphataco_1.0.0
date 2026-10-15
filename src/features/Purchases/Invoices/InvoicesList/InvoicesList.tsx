import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getSupplierInvoicesAttention, getSupplierInvoicesPaginated } from './actions.server';
import { _InvoicesDataTable } from './components/_InvoicesDataTable';
import { INVOICES_TABLE_ID as TABLE_ID } from './constants';
import { InvoicesAttentionSection } from './InvoicesAttentionSection';

export async function InvoicesList({ searchParams }: { searchParams: DataTableSearchParams }) {
  const tableParams = stripPrefixFromSearchParams(searchParams, TABLE_ID);

  // La banda arranca antes de esperar la tabla: su Suspense la resuelve sin frenarla.
  const attention = getSupplierInvoicesAttention();
  const statusParam = tableParams.status;
  const serverStatus = typeof statusParam === 'string' ? statusParam : null;

  // Los facets se cargan lazy en el cliente (al abrir cada filtro), no en SSR.
  const [{ data, total }, preferences] = await Promise.all([
    getSupplierInvoicesPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <Card>
      <CardContent className="pt-6">
        <_InvoicesDataTable
          data={data}
          totalRows={total}
          searchParams={tableParams}
          tableId={TABLE_ID}
          topSlot={<InvoicesAttentionSection attention={attention} serverStatus={serverStatus} />}
          initialColumnVisibility={preferences.columnVisibility ?? {}}
          initialFilterVisibility={preferences.filterVisibility ?? {}}
        />
      </CardContent>
    </Card>
  );
}
