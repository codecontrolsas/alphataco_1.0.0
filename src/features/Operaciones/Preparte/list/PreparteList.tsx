import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { OrderStatusMetricsSection, getOrderStatusCounts } from '../components/OrderStatusMetricsSection';
import { PreparteManager } from '../components/PreparteManager';
import { PREPARTE_PREFS_ID, PREPARTE_TABLE_ID } from '../constants';
import { getPrepartesPaginated } from './actions.server';

interface Props {
  searchParams: DataTableSearchParams;
  permissionsMap: Record<string, boolean>;
}

export async function PreparteList({ searchParams, permissionsMap }: Props) {
  const tableParams = stripPrefixFromSearchParams(searchParams, PREPARTE_TABLE_ID);

  // Las tarjetas arrancan antes de esperar la tabla: su Suspense las resuelve sin frenarla.
  // `getOrderStatusCounts` nunca rechaza (devuelve `null` si falla), así que no queda sin manejar.
  const counts = getOrderStatusCounts();
  const statusParam = tableParams.status;
  const serverStatus = typeof statusParam === 'string' ? statusParam : null;

  // Clientes y contratos ya no viajan acá: el Sheet de edición y el informe los piden al abrirse
  const [{ data, total }, preferences] = await Promise.all([
    getPrepartesPaginated(tableParams),
    getTablePreferences(PREPARTE_PREFS_ID),
  ]);

  return (
    <PreparteManager
      prepartes={data}
      totalRows={total}
      searchParams={tableParams}
      prefsId={PREPARTE_PREFS_ID}
      namespace={PREPARTE_TABLE_ID}
      permissionsMap={permissionsMap}
      initialColumnVisibility={preferences.columnVisibility ?? {}}
      initialFilterVisibility={preferences.filterVisibility ?? {}}
      statusCards={<OrderStatusMetricsSection counts={counts} serverStatus={serverStatus} />}
    />
  );
}
