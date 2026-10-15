import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import _KpisIndicadoresDataTable from './_KpisIndicadoresDataTable';
import { getKpisPaginated } from './actions.server';

// ============================================================================
// TYPES
// ============================================================================

interface KpisIndicadoresListProps {
  searchParams: Record<string, string | string[] | undefined>;
  /** Flat permissions map from server: "module:tab:action" → boolean */
  permissionsMap: Record<string, boolean>;
}

// ============================================================================
// SERVER COMPONENT
// NOTE: la superficie de la tabla (`CatalogTableSurface`) la pone el cliente
// `_KpisIndicadoresDataTable`, junto con el Sheet de alta/edición.
// ============================================================================

const TABLE_ID = 'kpis-indicadores';

export default async function KpisIndicadoresList({ searchParams, permissionsMap }: KpisIndicadoresListProps) {
  // Extraer solo los params de esta tabla (quitar prefijo del namespace)
  const tableParams = stripPrefixFromSearchParams(searchParams as DataTableSearchParams, TABLE_ID);

  // Facets se cargan lazy (on-demand al abrir cada popover) — no en SSR
  const [{ data, total }, preferences] = await Promise.all([
    getKpisPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <_KpisIndicadoresDataTable
      data={data}
      totalRows={total}
      searchParams={tableParams}
      tableId={TABLE_ID}
      permissionsMap={permissionsMap}
      initialColumnVisibility={preferences.columnVisibility ?? {}}
      initialFilterVisibility={preferences.filterVisibility ?? {}}
    />
  );
}
