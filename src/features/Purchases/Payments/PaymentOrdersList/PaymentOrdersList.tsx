import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getPaymentOrdersAttention, getPaymentOrdersPaginated } from './actions.server';
import { _PaymentOrdersDataTable } from './components/_PaymentOrdersDataTable';
import { PAYMENT_ORDERS_TABLE_ID as TABLE_ID } from './constants';
import { PaymentOrdersAttentionSection } from './PaymentOrdersAttentionSection';

export async function PaymentOrdersList({ searchParams }: { searchParams: DataTableSearchParams }) {
  const tableParams = stripPrefixFromSearchParams(searchParams, TABLE_ID);

  // Las bandas arrancan antes de esperar la tabla: su Suspense las resuelve sin frenarla.
  const attention = getPaymentOrdersAttention();
  const statusParam = tableParams.status;
  const serverStatus = typeof statusParam === 'string' ? statusParam : null;

  // Los facets se cargan lazy en el cliente (al abrir cada filtro), no en SSR.
  const [{ data, total }, preferences] = await Promise.all([
    getPaymentOrdersPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <Card>
      <CardContent className="pt-6">
        <_PaymentOrdersDataTable
          data={data}
          totalRows={total}
          searchParams={tableParams}
          tableId={TABLE_ID}
          topSlot={<PaymentOrdersAttentionSection attention={attention} serverStatus={serverStatus} />}
          initialColumnVisibility={preferences.columnVisibility ?? {}}
          initialFilterVisibility={preferences.filterVisibility ?? {}}
        />
      </CardContent>
    </Card>
  );
}
