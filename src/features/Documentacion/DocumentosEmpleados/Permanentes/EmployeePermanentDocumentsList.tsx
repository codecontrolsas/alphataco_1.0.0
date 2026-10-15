import { Card, CardContent } from '@/components/ui/card';
import { DocumentStateMetricsSection } from '@/features/Documentacion/shared/components/DocumentStateMetricsSection';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getEmployeePermanentDocumentsPaginated } from './actions.server';
import { _EmployeePermanentDocumentsDataTable } from './components/_EmployeePermanentDocumentsDataTable';
import { getEmployeePermanentDocumentStateCounts } from './metrics.server';

// ============================================================================
// CONSTANTS
// ============================================================================

export const TABLE_ID = 'employee-permanent-docs';

// ============================================================================
// TYPES
// ============================================================================

interface EmployeePermanentDocumentsListProps {
  searchParams: Record<string, string | string[] | undefined>;
  /** Si se provee, filtra documentos de un empleado específico (vista de detalle) */
  employeeId?: string;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export async function EmployeePermanentDocumentsList({
  searchParams,
  employeeId,
}: EmployeePermanentDocumentsListProps) {
  // Extraer solo los params de esta tabla (quitar prefijo)
  const tableParams = stripPrefixFromSearchParams(searchParams as DataTableSearchParams, TABLE_ID);

  // Las tarjetas arrancan YA, en paralelo con la tabla (si no, su consulta esperaría a que la tabla resuelva).
  const counts = employeeId ? undefined : getEmployeePermanentDocumentStateCounts();
  // Si la tabla falla antes de que se lean las tarjetas, el rechazo no queda sin manejar (la sección ya lo atrapa al leerlo).
  void counts?.catch(() => undefined);
  const [{ data, total }, preferences] = await Promise.all([
    getEmployeePermanentDocumentsPaginated(tableParams, employeeId),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <div className="space-y-6">
      {/* Embebida en la ficha de un empleado (employeeId) no se muestran las tarjetas. */}
      {counts && <DocumentStateMetricsSection tableId={TABLE_ID} counts={counts} />}

      <Card>
        <CardContent className="pt-6">
          <_EmployeePermanentDocumentsDataTable
            data={data}
            totalRows={total}
            searchParams={tableParams}
            tableId={TABLE_ID}
            initialColumnVisibility={preferences.columnVisibility ?? {}}
            initialFilterVisibility={preferences.filterVisibility ?? {}}
            employeeId={employeeId}
          />
        </CardContent>
      </Card>
    </div>
  );
}
