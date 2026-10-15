import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams, type DataTableSearchParams } from '@/shared/components/common/DataTable';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { getCompanyUsersPaginated } from '../actions.server';
import { USERS_VIEW_DENIED_MESSAGE, canViewCompanyUsers } from '../lib/users-access';
import { _UsersDataTable } from './_UsersDataTable';

const TABLE_ID = 'company-users';

interface UsersTableListProps {
  searchParams: DataTableSearchParams;
  permissionsMap: Record<string, boolean>;
}

export async function UsersTableList({ searchParams, permissionsMap }: UsersTableListProps) {
  // Sin `view` se avisa: nunca una lista vacía, que se leería como "no hay usuarios".
  if (!(await canViewCompanyUsers())) {
    return (
      <Card>
        <CardContent className="pt-6">
          <StateBlock variant="noperm" title="Sin permiso" description={USERS_VIEW_DENIED_MESSAGE} />
        </CardContent>
      </Card>
    );
  }

  const tableSearchParams = stripPrefixFromSearchParams(searchParams, TABLE_ID);
  const companyId = await getActiveCompanyId();

  const [{ data, total }, preferences] = await Promise.all([
    getCompanyUsersPaginated(companyId, tableSearchParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <Card>
      <CardContent className="pt-6">
        <_UsersDataTable
          data={data}
          totalRows={total}
          searchParams={tableSearchParams}
          tableId={TABLE_ID}
          companyId={companyId}
          initialColumnVisibility={preferences.columnVisibility ?? {}}
          initialFilterVisibility={preferences.filterVisibility ?? {}}
          permissionsMap={permissionsMap}
        />
      </CardContent>
    </Card>
  );
}
