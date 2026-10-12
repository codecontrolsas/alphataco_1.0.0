import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getOwnChecksPaginated } from './actions.server';
import { _OwnChecksDataTable } from './components/_OwnChecksDataTable';
import { OWN_CHECKS_TABLE_ID } from './constants';

export { OWN_CHECKS_TABLE_ID };
const TABLE_ID = OWN_CHECKS_TABLE_ID;

interface Props {
  searchParams: DataTableSearchParams;
  permissionsMap: Record<string, boolean>;
}

/** Cheques propios de la empresa. El filtro inicial "Emitido" lo pone la tab en la URL (TabContent). */
export async function OwnChecksList({ searchParams, permissionsMap }: Props) {
  const tableParams = stripPrefixFromSearchParams(searchParams, TABLE_ID);

  // Los facets se cargan lazy en el cliente (al abrir cada filtro), no en SSR.
  const [{ data, total }, preferences] = await Promise.all([
    getOwnChecksPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <Card>
      <CardContent className="pt-6">
        <_OwnChecksDataTable
          data={data}
          totalRows={total}
          searchParams={tableParams}
          tableId={TABLE_ID}
          canOperate={permissionsMap['tesoreria:cheques-propios:update'] === true}
          initialColumnVisibility={preferences.columnVisibility ?? {}}
          initialFilterVisibility={preferences.filterVisibility ?? {}}
        />
      </CardContent>
    </Card>
  );
}
