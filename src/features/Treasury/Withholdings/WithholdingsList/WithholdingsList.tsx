import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import moment from 'moment';
import { localToday } from '../../actions/shared';
import { getWithholdingsPaginated } from './actions.server';
import { _WithholdingsDataTable } from './components/_WithholdingsDataTable';

const TABLE_ID = 'treasury-withholdings';

interface Props {
  searchParams: DataTableSearchParams;
  permissionsMap: Record<string, boolean>;
}

/**
 * Retenciones de recibos confirmados. Sin filtro de fecha en la URL, arranca en el mes en curso
 * (hora argentina); el usuario puede cambiarlo o quitarlo desde el filtro.
 */
export async function WithholdingsList({ searchParams, permissionsMap }: Props) {
  const stripped = stripPrefixFromSearchParams(searchParams, TABLE_ID);
  const hasDateFilter = Boolean(stripped.certificate_date_from || stripped.certificate_date_to);
  const month = moment(localToday(), 'YYYY-MM-DD');
  const tableParams: DataTableSearchParams = hasDateFilter
    ? stripped
    : {
        ...stripped,
        certificate_date_from: month.clone().startOf('month').format('YYYY-MM-DD'),
        certificate_date_to: month.clone().endOf('month').format('YYYY-MM-DD'),
      };

  // Los facets se cargan lazy en el cliente (al abrir cada filtro), no en SSR.
  const [{ data, total }, preferences] = await Promise.all([
    getWithholdingsPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <Card>
      <CardContent className="pt-6">
        <_WithholdingsDataTable
          data={data}
          totalRows={total}
          searchParams={tableParams}
          tableId={TABLE_ID}
          canAttach={permissionsMap['tesoreria:retenciones-sufridas:update'] === true}
          initialColumnVisibility={preferences.columnVisibility ?? {}}
          initialFilterVisibility={preferences.filterVisibility ?? {}}
        />
      </CardContent>
    </Card>
  );
}
