'use client';

import { formatMoney } from '@/features/Warehouses/lib/format';
import type { payment_method, payment_order_status } from '@/generated/prisma/enums';
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
import { Banknote, Landmark, Truck, User, Wallet, WalletCards, type LucideIcon } from 'lucide-react';
import { useCallback, useMemo, type ReactNode } from 'react';
import { PAYMENT_ORDER_STATUS_LABELS } from '../../../lib/payment-order-state-machine';
import { PURCHASES_QUERY_KEYS } from '../../../lib/query-keys';
import { paymentOrderStatusIcons } from '../../components/PaymentOrderStatusBadge';
import {
  getAllPaymentOrdersForExport,
  getPaymentOrderSingleFacet,
  getPaymentOrdersPaginated,
  type PaymentOrderListItem,
} from '../actions.server';
import { getColumns } from '../columns';
import { HIDDEN_COLUMNS_BY_DEFAULT, NO_PAYMENT_LABEL, PAYMENT_METHOD_LABELS } from '../constants';

interface Props {
  data: PaymentOrderListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  /** Banda de atención resuelta en el servidor; se muestra sobre la tabla. */
  topSlot?: ReactNode;
  initialColumnVisibility?: Record<string, boolean>;
  /** Preferencia guardada de filtros visibles: esta tabla hoy no la aplica (ver REVISION-CODIGO.md). */
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['status', 'supplier', 'planned_on'];

const facets = createFacetFilters(getPaymentOrderSingleFacet);

const STATUS_VALUES = Object.keys(PAYMENT_ORDER_STATUS_LABELS) as payment_order_status[];
const METHOD_VALUES = Object.keys(PAYMENT_METHOD_LABELS) as payment_method[];
const methodIcons: Record<payment_method, LucideIcon> = {
  TRANSFER: Landmark,
  CHECK: Wallet,
  ECHECK: Wallet,
  CASH: Banknote,
  THIRD_PARTY_CHECK: WalletCards,
};

const STATUS_OPTIONS = STATUS_VALUES.map((value) => ({
  value,
  label: PAYMENT_ORDER_STATUS_LABELS[value],
  icon: paymentOrderStatusIcons[value],
}));

const METHOD_OPTIONS = METHOD_VALUES.map((value) => ({
  value,
  label: PAYMENT_METHOD_LABELS[value],
  icon: methodIcons[value],
}));

/** Columnas DATE (sin hora): medianoche UTC, se leen como fecha para no correr un día. */
const dateOnly = (value: unknown) => (value ? formatDateOnlyAr(value as string | Date) : '');
const money = (value: unknown) => formatMoney(value as string);

export function _PaymentOrdersDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  topSlot,
  initialColumnVisibility,
}: Props) {
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getPaymentOrdersPaginated(params), []);

  const columns = useMemo(() => getColumns(), []);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      facets.fixed('status', 'Estado', STATUS_OPTIONS),
      facets.lookup('supplier', 'Proveedor', Truck),
      { columnId: 'planned_on', title: 'Fecha prevista', type: 'dateRange' as const },
      { columnId: 'paid_on', title: 'Fecha de pago', type: 'dateRange' as const },
      facets.fixed('methods', 'Medios de pago', METHOD_OPTIONS, { label: NO_PAYMENT_LABEL }),
      facets.lookup('creator', 'Cargó', User),
      { columnId: 'created_at', title: 'Fecha de alta', type: 'dateRange' as const },
      { columnId: 'number', title: 'Número', type: 'text' as const, placeholder: 'Buscar por número...' },
      {
        columnId: 'invoices_total',
        title: 'Aplicado',
        type: 'text' as const,
        placeholder: 'Importe exacto, ej: 1234,56',
      },
      {
        columnId: 'credits_total',
        title: 'Notas de crédito',
        type: 'text' as const,
        placeholder: 'Importe exacto, ej: 1234,56',
      },
      {
        columnId: 'advance_total',
        title: 'Anticipos',
        type: 'text' as const,
        placeholder: 'Importe exacto, ej: 1234,56',
      },
      {
        columnId: 'withholdings_total',
        title: 'Retenciones',
        type: 'text' as const,
        placeholder: 'Importe exacto, ej: 1234,56',
      },
      { columnId: 'net_total', title: 'Neto', type: 'text' as const, placeholder: 'Importe exacto, ej: 1234,56' },
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

  const exportConfig: DataTableExportConfig<PaymentOrderListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllPaymentOrdersForExport(currentParams)),
      options: { filename: 'ordenes-de-pago', title: 'Órdenes de pago', sheetName: 'Órdenes de pago' },
      formatters: {
        planned_on: dateOnly,
        paid_on: dateOnly,
        created_at: (value) => (value ? formatArgentinaDay(value as string | Date) : ''),
        invoices_total: money,
        credits_total: money,
        advance_total: money,
        withholdings_total: money,
        net_total: money,
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
        queryKey={[...PURCHASES_QUERY_KEYS.payments]}
        searchPlaceholder="Buscar por número o proveedor"
        emptyMessage="No hay órdenes de pago"
        exportConfig={exportConfig}
        data-testid="payment-orders-table"
      />
    </div>
  );
}
