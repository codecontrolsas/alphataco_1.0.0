import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { getCompanyDocsPaginated } from '../actions.server';
import _CompanyDocsDataTable from './_CompanyDocsDataTable';

// ============================================================================
// CONSTANTS
// ============================================================================

const TABLE_ID = 'company-docs';

// ============================================================================
// TYPES
// ============================================================================

interface CompanyDocsListProps {
  searchParams: Record<string, string | string[] | undefined>;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export default async function CompanyDocsList({ searchParams }: CompanyDocsListProps) {
  if (!(await checkPermissionServer('configuracion', 'documentacion', 'view'))) {
    return (
      <StateBlock
        variant="noperm"
        title="No tenés permiso para ver los documentos de la empresa"
        description="Pedile acceso a un administrador."
      />
    );
  }

  // Strip namespace prefix so this table's params don't interfere with others
  const tableParams = stripPrefixFromSearchParams(searchParams as DataTableSearchParams, TABLE_ID);

  const [{ data, total }, preferences] = await Promise.all([
    getCompanyDocsPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <_CompanyDocsDataTable
      data={data}
      totalRows={total}
      searchParams={tableParams}
      tableId={TABLE_ID}
      initialColumnVisibility={preferences.columnVisibility ?? {}}
      initialFilterVisibility={preferences.filterVisibility ?? {}}
    />
  );
}
