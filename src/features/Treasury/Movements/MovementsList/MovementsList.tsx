import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import type { TreasuryAccountRow } from '../../actions/accounts.server';
import type { TreasuryConceptRow } from '../../actions/concepts.server';
import { getTreasuryMovementsPaginated } from './actions.server';
import { _MovementsDataTable } from './components/_MovementsDataTable';

const TABLE_ID = 'treasury-movements';

interface Props {
  searchParams: DataTableSearchParams;
  canUpdate: boolean;
  accounts: TreasuryAccountRow[];
  concepts: TreasuryConceptRow[];
}

export async function MovementsList({ searchParams, canUpdate, accounts, concepts }: Props) {
  const tableParams = stripPrefixFromSearchParams(searchParams, TABLE_ID);

  // Los facets se cargan lazy en el cliente (al abrir cada filtro), no en SSR.
  const [{ data, total }, preferences] = await Promise.all([
    getTreasuryMovementsPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <Card>
      <CardContent className="pt-6">
        <_MovementsDataTable
          data={data}
          totalRows={total}
          searchParams={tableParams}
          tableId={TABLE_ID}
          canUpdate={canUpdate}
          accounts={accounts}
          concepts={concepts}
          initialColumnVisibility={preferences.columnVisibility ?? {}}
          initialFilterVisibility={preferences.filterVisibility ?? {}}
        />
      </CardContent>
    </Card>
  );
}
