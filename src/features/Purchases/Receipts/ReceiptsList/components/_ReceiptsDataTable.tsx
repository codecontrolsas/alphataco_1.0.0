'use client';

import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { type DataTableExportConfig, type DataTableFacetedFilterConfig, type DataTableSearchParams, type FacetResult } from '@/shared/components/common/DataTable/types';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay, formatDateAr } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { CircleOff, FileText, ShoppingCart, Truck, User, Warehouse } from 'lucide-react';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
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
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['status', 'supplier', 'received_on'];

const EMPTY_FACET: FacetResult = { options: [], counts: new Map() };

export function _ReceiptsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  topSlot,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);
  const handleStateChange = useCallback((params: DataTableSearchParams) => setCurrentParams(params), []);
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getPurchaseReceiptsPaginated(params), []);

  const columns = useMemo(() => getColumns(), []);

  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((c) => [c, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(() => {
    const fkFacet =
      (columnId: string, icon: typeof Truck, withNull?: string) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getPurchaseReceiptSingleFacet(columnId, params);
        if (!result) return EMPTY_FACET;
        return {
          options: [
            ...(result.resolvedOptions ?? []).map((o) => ({ value: o.id, label: o.name ?? '', icon })),
            ...(withNull && result.counts.has(NULL_FILTER_VALUE)
              ? [{ value: NULL_FILTER_VALUE, label: withNull, icon: CircleOff }]
              : []),
          ],
          counts: result.counts,
        };
      };

    return [
      {
        columnId: 'status',
        title: 'Estado',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getPurchaseReceiptSingleFacet('status', params);
          if (!result) return EMPTY_FACET;
          return {
            options: [RECEIPT_STATUS_ACTIVE, RECEIPT_STATUS_CANCELLED].map((value) => ({
              value,
              label: RECEIPT_STATUS_LABELS[value],
              icon: receiptStatusIcons[value],
            })),
            counts: result.counts,
          };
        },
      },
      { columnId: 'supplier', title: 'Proveedor', fetchFacet: fkFacet('supplier', Truck) },
      { columnId: 'received_on', title: 'Fecha de recepción', type: 'dateRange' as const },
      { columnId: 'order', title: 'Orden de compra', fetchFacet: fkFacet('order', ShoppingCart) },
      { columnId: 'warehouse', title: 'Depósito', fetchFacet: fkFacet('warehouse', Warehouse, NO_WAREHOUSE_LABEL) },
      { columnId: 'requests', title: 'Solicitudes de origen', fetchFacet: fkFacet('requests', FileText) },
      { columnId: 'creator', title: 'Creó', fetchFacet: fkFacet('creator', User) },
      { columnId: 'created_at', title: 'Fecha de alta', type: 'dateRange' as const },
      { columnId: 'number', title: 'Número', type: 'text' as const, placeholder: 'Buscar por número...' },
      { columnId: 'delivery_note', title: 'Remito', type: 'text' as const, placeholder: 'Buscar por remito...' },
    ];
  }, []);

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) return initialFilterVisibility;
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

  const exportConfig: DataTableExportConfig<PurchaseReceiptListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllPurchaseReceiptsForExport(currentParams)),
      options: { filename: 'recepciones', title: 'Recepciones', sheetName: 'Recepciones' },
      formatters: {
        // `received_on` es @db.Date (medianoche UTC): se lee como fecha, no como instante.
        received_on: (value) => (value ? formatDateAr(new Date(value as string | Date).toISOString().slice(0, 10)) : ''),
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
      searchParams={searchParams}
      tableId={tableId}
      paramNamespace={tableId}
      facetedFilters={facetedFilters}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      showFilterToggle
      queryFn={tableQueryFn}
      queryKey={[...PURCHASES_QUERY_KEYS.receipts]}
      onStateChange={handleStateChange}
      searchPlaceholder="Buscar por número, remito, orden de compra o proveedor"
      emptyMessage="No hay recepciones"
      exportConfig={exportConfig}
      data-testid="purchase-receipts-table"
      />
    </div>
  );
}
