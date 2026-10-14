import { Card, CardContent } from '@/components/ui/card';
import { DocumentStateMetricsSection } from '@/features/Documentacion/shared/components/DocumentStateMetricsSection';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getCompanyDocsPaginated } from '../actions.server';
import { getCompanyDocumentStateCounts } from '../metrics.server';
import _CompanyDocsDataTable from './_CompanyDocsDataTable';

// ============================================================================
// CONSTANTS
// ============================================================================

export const MENSUALES_TABLE_ID = 'company-docs-mensuales';

// ============================================================================
// SERVER COMPONENT
// ============================================================================

interface Props {
  searchParams: DataTableSearchParams;
}

export default async function CompanyDocsMensualesList({ searchParams }: Props) {
  // Extraer solo los params de esta tabla (quitar prefijo del namespace)
  const tableParams = stripPrefixFromSearchParams(searchParams, MENSUALES_TABLE_ID);

  // Las tarjetas arrancan YA, en paralelo con la tabla (si no, su consulta esperaría a que la tabla resuelva).
  const counts = getCompanyDocumentStateCounts(true);
  const [{ data, total }, preferences] = await Promise.all([
    getCompanyDocsPaginated(tableParams, true),
    getTablePreferences(MENSUALES_TABLE_ID),
  ]);

  return (
    <div className="space-y-6">
      <DocumentStateMetricsSection tableId={MENSUALES_TABLE_ID} counts={counts} />

      <Card>
        <CardContent className="pt-6">
          <_CompanyDocsDataTable
            data={data}
            totalRows={total}
            searchParams={tableParams}
            isMonthly={true}
            tableId={MENSUALES_TABLE_ID}
            initialColumnVisibility={preferences.columnVisibility ?? {}}
            initialFilterVisibility={preferences.filterVisibility ?? {}}
          />
        </CardContent>
      </Card>
    </div>
  );
}
