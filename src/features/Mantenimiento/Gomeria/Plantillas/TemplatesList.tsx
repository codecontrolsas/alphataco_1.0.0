import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getTemplatesPaginated } from './actions/actions.server';
import _TemplatesDataTable from './components/_TemplatesDataTable';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Clave de las preferencias guardadas (columnas y filtros visibles). `-v2`: el diseño nuevo parte de cero. */
const TABLE_ID = 'tire-templates-v2';
/** Prefijo de los params de la URL: no cambia con el rediseño para que los enlaces guardados sigan abriendo. */
const PARAM_NAMESPACE = 'tire-templates';

// ============================================================================
// TYPES
// ============================================================================

interface TemplatesListProps {
  searchParams: Record<string, string | string[] | undefined>;
  permissionsMap: Record<string, boolean>;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export default async function TemplatesList({ searchParams, permissionsMap }: TemplatesListProps) {
  // Extract only the params for this table (strip namespace prefix)
  const tableParams = stripPrefixFromSearchParams(searchParams as DataTableSearchParams, PARAM_NAMESPACE);

  // Facets are loaded lazy (on-demand when each popover opens) — not in SSR
  const [{ data, total }, preferences] = await Promise.all([
    getTemplatesPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <Card>
      <CardContent className="pt-6">
        <_TemplatesDataTable
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
  );
}
