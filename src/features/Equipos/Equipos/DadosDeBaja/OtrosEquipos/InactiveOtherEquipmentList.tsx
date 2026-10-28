import { Card, CardContent } from '@/components/ui/card';
import { isModuleEnabled } from '@/features/Modules/server/modules.server';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getInactiveOtherEquipmentPaginated } from './actions/actions.server';
import { _InactiveOtherEquipmentDataTable } from './components/_InactiveOtherEquipmentDataTable';

// ============================================================================
// TYPES
// ============================================================================

interface InactiveOtherEquipmentListProps {
  searchParams: Record<string, string | string[] | undefined>;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export async function InactiveOtherEquipmentList({ searchParams }: InactiveOtherEquipmentListProps) {
  const tableId = 'inactive-other-equipment';

  // Extraer solo los params de esta tabla (quitar prefijo)
  const tableParams = stripPrefixFromSearchParams(searchParams as DataTableSearchParams, tableId);

  const [{ data, total }, preferences, showDocumentStatus] = await Promise.all([
    getInactiveOtherEquipmentPaginated(tableParams),
    getTablePreferences(tableId),
    // `documentacion` apagado: sin columna ni filtro de estado documental (F3.2).
    isModuleEnabled('documentacion'),
  ]);

  return (
    <Card>
      <CardContent className="pt-6">
        <_InactiveOtherEquipmentDataTable
          showDocumentStatus={showDocumentStatus}
          data={data}
          totalRows={total}
          searchParams={tableParams}
          tableId={tableId}
          initialColumnVisibility={preferences.columnVisibility ?? {}}
          initialFilterVisibility={preferences.filterVisibility ?? {}}
        />
      </CardContent>
    </Card>
  );
}
