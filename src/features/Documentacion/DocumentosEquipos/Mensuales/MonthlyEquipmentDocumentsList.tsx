import { Card, CardContent } from '@/components/ui/card';
import { DocumentStateMetricsSection } from '@/features/Documentacion/shared/components/DocumentStateMetricsSection';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getMonthlyEquipmentDocumentsPaginated } from './actions.server';
import { _MonthlyEquipmentDocumentsDataTable } from './components/_MonthlyEquipmentDocumentsDataTable';
import { getMonthlyEquipmentDocumentStateCounts } from './metrics.server';

// ============================================================================
// CONSTANTS
// ============================================================================

export const TABLE_ID = 'monthly-equipment-documents';

// ============================================================================
// TYPES
// ============================================================================

interface MonthlyEquipmentDocumentsListProps {
  searchParams: Record<string, string | string[] | undefined>;
  equipmentId?: string;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export async function MonthlyEquipmentDocumentsList({ searchParams, equipmentId }: MonthlyEquipmentDocumentsListProps) {
  // Extraer solo los params de esta tabla (quitar prefijo)
  const tableParams = stripPrefixFromSearchParams(searchParams as DataTableSearchParams, TABLE_ID);

  // Las tarjetas arrancan YA, en paralelo con la tabla (si no, su consulta esperaría a que la tabla resuelva).
  const counts = equipmentId ? undefined : getMonthlyEquipmentDocumentStateCounts();
  // Si la tabla falla antes de que se lean las tarjetas, el rechazo no queda sin manejar (la sección ya lo atrapa al leerlo).
  void counts?.catch(() => undefined);
  const [{ data, total }, preferences] = await Promise.all([
    getMonthlyEquipmentDocumentsPaginated(tableParams, equipmentId),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <div className="space-y-6">
      {/* Embebida en la ficha de un equipo (equipmentId) no se muestran las tarjetas. */}
      {counts && <DocumentStateMetricsSection tableId={TABLE_ID} counts={counts} />}

      <Card>
        <CardContent className="pt-6">
          <_MonthlyEquipmentDocumentsDataTable
            data={data}
            totalRows={total}
            searchParams={tableParams}
            tableId={TABLE_ID}
            initialColumnVisibility={preferences.columnVisibility ?? {}}
            initialFilterVisibility={preferences.filterVisibility ?? {}}
            equipmentId={equipmentId}
          />
        </CardContent>
      </Card>
    </div>
  );
}
