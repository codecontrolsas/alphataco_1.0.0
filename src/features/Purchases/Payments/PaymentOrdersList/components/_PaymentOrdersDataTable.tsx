'use client';

import { formatMoney } from '@/features/Warehouses/lib/format';
import type { payment_method, payment_order_status } from '@/generated/prisma/enums';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { type DataTableExportConfig, type DataTableFacetedFilterConfig, type DataTableSearchParams, type FacetResult } from '@/shared/components/common/DataTable/types';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { Banknote, CircleOff, Landmark, Truck, User, Wallet, WalletCards, type LucideIcon } from 'lucide-react';
import { formatArgentinaDay, formatDateAr } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
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
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['status', 'supplier', 'planned_on'];

const EMPTY_FACET: FacetResult = { options: [], counts: new Map() };

const STATUS_VALUES = Object.keys(PAYMENT_ORDER_STATUS_LABELS) as payment_order_status[];
const METHOD_VALUES = Object.keys(PAYMENT_METHOD_LABELS) as payment_method[];
const methodIcons: Record<payment_method, LucideIcon> = {
  TRANSFER: Landmark,
  CHECK: Wallet,
  ECHECK: Wallet,
  CASH: Banknote,
  THIRD_PARTY_CHECK: WalletCards,
};

/** Columnas DATE (sin hora): medianoche UTC, se leen como fecha para no correr un día. */
const dateOnly = (value: unknown) =>
  value ? formatDateAr(new Date(value as string | Date).toISOString().slice(0, 10)) : '';
const money = (value: unknown) => formatMoney(value as string);

export function _PaymentOrdersDataTable({
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
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getPaymentOrdersPaginated(params), []);

  const columns = useMemo(() => getColumns(), []);

  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((c) => [c, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(() => {
    const fkFacet =
      (columnId: string, icon: LucideIcon) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getPaymentOrderSingleFacet(columnId, params);
        if (!result) return EMPTY_FACET;
        return {
          options: (result.resolvedOptions ?? []).map((o) => ({ value: o.id, label: o.name ?? '', icon })),
          counts: result.counts,
        };
      };

    return [
      {
        columnId: 'status',
        title: 'Estado',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getPaymentOrderSingleFacet('status', params);
          if (!result) return EMPTY_FACET;
          return {
            options: STATUS_VALUES.map((value) => ({
              value,
              label: PAYMENT_ORDER_STATUS_LABELS[value],
              icon: paymentOrderStatusIcons[value],
            })),
            counts: result.counts,
          };
        },
      },
      { columnId: 'supplier', title: 'Proveedor', fetchFacet: fkFacet('supplier', Truck) },
      { columnId: 'planned_on', title: 'Fecha prevista', type: 'dateRange' as const },
      { columnId: 'paid_on', title: 'Fecha de pago', type: 'dateRange' as const },
      {
        columnId: 'methods',
        title: 'Medios de pago',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getPaymentOrderSingleFacet('methods', params);
          if (!result) return EMPTY_FACET;
          return {
            options: [
              ...METHOD_VALUES.map((value) => ({ value, label: PAYMENT_METHOD_LABELS[value], icon: methodIcons[value] })),
              ...(result.counts.has(NULL_FILTER_VALUE)
                ? [{ value: NULL_FILTER_VALUE, label: NO_PAYMENT_LABEL, icon: CircleOff }]
                : []),
            ],
            counts: result.counts,
          };
        },
      },
      { columnId: 'creator', title: 'Cargó', fetchFacet: fkFacet('creator', User) },
      { columnId: 'created_at', title: 'Fecha de alta', type: 'dateRange' as const },
      { columnId: 'number', title: 'Número', type: 'text' as const, placeholder: 'Buscar por número...' },
      { columnId: 'invoices_total', title: 'Aplicado', type: 'text' as const, placeholder: 'Importe exacto, ej: 1234,56' },
      { columnId: 'credits_total', title: 'Notas de crédito', type: 'text' as const, placeholder: 'Importe exacto, ej: 1234,56' },
      { columnId: 'advance_total', title: 'Anticipos', type: 'text' as const, placeholder: 'Importe exacto, ej: 1234,56' },
      { columnId: 'withholdings_total', title: 'Retenciones', type: 'text' as const, placeholder: 'Importe exacto, ej: 1234,56' },
      { columnId: 'net_total', title: 'Neto', type: 'text' as const, placeholder: 'Importe exacto, ej: 1234,56' },
    ];
  }, []);

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) return initialFilterVisibility;
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

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
        searchParams={searchParams}
        tableId={tableId}
        paramNamespace={tableId}
        facetedFilters={facetedFilters}
        initialColumnVisibility={mergedColumnVisibility}
        initialFilterVisibility={mergedFilterVisibility}
        showFilterToggle
        queryFn={tableQueryFn}
        queryKey={[...PURCHASES_QUERY_KEYS.payments]}
        onStateChange={handleStateChange}
        searchPlaceholder="Buscar por número o proveedor"
        emptyMessage="No hay órdenes de pago"
        exportConfig={exportConfig}
        data-testid="payment-orders-table"
      />
    </div>
  );
}
