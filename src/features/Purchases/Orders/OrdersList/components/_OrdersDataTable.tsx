'use client';

import { formatMoney } from '@/features/Warehouses/lib/format';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { createFacetFilters } from '@/shared/components/common/DataTable/facet-filters';
import {
  type DataTableExportConfig,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
} from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { formatArgentinaDateTime, formatDateOnlyAr } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { FileText, Truck, User } from 'lucide-react';
import { useCallback, useMemo, type ReactNode } from 'react';
import {
  PURCHASE_ORDER_STATUSES,
  PURCHASE_ORDER_STATUS_LABELS,
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
  /** `compras:ordenes:view_prices`, resuelto en el servidor (el servidor enmascara por su cuenta). */
  canViewPrices: boolean;
  /** Bandas de atención resueltas en el servidor; se muestran sobre la tabla. */
  topSlot?: ReactNode;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['status', 'supplier', 'created_at'];

const facets = createFacetFilters(getPurchaseOrderSingleFacet);

const STATUS_OPTIONS = PURCHASE_ORDER_STATUSES.map((value) => ({
  value,
  label: PURCHASE_ORDER_STATUS_LABELS[value],
  icon: purchaseOrderStatusIcons[value],
}));

export function _OrdersDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  canViewPrices,
  topSlot,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getPurchaseOrdersPaginated(params), []);

  const columns = useMemo(() => getColumns({ canViewPrices }), [canViewPrices]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      facets.fixed('status', 'Estado', STATUS_OPTIONS),
      facets.lookup('supplier', 'Proveedor', Truck),
      { columnId: 'created_at', title: 'Fecha de alta', type: 'dateRange' as const },
      { columnId: 'delivery_date', title: 'Fecha de entrega', type: 'dateRange' as const },
      { columnId: 'sent_at', title: 'Enviada', type: 'dateRange' as const },
      facets.lookup('requests', 'Solicitudes de origen', FileText),
      facets.lookup('creator', 'Creó', User),
      facets.lookup('approver', 'Aprobó', User, { label: 'Sin asignar' }),
      { columnId: 'number', title: 'Número', type: 'text' as const, placeholder: 'Buscar por número...' },
      ...(canViewPrices
        ? [{ columnId: 'total', title: 'Total', type: 'text' as const, placeholder: 'Importe exacto (ej. 1250,50)...' }]
        : []),
    ],
    [canViewPrices]
  );

  const { currentParams, tableProps } = useServerTableView({
    searchParams,
    tableId,
    hiddenColumnsByDefault: HIDDEN_COLUMNS_BY_DEFAULT,
    defaultVisibleFilters: DEFAULT_VISIBLE_FILTERS,
    facetedFilters,
    initialColumnVisibility,
    savedFilterVisibility: initialFilterVisibility,
  });

  const exportConfig: DataTableExportConfig<PurchaseOrderListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllPurchaseOrdersForExport(currentParams)),
      options: { filename: 'ordenes-de-compra', title: 'Órdenes de compra', sheetName: 'Órdenes' },
      formatters: {
        status: (value) => PURCHASE_ORDER_STATUS_LABELS[value as PurchaseOrderStatus] ?? String(value),
        created_at: (value) => (value ? formatArgentinaDateTime(value as string | Date) : ''),
        delivery_date: (value) => (value ? formatDateOnlyAr(value as string | Date) : ''),
        sent_at: (value) => (value ? formatArgentinaDateTime(value as string | Date) : ''),
        total: (value) => (canViewPrices ? formatMoney(value == null ? null : String(value)) : 'Sin permiso'),
      },
    }),
    [currentParams, canViewPrices]
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
        queryKey={[...PURCHASES_QUERY_KEYS.orders]}
        searchPlaceholder="Buscar por número o proveedor"
        emptyMessage="No hay órdenes de compra"
        exportConfig={exportConfig}
        data-testid="purchase-orders-table"
      />
    </div>
  );
}
