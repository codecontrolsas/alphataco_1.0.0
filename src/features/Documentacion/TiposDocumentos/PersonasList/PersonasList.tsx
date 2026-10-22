import { Card, CardContent } from '@/components/ui/card';
import { document_applies } from '@/generated/prisma/enums';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getDocTypeMetrics } from '../actions/metrics.server';
import { getPersonasDocTypesPaginated } from '../actions/queries.server';
import { DocTypeMetricsSection } from '../components/DocTypeMetricsSection';
import _DocTypesDataTable from '../components/_DocTypesDataTable';

// ============================================================================
// CONSTANTS
// ============================================================================

const TABLE_ID = 'doc-types-personas';

// ============================================================================
// TYPES
// ============================================================================

interface PersonasListProps {
  searchParams: DataTableSearchParams;
  permissionsMap?: Record<string, boolean>;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export async function PersonasList({ searchParams, permissionsMap }: PersonasListProps) {
  // Extraer solo los params de esta tabla (quitar prefijo del namespace)
  const tableParams = stripPrefixFromSearchParams(searchParams, TABLE_ID);

  // Facets se cargan lazy (on-demand al abrir cada popover) — no en SSR
  // Las tarjetas arrancan YA, en paralelo con la tabla (si no, su consulta esperaría a que la tabla resuelva).
  const metrics = getDocTypeMetrics(document_applies.Persona);
  const [{ data, total }, preferences] = await Promise.all([
    getPersonasDocTypesPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <div className="space-y-6">
      <DocTypeMetricsSection metrics={metrics} />

      <Card>
        <CardContent className="pt-6">
          <_DocTypesDataTable
            applies={document_applies.Persona}
            data={data}
            totalRows={total}
            searchParams={tableParams}
            tableId={TABLE_ID}
            initialColumnVisibility={preferences.columnVisibility ?? {}}
            initialFilterVisibility={preferences.filterVisibility ?? {}}
            permissionsMap={permissionsMap}
          />
        </CardContent>
      </Card>
    </div>
  );
}
