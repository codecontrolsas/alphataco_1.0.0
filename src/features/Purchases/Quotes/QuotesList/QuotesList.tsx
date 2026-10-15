import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getPurchaseQuotesAttention, getPurchaseQuotesPaginated } from './actions.server';
import { _QuotesDataTable } from './components/_QuotesDataTable';
import { QUOTES_TABLE_ID as TABLE_ID } from './constants';
import { QuotesAttentionSection } from './QuotesAttentionSection';

export async function QuotesList({ searchParams }: { searchParams: DataTableSearchParams }) {
  const tableParams = stripPrefixFromSearchParams(searchParams, TABLE_ID);

  // La banda arranca antes de esperar la tabla: su Suspense la resuelve sin frenarla.
  const attention = getPurchaseQuotesAttention();
  const statusParam = tableParams.status;
  const serverStatus = typeof statusParam === 'string' ? statusParam : null;

  // Los facets se cargan lazy en el cliente (al abrir cada filtro), no en SSR.
  const [{ data, total }, preferences] = await Promise.all([
    getPurchaseQuotesPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <Card>
      <CardContent className="pt-6">
        <_QuotesDataTable
          data={data}
          totalRows={total}
          searchParams={tableParams}
          tableId={TABLE_ID}
          topSlot={<QuotesAttentionSection attention={attention} serverStatus={serverStatus} />}
          initialColumnVisibility={preferences.columnVisibility ?? {}}
          initialFilterVisibility={preferences.filterVisibility ?? {}}
        />
      </CardContent>
    </Card>
  );
}
