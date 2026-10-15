import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { InWorkshopMetricsSection } from '../components/InWorkshopMetricsSection';
import { getMaintenanceOrdersPaginated } from './actions.server';
import { getInWorkshopMetrics } from './actions/metrics.server';
import { _MaintenanceOrderDataTable } from './components/_MaintenanceOrderDataTable';
import { MAINTENANCE_ORDERS_PARAM_NAMESPACE, MAINTENANCE_ORDERS_TABLE_ID } from './constants';
import { loadWizardData } from './lib/wizard-data';

interface MaintenanceOrderListProps {
  searchParams: Record<string, string | string[] | undefined>;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export async function MaintenanceOrderList({ searchParams }: MaintenanceOrderListProps) {
  const tableParams = stripPrefixFromSearchParams(searchParams as DataTableSearchParams, MAINTENANCE_ORDERS_PARAM_NAMESPACE);

  // Las tarjetas arrancan antes de esperar la tabla: su Suspense las resuelve sin frenarla.
  // `getInWorkshopMetrics` nunca rechaza (devuelve `null` si falla), así que no queda sin manejar.
  const metrics = getInWorkshopMetrics();
  const attentionParam = tableParams.attention;
  const serverAttention = typeof attentionParam === 'string' ? attentionParam : null;

  const [{ data, total }, preferences, { sectors, repairTypes, externalWorkshops }] = await Promise.all([
    getMaintenanceOrdersPaginated(tableParams),
    getTablePreferences(MAINTENANCE_ORDERS_TABLE_ID),
    loadWizardData(),
  ]);

  return (
    <_MaintenanceOrderDataTable
      data={data}
      totalRows={total}
      searchParams={tableParams}
      tableId={MAINTENANCE_ORDERS_TABLE_ID}
      paramNamespace={MAINTENANCE_ORDERS_PARAM_NAMESPACE}
      topSlot={<InWorkshopMetricsSection metrics={metrics} serverAttention={serverAttention} />}
      initialColumnVisibility={preferences.columnVisibility ?? {}}
      initialFilterVisibility={preferences.filterVisibility ?? {}}
      sectors={sectors}
      repairTypes={repairTypes}
      externalWorkshops={externalWorkshops}
    />
  );
}
