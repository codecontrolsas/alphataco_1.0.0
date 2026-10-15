import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getRequestsAttention, getRequestsPaginated } from './actions.server';
import { _RequestsDataTable } from './components/_RequestsDataTable';
import { REQUESTS_TABLE_ID as TABLE_ID } from './constants';
import { RequestsAttentionSection } from './RequestsAttentionSection';

interface RequestsListProps {
  searchParams: DataTableSearchParams;
  permissionsMap: Record<string, boolean>;
}

export async function RequestsList({ searchParams, permissionsMap }: RequestsListProps) {
  const tableParams = stripPrefixFromSearchParams(searchParams, TABLE_ID);

  // La banda arranca antes de esperar la tabla: su Suspense la resuelve sin frenarla.
  const attention = getRequestsAttention();
  const statusParam = tableParams.status;
  const serverStatus = typeof statusParam === 'string' ? statusParam : null;

  // Los facets se cargan lazy en el cliente (al abrir cada filtro), no en SSR.
  const [{ data, total }, preferences] = await Promise.all([
    getRequestsPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <Card>
      <CardContent className="pt-6">
        <_RequestsDataTable
          data={data}
          totalRows={total}
          searchParams={tableParams}
          tableId={TABLE_ID}
          topSlot={<RequestsAttentionSection attention={attention} serverStatus={serverStatus} />}
          permissionsMap={permissionsMap}
          initialColumnVisibility={preferences.columnVisibility ?? {}}
          initialFilterVisibility={preferences.filterVisibility ?? {}}
        />
      </CardContent>
    </Card>
  );
}
