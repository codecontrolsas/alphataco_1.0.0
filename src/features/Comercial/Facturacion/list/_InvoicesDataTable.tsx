'use client';

import { arca_environment, invoice_status } from '@/generated/prisma/enums';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { type DataTableFacetedFilterConfig, type DataTableSearchParams, type FacetResult } from '@/shared/components/common/DataTable/types';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { CBTE_TYPES, type CbteTypeId } from '@/shared/lib/arca/catalogs';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { formatAmountText } from '@/shared/utils/amount-text';
import { CircleOff } from 'lucide-react';
import moment from 'moment';
import { useCallback, useMemo, useState } from 'react';
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

const ALL_FILTER_IDS = [
  'status',
  'cbte_type',
  'customer',
  'sales_point',
  'environment',
  'simulated',
  'currency',
  'voucher_number',
  'cuit',
  'cae',
  'total',
  'issue_date',
  'cae_due_date',
  'created_at',
];

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

  // ─── Client-side navigation ────────────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);
  const handleStateChange = useCallback((params: DataTableSearchParams) => setCurrentParams(params), []);
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getInvoicesPaginated(params), []);

  // ─── Visibilidad: preferencias guardadas > defaults ────────────────────────
  const mergedColumnVisibility = useMemo(() => {
    const defaults: Record<string, boolean> = {};
    for (const col of HIDDEN_COLUMNS_BY_DEFAULT) defaults[col] = false;
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    return Object.fromEntries(ALL_FILTER_IDS.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
  }, [initialFilterVisibility]);

  // ─── fetchFacet factories (lazy-load por filtro) ───────────────────────────
  const makeEnumFetchFacet = useCallback(
    (columnId: string, options: FacetResult['options']) => async (params: DataTableSearchParams) => {
      const result = await getInvoiceSingleFacet(columnId, params);
      if (!result) return { options: [], counts: new Map<string, number>() } satisfies FacetResult;
      return { options, counts: result.counts } satisfies FacetResult;
    },
    []
  );

  const makeFkFetchFacet = useCallback(
    (columnId: string) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getInvoiceSingleFacet(columnId, params);
        if (!result) return { options: [], counts: new Map() };
        return {
          options: [
            ...(result.resolvedOptions?.map((o) => ({ value: o.id, label: o.name ?? '' })) ?? []),
            ...(result.counts.has(NULL_FILTER_VALUE)
              ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff }]
              : []),
          ],
          counts: result.counts,
        };
      },
    []
  );

  // ─── Filtros ───────────────────────────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      {
        columnId: 'status',
        title: 'Estado',
        fetchFacet: makeEnumFetchFacet(
          'status',
          Object.values(invoice_status).map((value) => ({
            value,
            label: INVOICE_STATUS_LABELS[value],
            icon: statusIcons[value],
          }))
        ),
      },
      {
        columnId: 'cbte_type',
        title: 'Tipo',
        fetchFacet: makeEnumFetchFacet(
          'cbte_type',
          ENABLED_CBTE_TYPES.map((id) => ({ value: String(id), label: cbteLabel(id), icon: cbteTypeIcon(id) }))
        ),
      },
      { columnId: 'customer', title: 'Cliente', fetchFacet: makeFkFetchFacet('customer') },
      { columnId: 'sales_point', title: 'Punto de venta', fetchFacet: makeFkFetchFacet('sales_point') },
      {
        columnId: 'environment',
        title: 'Ambiente',
        fetchFacet: makeEnumFetchFacet(
          'environment',
          Object.values(arca_environment).map((value) => ({
            value,
            label: ENVIRONMENT_LABELS[value],
            icon: environmentIcons[value],
          }))
        ),
      },
      {
        columnId: 'simulated',
        title: 'Simulado',
        fetchFacet: makeEnumFetchFacet('simulated', [
          { value: 'true', label: 'Sí', icon: simulatedIcons.true },
          { value: 'false', label: 'No', icon: simulatedIcons.false },
        ]),
      },
      { columnId: 'currency', title: 'Moneda', fetchFacet: makeFkFetchFacet('currency') },

      // ── Texto ──
      {
        columnId: 'voucher_number',
        title: 'Número',
        type: 'text' as const,
        placeholder: 'Ej: 00003-00000124 o 124...',
      },
      { columnId: 'cuit', title: 'CUIT', type: 'text' as const, placeholder: 'CUIT completo...' },
      { columnId: 'cae', title: 'CAE', type: 'text' as const, placeholder: 'Buscar por CAE...' },
      ...(canViewPrices
        ? [{ columnId: 'total', title: 'Total', type: 'text' as const, placeholder: 'Importe exacto, ej: 1234,56' }]
        : []),

      // ── Fechas ──
      { columnId: 'issue_date', title: 'Fecha de emisión', type: 'dateRange' as const },
      { columnId: 'cae_due_date', title: 'Vencimiento CAE', type: 'dateRange' as const },
      { columnId: 'created_at', title: 'Fecha de creación', type: 'dateRange' as const },
    ],
    [makeEnumFetchFacet, makeFkFetchFacet, canViewPrices]
  );

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
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
      initialSorting={DEFAULT_SORTING}
      showSearch
      searchPlaceholder="Buscar por número, cliente o CAE..."
      showFilterToggle
      queryFn={tableQueryFn}
      queryKey={['invoices-paginated']}
      onStateChange={handleStateChange}
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
