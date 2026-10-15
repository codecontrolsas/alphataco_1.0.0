import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { configPermissionError } from '../../lib/config-access.server';
import { _ExternalApiClientsDataTable } from './_ExternalApiClientsDataTable';
import { getExternalApiClientsPaginated } from './actions.server';

const TABLE_ID = 'external-api-clients';

interface Props {
  searchParams: DataTableSearchParams;
  permissionsMap: Record<string, boolean>;
}

export async function ExternalApiClientsList({ searchParams, permissionsMap }: Props) {
  // Extraer solo los params de esta tabla (quitar prefijo) — aisla la URL si
  // en el futuro esta tab convive con otra tabla en la misma pagina.
  // Sin `view` se avisa: nunca una lista vacía, que se leería como "no hay accesos externos".
  const denied = await configPermissionError('accesos-externos', 'view');
  if (denied) {
    return (
      <Card>
        <CardContent className="pt-6">
          <StateBlock variant="noperm" title="Sin permiso" description={denied} />
        </CardContent>
      </Card>
    );
  }

  const tableParams = stripPrefixFromSearchParams(searchParams, TABLE_ID);

  const [{ data, total }, preferences] = await Promise.all([
    getExternalApiClientsPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <Card>
      <CardContent className="pt-6">
        <_ExternalApiClientsDataTable
          data={data}
          totalRows={total}
          searchParams={tableParams}
          permissionsMap={permissionsMap}
          initialColumnVisibility={preferences.columnVisibility ?? {}}
          initialFilterVisibility={preferences.filterVisibility ?? {}}
        />
      </CardContent>
    </Card>
  );
}
