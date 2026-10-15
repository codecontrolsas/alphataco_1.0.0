import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { OrdersAttentionSection } from './OrdersAttentionSection';
import { getPurchaseOrdersAttention, getPurchaseOrdersPaginated } from './actions.server';
import { _OrdersDataTable } from './components/_OrdersDataTable';
import { ORDERS_TABLE_ID as TABLE_ID } from './constants';

export async function OrdersList({ searchParams }: { searchParams: DataTableSearchParams }) {
  const tableParams = stripPrefixFromSearchParams(searchParams, TABLE_ID);

  // Las bandas arrancan antes de esperar la tabla: su Suspense las resuelve sin frenarla.
  const attention = getPurchaseOrdersAttention();
  const statusParam = tableParams.status;
  const serverStatus = typeof statusParam === 'string' ? statusParam : null;

  // Los facets se cargan lazy en el cliente (al abrir cada filtro), no en SSR.
  const [{ data, total, canViewPrices }, preferences] = await Promise.all([
    getPurchaseOrdersPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <Card>
      <CardContent className="pt-6">
        <_OrdersDataTable
          data={data}
          totalRows={total}
          canViewPrices={canViewPrices}
          searchParams={tableParams}
          tableId={TABLE_ID}
          topSlot={<OrdersAttentionSection attention={attention} serverStatus={serverStatus} />}
          initialColumnVisibility={preferences.columnVisibility ?? {}}
          initialFilterVisibility={preferences.filterVisibility ?? {}}
        />
      </CardContent>
    </Card>
  );
}
