import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getDueInvoicesAttention, getDueInvoicesPaginated } from './actions.server';
import { _DueInvoicesDataTable } from './components/_DueInvoicesDataTable';
import { DUE_INVOICES_TABLE_ID as TABLE_ID } from './constants';
import { DueInvoicesAttentionSection } from './DueInvoicesAttentionSection';

interface Props {
  searchParams: DataTableSearchParams;
  /** `permissions['compras:pagos:create']`: habilita "Armar orden de pago". */
  canCreate?: boolean;
}

export async function DueInvoicesList({ searchParams, canCreate = false }: Props) {
  const tableParams = stripPrefixFromSearchParams(searchParams, TABLE_ID);

  // La banda arranca antes de esperar la tabla: su Suspense la resuelve sin frenarla.
  const attention = getDueInvoicesAttention();
  const daysParam = tableParams.days;
  const serverDays = typeof daysParam === 'string' ? daysParam : null;

  // Los facets se cargan lazy en el cliente (al abrir cada filtro), no en SSR.
  const [{ data, total }, preferences] = await Promise.all([
    getDueInvoicesPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <Card>
      <CardContent className="pt-6">
        <_DueInvoicesDataTable
          data={data}
          totalRows={total}
          searchParams={tableParams}
          tableId={TABLE_ID}
          canCreate={canCreate}
          topSlot={<DueInvoicesAttentionSection attention={attention} serverDays={serverDays} />}
          initialColumnVisibility={preferences.columnVisibility ?? {}}
          initialFilterVisibility={preferences.filterVisibility ?? {}}
        />
      </CardContent>
    </Card>
  );
}
