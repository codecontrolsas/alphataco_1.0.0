import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getHseCompliancePaginated } from './actions.server';
import { _ComplianceDataTable } from './components/_ComplianceDataTable';

/**
 * Tabla de cumplimiento. Con `documentId` se acota a ese documento (detalle) y oculta la columna del documento.
 * `tableId` distinto por superficie: cada una guarda sus preferencias y sus parámetros de URL.
 */
export async function ComplianceList({
  searchParams,
  tableId,
  documentId,
}: {
  searchParams: DataTableSearchParams;
  tableId: string;
  documentId?: string;
}) {
  const tableParams = stripPrefixFromSearchParams(searchParams, tableId);
  const [{ data, total }, preferences] = await Promise.all([
    getHseCompliancePaginated(tableParams, documentId ?? null),
    getTablePreferences(tableId),
  ]);
  return (
    <Card>
      <CardContent className="pt-6">
        <_ComplianceDataTable
          data={data}
          totalRows={total}
          searchParams={tableParams}
          tableId={tableId}
          documentId={documentId ?? null}
          initialColumnVisibility={preferences.columnVisibility ?? {}}
          initialFilterVisibility={preferences.filterVisibility ?? {}}
        />
      </CardContent>
    </Card>
  );
}
