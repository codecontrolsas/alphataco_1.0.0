import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getPurchaseReceiptsAttention, getPurchaseReceiptsPaginated } from './actions.server';
import { _ReceiptsDataTable } from './components/_ReceiptsDataTable';
import { RECEIPTS_TABLE_ID as TABLE_ID } from './constants';
import { ReceiptsAttentionSection } from './ReceiptsAttentionSection';

export async function ReceiptsList({ searchParams }: { searchParams: DataTableSearchParams }) {
  const tableParams = stripPrefixFromSearchParams(searchParams, TABLE_ID);

  // La banda arranca antes de esperar la tabla: su Suspense la resuelve sin frenarla.
  const attention = getPurchaseReceiptsAttention();

  // Los facets se cargan lazy en el cliente (al abrir cada filtro), no en SSR.
  const [{ data, total }, preferences] = await Promise.all([
    getPurchaseReceiptsPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <Card>
      <CardContent className="pt-6">
        <_ReceiptsDataTable
          data={data}
          totalRows={total}
          searchParams={tableParams}
          tableId={TABLE_ID}
          topSlot={<ReceiptsAttentionSection attention={attention} />}
          initialColumnVisibility={preferences.columnVisibility ?? {}}
          initialFilterVisibility={preferences.filterVisibility ?? {}}
        />
      </CardContent>
    </Card>
  );
}
