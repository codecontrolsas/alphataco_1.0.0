import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getWorkshopTrackingPaginated } from './actions.server';
import { getWorkshopTrackingMetrics } from './actions/metrics.server';
import { WORKSHOP_TRACKING_PARAM_NAMESPACE, WORKSHOP_TRACKING_TABLE_ID } from './constants';
import { _WorkshopTrackingDataTable } from './_WorkshopTrackingDataTable';

interface WorkshopTrackingListProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export async function WorkshopTrackingList({ searchParams }: WorkshopTrackingListProps) {
  // Los parámetros de la URL siguen bajo el prefijo de siempre; solo cambia la clave de preferencias (-v2).
  const tableParams = stripPrefixFromSearchParams(
    searchParams as DataTableSearchParams,
    WORKSHOP_TRACKING_PARAM_NAMESPACE
  );

  // Las tarjetas arrancan antes de esperar la tabla y se resuelven en su propio Suspense, sin frenarla.
  // `getWorkshopTrackingMetrics` nunca rechaza (devuelve `null` si falla), así que no queda sin manejar.
  const metricsPromise = getWorkshopTrackingMetrics();

  const [{ data, total }, preferences] = await Promise.all([
    getWorkshopTrackingPaginated(tableParams),
    getTablePreferences(WORKSHOP_TRACKING_TABLE_ID),
  ]);

  return (
    <_WorkshopTrackingDataTable
      data={data}
      totalRows={total}
      searchParams={tableParams}
      metricsPromise={metricsPromise}
      initialColumnVisibility={preferences.columnVisibility ?? {}}
      initialFilterVisibility={preferences.filterVisibility ?? {}}
    />
  );
}
