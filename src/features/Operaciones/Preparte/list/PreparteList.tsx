import { fetchAllContracts } from '@/features/Equipos/EquipoID/actions/vehicle-actions';
import { fetchCustomersWithRelations } from '@/features/Operaciones/Preparte/actions/actions';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { PreparteManager } from '../components/PreparteManager';
import { Suspense } from 'react';
import { PreparteMetricsSkeleton } from '../fallback/PreparteSkeleton';
import { getPrepartesPaginated } from './actions.server';
import { PreparteMetricsSection } from './components/PreparteMetricsSection';
import { getPreparteStatusMetrics } from './metrics.server';

interface Props {
  searchParams: DataTableSearchParams;
  permissionsMap: Record<string, boolean>;
}

export const PREPARTE_TABLE_ID = 'preparte-table';

export async function PreparteList({ searchParams, permissionsMap }: Props) {
  const tableParams = stripPrefixFromSearchParams(searchParams, PREPARTE_TABLE_ID);

  // Las tarjetas arrancan YA, en paralelo con la tabla (si no, su consulta esperaría a que la tabla resuelva).
  const metrics = getPreparteStatusMetrics();
  const [{ data, total }, preferences, customers, contracts] = await Promise.all([
    getPrepartesPaginated(tableParams),
    getTablePreferences(PREPARTE_TABLE_ID),
    fetchCustomersWithRelations(),
    fetchAllContracts(),
  ]);

  return (
    <PreparteManager
      Customers={customers}
      contratos={contracts}
      prepartes={data}
      totalRows={total}
      searchParams={tableParams}
      tableId={PREPARTE_TABLE_ID}
      permissionsMap={permissionsMap}
      initialColumnVisibility={preferences.columnVisibility ?? {}}
      initialFilterVisibility={preferences.filterVisibility ?? {}}
      metrics={
        <Suspense fallback={<PreparteMetricsSkeleton />}>
          <PreparteMetricsSection tableId={PREPARTE_TABLE_ID} metrics={metrics} />
        </Suspense>
      }
    />
  );
}
