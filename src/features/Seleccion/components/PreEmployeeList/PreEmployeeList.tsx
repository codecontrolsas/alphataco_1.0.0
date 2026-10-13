import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Suspense } from 'react';
import { getPreEmployeesPaginated, getRequiredPreEmployeeDocumentsCount } from './actions.server';
import { PreEmployeeMetricsSection } from './components/PreEmployeeMetricsSection';
import { _PreEmployeeDataTable } from './components/_PreEmployeeDataTable';
import { PreEmployeeMetricsSkeleton } from './fallback/PreEmployeeMetricsSkeleton';

// ============================================================================
// TYPES
// ============================================================================

interface PreEmployeeListProps {
  searchParams: DataTableSearchParams;
}

export const PRE_EMPLOYEES_TABLE_ID = 'pre-employees';

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export async function PreEmployeeList({ searchParams }: PreEmployeeListProps) {
  // Extraer solo los params de esta tabla (quitar prefijo del namespace)
  const tableParams = stripPrefixFromSearchParams(searchParams, PRE_EMPLOYEES_TABLE_ID);

  // Los facets se cargan lazy (on-demand al abrir cada popover) — no en SSR
  const [{ data, total }, preferences, requiredDocs] = await Promise.all([
    getPreEmployeesPaginated(tableParams),
    getTablePreferences(PRE_EMPLOYEES_TABLE_ID),
    getRequiredPreEmployeeDocumentsCount(),
  ]);

  return (
    <div className="space-y-6">
      {/* Las tarjetas resumen llegan por su propio Suspense: no frenan la tabla. */}
      <Suspense fallback={<PreEmployeeMetricsSkeleton />}>
        <PreEmployeeMetricsSection tableId={PRE_EMPLOYEES_TABLE_ID} />
      </Suspense>

      <Card>
        <CardContent className="pt-6">
          <_PreEmployeeDataTable
            data={data}
            totalRows={total}
            searchParams={tableParams}
            tableId={PRE_EMPLOYEES_TABLE_ID}
            requiredDocs={requiredDocs}
            initialColumnVisibility={preferences.columnVisibility ?? {}}
            initialFilterVisibility={preferences.filterVisibility ?? {}}
          />
        </CardContent>
      </Card>
    </div>
  );
}
