'use client';

import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { createFacetFilters } from '@/shared/components/common/DataTable/facet-filters';
import {
  type DataTableExportConfig,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
} from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { formatArgentinaDay, formatDateOnlyAr } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { FileText, ShoppingCart, Truck, User, Warehouse } from 'lucide-react';
import { useCallback, useMemo, type ReactNode } from 'react';
import { PURCHASES_QUERY_KEYS } from '../../../lib/query-keys';
import {
  getAllPurchaseReceiptsForExport,
  getPurchaseReceiptSingleFacet,
  getPurchaseReceiptsPaginated,
  type PurchaseReceiptListItem,
} from '../actions.server';
import {
  HIDDEN_COLUMNS_BY_DEFAULT,
  NO_WAREHOUSE_LABEL,
  RECEIPT_STATUS_LABELS,
  getColumns,
  receiptStatusIcons,
} from '../columns';
import { RECEIPT_STATUS_ACTIVE, RECEIPT_STATUS_CANCELLED } from '../constants';

interface Props {
  data: PurchaseReceiptListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  /** Banda de atención sobre la tabla (la arma el Server Component con su propio Suspense). */
  topSlot?: ReactNode;
  initialColumnVisibility?: Record<string, boolean>;
  /** Preferencia guardada de filtros visibles: esta tabla hoy no la aplica (ver REVISION-CODIGO.md). */
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['status', 'supplier', 'received_on'];

const facets = createFacetFilters(getPurchaseReceiptSingleFacet);

const STATUS_OPTIONS = [RECEIPT_STATUS_ACTIVE, RECEIPT_STATUS_CANCELLED].map((value) => ({
  value,
  label: RECEIPT_STATUS_LABELS[value],
  icon: receiptStatusIcons[value],
}));

export function _ReceiptsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  topSlot,
  initialColumnVisibility,
}: Props) {
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getPurchaseReceiptsPaginated(params), []);

  const columns = useMemo(() => getColumns(), []);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      facets.fixed('status', 'Estado', STATUS_OPTIONS),
      facets.lookup('supplier', 'Proveedor', Truck),
      { columnId: 'received_on', title: 'Fecha de recepción', type: 'dateRange' as const },
      facets.lookup('order', 'Orden de compra', ShoppingCart),
      facets.lookup('warehouse', 'Depósito', Warehouse, { label: NO_WAREHOUSE_LABEL }),
      facets.lookup('requests', 'Solicitudes de origen', FileText),
      facets.lookup('creator', 'Creó', User),
      { columnId: 'created_at', title: 'Fecha de alta', type: 'dateRange' as const },
      { columnId: 'number', title: 'Número', type: 'text' as const, placeholder: 'Buscar por número...' },
      { columnId: 'delivery_note', title: 'Remito', type: 'text' as const, placeholder: 'Buscar por remito...' },
    ],
    []
  );

  const { currentParams, tableProps } = useServerTableView({
    searchParams,
    tableId,
    hiddenColumnsByDefault: HIDDEN_COLUMNS_BY_DEFAULT,
    defaultVisibleFilters: DEFAULT_VISIBLE_FILTERS,
    facetedFilters,
    initialColumnVisibility,
  });

  const exportConfig: DataTableExportConfig<PurchaseReceiptListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllPurchaseReceiptsForExport(currentParams)),
      options: { filename: 'recepciones', title: 'Recepciones', sheetName: 'Recepciones' },
      formatters: {
        // `received_on` es @db.Date (medianoche UTC): se lee como fecha, no como instante.
        received_on: (value) => (value ? formatDateOnlyAr(value as string | Date) : ''),
        created_at: (value) => (value ? formatArgentinaDay(value as string | Date) : ''),
        delivery_note: (value) => (value ? String(value) : ''),
      },
    }),
    [currentParams]
  );

  return (
    <div className="space-y-4">
      {topSlot}
      <DataTable
        columns={columns}
        data={data}
        totalRows={totalRows}
        {...tableProps}
        queryFn={tableQueryFn}
        queryKey={[...PURCHASES_QUERY_KEYS.receipts]}
        searchPlaceholder="Buscar por número, remito, orden de compra o proveedor"
        emptyMessage="No hay recepciones"
        exportConfig={exportConfig}
        data-testid="purchase-receipts-table"
      />
    </div>
  );
}
