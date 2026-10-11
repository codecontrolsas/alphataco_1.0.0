import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getChecksPaginated } from './actions.server';
import { _ChecksDataTable } from './components/_ChecksDataTable';

export const CHECKS_TABLE_ID = 'treasury-checks';
const TABLE_ID = CHECKS_TABLE_ID;

interface Props {
  searchParams: DataTableSearchParams;
  permissionsMap: Record<string, boolean>;
}

/** Cheques de terceros de la empresa. El filtro inicial "En cartera" lo pone la tab en la URL (ChecksTabContent). */
export async function ChecksList({ searchParams, permissionsMap }: Props) {
  const tableParams = stripPrefixFromSearchParams(searchParams, TABLE_ID);

  // Los facets se cargan lazy en el cliente (al abrir cada filtro), no en SSR.
  const [{ data, total }, preferences] = await Promise.all([
    getChecksPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <Card>
      <CardContent className="pt-6">
        <_ChecksDataTable
          data={data}
          totalRows={total}
          searchParams={tableParams}
          tableId={TABLE_ID}
          canOperate={permissionsMap['tesoreria:cheques:create'] === true}
          initialColumnVisibility={preferences.columnVisibility ?? {}}
          initialFilterVisibility={preferences.filterVisibility ?? {}}
        />
      </CardContent>
    </Card>
  );
}
