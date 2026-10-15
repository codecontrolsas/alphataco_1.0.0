import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getDailyReportAttentionCounts, getDailyReportFacets, getDailyReportsPaginated } from './actions.server';
import { _DailyReportDataTable } from './components/_DailyReportDataTable';
import { DailyReportMetricsSection } from './components/DailyReportMetricsSection';

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  searchParams: DataTableSearchParams;
  permissionsMap: Record<string, boolean>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Prefijo de los params de la tabla en la URL (`daily-reports__status`, …). */
const PARAM_NAMESPACE = 'daily-reports';

/** Primer valor de un param de URL (puede venir como string o array). */
function firstParam(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

/** Clave de las preferencias guardadas (v2: las anteriores ocultaban otras columnas). */
const TABLE_ID = 'daily-reports-v2';

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export async function DailyReportList({ searchParams, permissionsMap }: Props) {
  // Extraer solo los params de esta tabla (quitar prefijo del namespace)
  const tableParams = stripPrefixFromSearchParams(searchParams, PARAM_NAMESPACE);

  // Las tarjetas arrancan YA, en paralelo con la tabla (si no, su consulta esperaría a que la tabla resuelva).
  const facets = getDailyReportFacets();
  const attention = getDailyReportAttentionCounts();

  const [{ data, total }, preferences] = await Promise.all([
    getDailyReportsPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <div className="space-y-6">
      <DailyReportMetricsSection
        paramNamespace={PARAM_NAMESPACE}
        serverStatus={firstParam(tableParams.status)}
        facets={facets} attention={attention} />

      <Card>
        <CardContent className="pt-6">
          <_DailyReportDataTable
            data={data}
            totalRows={total}
            searchParams={tableParams}
            tableId={TABLE_ID}
            paramNamespace={PARAM_NAMESPACE}
            permissionsMap={permissionsMap}
            initialColumnVisibility={preferences.columnVisibility ?? {}}
            initialFilterVisibility={preferences.filterVisibility ?? {}}
          />
        </CardContent>
      </Card>
    </div>
  );
}
