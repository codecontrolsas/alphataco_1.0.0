'use client';

import {
  DataTable,
  type DataTableExportConfig,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { CircleOff, FileText, Truck, User } from 'lucide-react';
import { formatArgentinaDateTime, formatDateAr } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  PURCHASE_ORDER_STATUS_LABELS,
  PURCHASE_ORDER_STATUSES,
  type PurchaseOrderStatus,
} from '../../../lib/order-state-machine';
import { PURCHASES_QUERY_KEYS } from '../../../lib/query-keys';
import { purchaseOrderStatusIcons } from '../../components/PurchaseOrderStatusBadge';
import {
  getAllPurchaseOrdersForExport,
  getPurchaseOrderSingleFacet,
  getPurchaseOrdersPaginated,
  type PurchaseOrderListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from '../columns';

interface Props {
  data: PurchaseOrderListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  /** Bandas de atención resueltas en el servidor; se muestran sobre la tabla. */
  topSlot?: ReactNode;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['status', 'supplier', 'created_at'];

const EMPTY_FACET: FacetResult = { options: [], counts: new Map() };

export function _OrdersDataTable({
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
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getPurchaseOrdersPaginated(params), []);

  const columns = useMemo(() => getColumns(), []);

  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((c) => [c, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      {
        columnId: 'status',
        title: 'Estado',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getPurchaseOrderSingleFacet('status', params);
          if (!result) return EMPTY_FACET;
          return {
            options: PURCHASE_ORDER_STATUSES.map((value) => ({
              value,
              label: PURCHASE_ORDER_STATUS_LABELS[value],
              icon: purchaseOrderStatusIcons[value],
            })),
            counts: result.counts,
          };
        },
      },
      {
        columnId: 'supplier',
        title: 'Proveedor',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getPurchaseOrderSingleFacet('supplier', params);
          if (!result) return EMPTY_FACET;
          return {
            options: (result.resolvedOptions ?? []).map((o) => ({ value: o.id, label: o.name ?? '', icon: Truck })),
            counts: result.counts,
          };
        },
      },
      { columnId: 'created_at', title: 'Fecha de alta', type: 'dateRange' as const },
      { columnId: 'delivery_date', title: 'Fecha de entrega', type: 'dateRange' as const },
      { columnId: 'sent_at', title: 'Enviada', type: 'dateRange' as const },
      {
        columnId: 'requests',
        title: 'Solicitudes de origen',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getPurchaseOrderSingleFacet('requests', params);
          if (!result) return EMPTY_FACET;
          return {
            options: (result.resolvedOptions ?? []).map((o) => ({ value: o.id, label: o.name ?? '', icon: FileText })),
            counts: result.counts,
          };
        },
      },
      {
        columnId: 'creator',
        title: 'Creó',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getPurchaseOrderSingleFacet('creator', params);
          if (!result) return EMPTY_FACET;
          return {
            options: (result.resolvedOptions ?? []).map((o) => ({ value: o.id, label: o.name ?? '', icon: User })),
            counts: result.counts,
          };
        },
      },
      {
        columnId: 'approver',
        title: 'Aprobó',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getPurchaseOrderSingleFacet('approver', params);
          if (!result) return EMPTY_FACET;
          return {
            options: [
              ...(result.resolvedOptions ?? []).map((o) => ({ value: o.id, label: o.name ?? '', icon: User })),
              ...(result.counts.has(NULL_FILTER_VALUE)
                ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff }]
                : []),
            ],
            counts: result.counts,
          };
        },
      },
      { columnId: 'number', title: 'Número', type: 'text' as const, placeholder: 'Buscar por número...' },
      { columnId: 'total', title: 'Total', type: 'text' as const, placeholder: 'Importe exacto (ej. 1250,50)...' },
    ],
    []
  );

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) return initialFilterVisibility;
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

  const exportConfig: DataTableExportConfig<PurchaseOrderListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllPurchaseOrdersForExport(currentParams)),
      options: { filename: 'ordenes-de-compra', title: 'Órdenes de compra', sheetName: 'Órdenes' },
      formatters: {
        status: (value) => PURCHASE_ORDER_STATUS_LABELS[value as PurchaseOrderStatus] ?? String(value),
        created_at: (value) => (value ? formatArgentinaDateTime(value as string | Date) : ''),
        delivery_date: (value) =>
          value ? formatDateAr(new Date(value as string | Date).toISOString().slice(0, 10)) : '',
        sent_at: (value) => (value ? formatArgentinaDateTime(value as string | Date) : ''),
        total: (value) => formatMoney(value == null ? null : String(value)),
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
      queryKey={[...PURCHASES_QUERY_KEYS.orders]}
      onStateChange={handleStateChange}
      searchPlaceholder="Buscar por número o proveedor"
      emptyMessage="No hay órdenes de compra"
      exportConfig={exportConfig}
      data-testid="purchase-orders-table"
      />
    </div>
  );
}
