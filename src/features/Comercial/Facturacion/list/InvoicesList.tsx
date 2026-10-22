import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Suspense } from 'react';
import { InvoicingMetrics } from '../components/InvoicingMetrics';
import { InvoicingMetricsSkeleton } from '../fallback/InvoicingMetricsSkeleton';
import _InvoicesDataTable from './_InvoicesDataTable';
import {
  getInvoicesPaginated,
  getInvoicingMetrics,
  type InvoicingMetrics as InvoicingMetricsData,
} from './actions.server';
import { INVOICES_TABLE_ID as TABLE_ID } from './invoice-attention';

/** Resuelve los conteos en su propio Suspense: no frenan la tabla ni la tabla frena a las tarjetas. */
async function InvoicingMetricsLoader({
  metrics,
  serverAttention,
}: {
  metrics: Promise<InvoicingMetricsData | null>;
  serverAttention: string | null;
}) {
  return <InvoicingMetrics initialMetrics={await metrics} serverAttention={serverAttention} />;
}

export async function InvoicesList({ searchParams }: { searchParams: DataTableSearchParams }) {
  // Solo los params de esta tabla (quita el prefijo del namespace)
  const tableParams = stripPrefixFromSearchParams(searchParams, TABLE_ID);

  // Los conteos arrancan ANTES de esperar la tabla (nunca rechaza: si falla devuelve null y se muestra "—")
  const metrics = getInvoicingMetrics();
  const attention = tableParams.attention;

  // Facets lazy: no se cargan en SSR
  const [{ data, total }, preferences, canViewPrices] = await Promise.all([
    getInvoicesPaginated(tableParams),
    getTablePreferences(TABLE_ID),
    checkPermissionServer('comercial', 'facturacion', 'view_prices'),
  ]);

  return (
    // Sin Card propia: FacturacionTabContent ya envuelve la tab en una Card (evita Card anidada).
    <div className="space-y-4">
      <Suspense fallback={<InvoicingMetricsSkeleton />}>
        <InvoicingMetricsLoader metrics={metrics} serverAttention={typeof attention === 'string' ? attention : null} />
      </Suspense>
      <_InvoicesDataTable
        data={data}
        totalRows={total}
        searchParams={tableParams}
        tableId={TABLE_ID}
        canViewPrices={canViewPrices}
        initialColumnVisibility={preferences.columnVisibility ?? {}}
        initialFilterVisibility={preferences.filterVisibility ?? {}}
      />
    </div>
  );
}
