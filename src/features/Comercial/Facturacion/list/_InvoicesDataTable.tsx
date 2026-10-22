'use client';

import { arca_environment, invoice_status } from '@/generated/prisma/enums';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import {
  createFacetFilters,
  dateRangeFilter,
  enumFilterOptions,
  textFilter,
} from '@/shared/components/common/DataTable/facet-filters';
import type { DataTableFacetedFilterConfig, DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { CBTE_TYPES, type CbteTypeId } from '@/shared/lib/arca/catalogs';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { formatAmountText } from '@/shared/utils/amount-text';
import moment from 'moment';
import { useCallback, useMemo } from 'react';
import { INVOICE_STATUS_LABELS } from '../lib/invoice-state-machine';
import { cbteLabel } from '../lib/invoice-type';
import {
  getInvoiceSingleFacet,
  getInvoicesForExport,
  getInvoicesPaginated,
  type InvoiceListItem,
} from './actions.server';
import {
  ENVIRONMENT_LABELS,
  HIDDEN_COLUMNS_BY_DEFAULT,
  cbteTypeIcon,
  environmentIcons,
  getInvoiceColumns,
  simulatedIcons,
  statusIcons,
} from './columns';

// ============================================================================
// TYPES
// ============================================================================

interface InvoicesDataTableProps {
  data: InvoiceListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  canViewPrices: boolean;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

/** Solo 3 filtros visibles de entrada; el resto se activa desde el toggle de filtros. */
const DEFAULT_VISIBLE_FILTERS = ['status', 'cbte_type', 'customer'];

const facets = createFacetFilters(getInvoiceSingleFacet);

const UNASSIGNED = { label: 'Sin asignar' };

const DEFAULT_SORTING = [{ id: 'issue_date', desc: true }];

// Tipos de comprobante habilitados (los MiPyME existen en el catálogo pero no se emiten en v1)
const ENABLED_CBTE_TYPES = (Object.keys(CBTE_TYPES) as unknown as string[])
  .map(Number)
  .filter((id) => CBTE_TYPES[id as CbteTypeId].enabled);

// ============================================================================
// COMPONENT
// ============================================================================

export default function _InvoicesDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  canViewPrices,
  initialColumnVisibility,
  initialFilterVisibility,
}: InvoicesDataTableProps) {
  const columns = useMemo(() => getInvoiceColumns(canViewPrices), [canViewPrices]);

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getInvoicesPaginated(params), []);

  // ─── Filtros (lazy-load por filtro) ────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      facets.fixed(
        'status',
        'Estado',
        enumFilterOptions(Object.values(invoice_status), INVOICE_STATUS_LABELS, statusIcons)
      ),
      facets.fixed(
        'cbte_type',
        'Tipo',
        ENABLED_CBTE_TYPES.map((id) => ({ value: String(id), label: cbteLabel(id), icon: cbteTypeIcon(id) }))
      ),
      facets.lookup('customer', 'Cliente', undefined, UNASSIGNED),
      facets.lookup('sales_point', 'Punto de venta', undefined, UNASSIGNED),
      facets.fixed(
        'environment',
        'Ambiente',
        enumFilterOptions(Object.values(arca_environment), ENVIRONMENT_LABELS, environmentIcons)
      ),
      facets.fixed('simulated', 'Simulado', [
        { value: 'true', label: 'Sí', icon: simulatedIcons.true },
        { value: 'false', label: 'No', icon: simulatedIcons.false },
      ]),
      facets.lookup('currency', 'Moneda', undefined, UNASSIGNED),

      // ── Texto ──
      textFilter('voucher_number', 'Número', 'Ej: 00003-00000124 o 124...'),
      textFilter('cuit', 'CUIT', 'CUIT completo...'),
      textFilter('cae', 'CAE', 'Buscar por CAE...'),
      ...(canViewPrices ? [textFilter('total', 'Total', 'Importe exacto, ej: 1234,56')] : []),

      // ── Fechas ──
      dateRangeFilter('issue_date', 'Fecha de emisión'),
      dateRangeFilter('cae_due_date', 'Vencimiento CAE'),
      dateRangeFilter('created_at', 'Fecha de creación'),
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

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      {...tableProps}
      initialSorting={DEFAULT_SORTING}
      showSearch
      searchPlaceholder="Buscar por número, cliente o CAE..."
      queryFn={tableQueryFn}
      queryKey={['invoices-paginated']}
      emptyMessage="Todavía no hay comprobantes. Creá uno con “Nueva factura”."
      data-testid="invoices-table"
      exportConfig={{
        fetchAllData: async () => unwrapExportResult(await getInvoicesForExport(currentParams)),
        options: {
          filename: 'comprobantes',
          sheetName: 'Comprobantes',
          title: 'Listado de comprobantes electrónicos',
        },
        formatters: {
          issue_date: (value) => (value ? moment(value as string, 'YYYY-MM-DD').format('DD/MM/YYYY') : '-'),
          cae_due_date: (value) => (value ? moment(value as string, 'YYYY-MM-DD').format('DD/MM/YYYY') : '-'),
          created_at: (value) => (value ? formatArgentinaDateTime(value as string) : '-'),
          cbte_type: (_value, row) => row.cbteLabel,
          status: (_value, row) => INVOICE_STATUS_LABELS[row.status],
          environment: (_value, row) => ENVIRONMENT_LABELS[row.environment],
          simulated: (_value, row) => (row.simulated ? 'Sí' : 'No'),
          total: (_value, row) => (row.total === null ? '' : formatAmountText(row.total)),
          cae: (value) => (value ? String(value) : '-'),
        },
      }}
    />
  );
}
