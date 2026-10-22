'use client';

import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { type DataTableExportConfig, type DataTableFacetedFilterConfig, type DataTableSearchParams, type FacetResult } from '@/shared/components/common/DataTable/types';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { CalendarDays, CircleOff, FileText, ShoppingCart, ShieldCheck, ShieldX, ShieldAlert, Truck, User } from 'lucide-react';
import { formatArgentinaDay, formatDateAr } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { supplierInvoiceStatusIcons } from '../../components/SupplierInvoiceStatusBadge';
import { ARCA_CHECK_LABELS, SUPPLIER_INVOICE_STATUS_LABELS } from '../../../lib/invoice-status';
import { PURCHASES_QUERY_KEYS } from '../../../lib/query-keys';
import {
  getAllSupplierInvoicesForExport,
  getSupplierInvoiceSingleFacet,
  getSupplierInvoicesPaginated,
  type SupplierInvoiceListItem,
} from '../actions.server';
import { cbteTypeLabel, getColumns } from '../columns';
import { HIDDEN_COLUMNS_BY_DEFAULT, INVOICE_CBTE_TYPE_IDS, NO_ARCA_CHECK_LABEL, NO_ORDER_LABEL } from '../constants';
import type { arca_check_result, supplier_invoice_status } from '@/generated/prisma/enums';

interface Props {
  data: SupplierInvoiceListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  /** Banda de atención resuelta en el servidor; se muestra sobre la tabla. */
  topSlot?: ReactNode;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['status', 'supplier', 'issue_date'];

const EMPTY_FACET: FacetResult = { options: [], counts: new Map() };

const STATUS_VALUES = Object.keys(SUPPLIER_INVOICE_STATUS_LABELS) as supplier_invoice_status[];
const ARCA_VALUES = Object.keys(ARCA_CHECK_LABELS) as arca_check_result[];
const arcaIcons = { APPROVED: ShieldCheck, REJECTED: ShieldX, UNAVAILABLE: ShieldAlert } as const;

/** Columnas DATE (sin hora): medianoche UTC, se leen como fecha para no correr un día. */
const dateOnly = (value: unknown) =>
  value ? formatDateAr(new Date(value as string | Date).toISOString().slice(0, 10)) : '';

export function _InvoicesDataTable({
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
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getSupplierInvoicesPaginated(params), []);

  const columns = useMemo(() => getColumns(), []);

  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((c) => [c, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(() => {
    const fkFacet =
      (columnId: string, icon: typeof Truck, withNull?: string) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getSupplierInvoiceSingleFacet(columnId, params);
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
          const result = await getSupplierInvoiceSingleFacet('status', params);
          if (!result) return EMPTY_FACET;
          return {
            options: STATUS_VALUES.map((value) => ({
              value,
              label: SUPPLIER_INVOICE_STATUS_LABELS[value],
              icon: supplierInvoiceStatusIcons[value],
            })),
            counts: result.counts,
          };
        },
      },
      { columnId: 'supplier', title: 'Proveedor', fetchFacet: fkFacet('supplier', Truck) },
      { columnId: 'issue_date', title: 'Fecha de emisión', type: 'dateRange' as const },
      {
        columnId: 'cbte_type',
        title: 'Tipo de comprobante',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getSupplierInvoiceSingleFacet('cbte_type', params);
          if (!result) return EMPTY_FACET;
          return {
            options: INVOICE_CBTE_TYPE_IDS.map((id) => ({ value: String(id), label: cbteTypeLabel(id), icon: FileText })),
            counts: result.counts,
          };
        },
      },
      { columnId: 'vat_period', title: 'Período IVA', fetchFacet: fkFacet('vat_period', CalendarDays) },
      {
        columnId: 'arca_check_result',
        title: 'Constatación ARCA',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getSupplierInvoiceSingleFacet('arca_check_result', params);
          if (!result) return EMPTY_FACET;
          return {
            options: [
              ...ARCA_VALUES.map((value) => ({ value, label: ARCA_CHECK_LABELS[value], icon: arcaIcons[value] })),
              ...(result.counts.has(NULL_FILTER_VALUE)
                ? [{ value: NULL_FILTER_VALUE, label: NO_ARCA_CHECK_LABEL, icon: CircleOff }]
                : []),
            ],
            counts: result.counts,
          };
        },
      },
      { columnId: 'orders', title: 'OC vinculadas', fetchFacet: fkFacet('orders', ShoppingCart, NO_ORDER_LABEL) },
      { columnId: 'creator', title: 'Cargó', fetchFacet: fkFacet('creator', User) },
      { columnId: 'due_date', title: 'Vencimiento', type: 'dateRange' as const },
      { columnId: 'created_at', title: 'Fecha de alta', type: 'dateRange' as const },
      {
        columnId: 'number',
        title: 'Comprobante',
        type: 'text' as const,
        placeholder: 'Ej: 00003-00012345 (exacto)',
      },
      { columnId: 'supplier_cuit', title: 'CUIT del proveedor', type: 'text' as const, placeholder: 'Buscar por CUIT...' },
      { columnId: 'total', title: 'Total', type: 'text' as const, placeholder: 'Importe exacto, ej: 1234,56' },
    ];
  }, []);

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) return initialFilterVisibility;
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

  const exportConfig: DataTableExportConfig<SupplierInvoiceListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllSupplierInvoicesForExport(currentParams)),
      options: { filename: 'facturas-proveedor', title: 'Facturas de proveedor', sheetName: 'Facturas' },
      formatters: {
        issue_date: dateOnly,
        due_date: dateOnly,
        created_at: (value) => (value ? formatArgentinaDay(value as string | Date) : ''),
        total: (value) => formatMoney(value as string),
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
        queryKey={[...PURCHASES_QUERY_KEYS.invoices]}
        onStateChange={handleStateChange}
        searchPlaceholder="Buscar por número o proveedor"
        emptyMessage="No hay comprobantes cargados"
        exportConfig={exportConfig}
        data-testid="supplier-invoices-table"
      />
    </div>
  );
}
