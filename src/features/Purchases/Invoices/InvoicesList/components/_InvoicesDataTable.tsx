'use client';

import { formatMoney } from '@/features/Warehouses/lib/format';
import type { arca_check_result, supplier_invoice_status } from '@/generated/prisma/enums';
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
import { CalendarDays, FileText, ShieldAlert, ShieldCheck, ShieldX, ShoppingCart, Truck, User } from 'lucide-react';
import { useCallback, useMemo, type ReactNode } from 'react';
import { ARCA_CHECK_LABELS, SUPPLIER_INVOICE_STATUS_LABELS } from '../../../lib/invoice-status';
import { PURCHASES_QUERY_KEYS } from '../../../lib/query-keys';
import { supplierInvoiceStatusIcons } from '../../components/SupplierInvoiceStatusBadge';
import {
  getAllSupplierInvoicesForExport,
  getSupplierInvoiceSingleFacet,
  getSupplierInvoicesPaginated,
  type SupplierInvoiceListItem,
} from '../actions.server';
import { cbteTypeLabel, getColumns } from '../columns';
import { HIDDEN_COLUMNS_BY_DEFAULT, INVOICE_CBTE_TYPE_IDS, NO_ARCA_CHECK_LABEL, NO_ORDER_LABEL } from '../constants';

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

const facets = createFacetFilters(getSupplierInvoiceSingleFacet);

const STATUS_VALUES = Object.keys(SUPPLIER_INVOICE_STATUS_LABELS) as supplier_invoice_status[];
const ARCA_VALUES = Object.keys(ARCA_CHECK_LABELS) as arca_check_result[];
const arcaIcons = { APPROVED: ShieldCheck, REJECTED: ShieldX, UNAVAILABLE: ShieldAlert } as const;

const STATUS_OPTIONS = STATUS_VALUES.map((value) => ({
  value,
  label: SUPPLIER_INVOICE_STATUS_LABELS[value],
  icon: supplierInvoiceStatusIcons[value],
}));

const CBTE_TYPE_OPTIONS = INVOICE_CBTE_TYPE_IDS.map((id) => ({
  value: String(id),
  label: cbteTypeLabel(id),
  icon: FileText,
}));

const ARCA_OPTIONS = ARCA_VALUES.map((value) => ({
  value,
  label: ARCA_CHECK_LABELS[value],
  icon: arcaIcons[value],
}));

/** Columnas DATE (sin hora): medianoche UTC, se leen como fecha para no correr un día. */
const dateOnly = (value: unknown) => (value ? formatDateOnlyAr(value as string | Date) : '');

export function _InvoicesDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  topSlot,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getSupplierInvoicesPaginated(params), []);

  const columns = useMemo(() => getColumns(), []);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      facets.fixed('status', 'Estado', STATUS_OPTIONS),
      facets.lookup('supplier', 'Proveedor', Truck),
      { columnId: 'issue_date', title: 'Fecha de emisión', type: 'dateRange' as const },
      facets.fixed('cbte_type', 'Tipo de comprobante', CBTE_TYPE_OPTIONS),
      facets.lookup('vat_period', 'Período IVA', CalendarDays),
      facets.fixed('arca_check_result', 'Constatación ARCA', ARCA_OPTIONS, { label: NO_ARCA_CHECK_LABEL }),
      facets.lookup('orders', 'OC vinculadas', ShoppingCart, { label: NO_ORDER_LABEL }),
      facets.lookup('creator', 'Cargó', User),
      { columnId: 'due_date', title: 'Vencimiento', type: 'dateRange' as const },
      { columnId: 'created_at', title: 'Fecha de alta', type: 'dateRange' as const },
      {
        columnId: 'number',
        title: 'Comprobante',
        type: 'text' as const,
        placeholder: 'Ej: 00003-00012345 (exacto)',
      },
      {
        columnId: 'supplier_cuit',
        title: 'CUIT del proveedor',
        type: 'text' as const,
        placeholder: 'Buscar por CUIT...',
      },
      { columnId: 'total', title: 'Total', type: 'text' as const, placeholder: 'Importe exacto, ej: 1234,56' },
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
    savedFilterVisibility: initialFilterVisibility,
  });

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
        {...tableProps}
        queryFn={tableQueryFn}
        queryKey={[...PURCHASES_QUERY_KEYS.invoices]}
        searchPlaceholder="Buscar por número o proveedor"
        emptyMessage="No hay comprobantes cargados"
        exportConfig={exportConfig}
        data-testid="supplier-invoices-table"
      />
    </div>
  );
}
