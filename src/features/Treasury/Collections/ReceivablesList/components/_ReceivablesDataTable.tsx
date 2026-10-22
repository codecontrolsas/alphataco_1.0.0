'use client';

import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { EMPTY_FACET } from '@/shared/components/common/DataTable/facet-filters';
import {
  type DataTableExportConfig,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable/types';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { Banknote, Users } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { formatInCurrency } from '../../../lib/currency-format';
import { TREASURY_QUERY_KEYS } from '../../../lib/query-keys';
import { RECEIVABLE_STATE_LABELS, type ReceivableState } from '../../../lib/receipt-rules';
import {
  getAllReceivablesForExport,
  getReceivableSingleFacet,
  getReceivablesPaginated,
  type ReceivableListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, formatValueDate, getColumns, receivableStateIcons } from '../columns';
import { NO_DUE_DATE_LABEL, RECEIVABLE_CURRENCIES } from '../constants';

interface Props {
  data: ReceivableListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  canCollect: boolean;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['customer', 'currency', 'state'];

const STATE_VALUES = Object.keys(RECEIVABLE_STATE_LABELS) as ReceivableState[];

export function _ReceivablesDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  canCollect,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);
  const handleStateChange = useCallback((params: DataTableSearchParams) => setCurrentParams(params), []);
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getReceivablesPaginated(params), []);

  const columns = useMemo(() => getColumns({ canCollect }), [canCollect]);

  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((c) => [c, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      {
        columnId: 'customer',
        title: 'Cliente',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getReceivableSingleFacet('customer', params);
          if (!result) return EMPTY_FACET;
          return {
            options: (result.resolvedOptions ?? []).map((o) => ({ value: o.id, label: o.name ?? '', icon: Users })),
            counts: result.counts,
          };
        },
      },
      {
        columnId: 'currency',
        title: 'Moneda',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getReceivableSingleFacet('currency', params);
          if (!result) return EMPTY_FACET;
          return {
            options: RECEIVABLE_CURRENCIES.map((value) => ({ value, label: value, icon: Banknote })),
            counts: result.counts,
          };
        },
      },
      {
        columnId: 'state',
        title: 'Estado',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getReceivableSingleFacet('state', params);
          if (!result) return EMPTY_FACET;
          return {
            options: STATE_VALUES.map((value) => ({
              value,
              label: RECEIVABLE_STATE_LABELS[value],
              icon: receivableStateIcons[value],
            })),
            counts: result.counts,
          };
        },
      },
      { columnId: 'issue_date', title: 'Fecha', type: 'dateRange' as const },
      { columnId: 'due_date', title: 'Vencimiento', type: 'dateRange' as const },
      { columnId: 'voucher', title: 'Comprobante', type: 'text' as const, placeholder: 'Ej: Factura A 00003-00000124' },
      { columnId: 'total', title: 'Total', type: 'text' as const, placeholder: 'Importe exacto, ej: 1234,56' },
      { columnId: 'pending', title: 'Pendiente', type: 'text' as const, placeholder: 'Importe exacto, ej: 1234,56' },
      {
        columnId: 'overdue_days',
        title: 'Días de atraso',
        type: 'text' as const,
        placeholder: 'Cantidad exacta de días',
      },
    ],
    []
  );

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) return initialFilterVisibility;
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

  const exportConfig: DataTableExportConfig<ReceivableListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllReceivablesForExport(currentParams)),
      options: { filename: 'a-cobrar', title: 'A cobrar', sheetName: 'A cobrar' },
      formatters: {
        issue_date: (value) => formatValueDate(value as string),
        due_date: (value) => (value ? formatValueDate(value as string) : NO_DUE_DATE_LABEL),
        // Los importes salen con su moneda, igual que en pantalla
        total: (value, row) => formatInCurrency(String(value), row.currency),
        pending: (value, row) => formatInCurrency(String(value), row.currency),
      },
    }),
    [currentParams]
  );

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
      showFilterToggle
      queryFn={tableQueryFn}
      queryKey={[...TREASURY_QUERY_KEYS.receivables]}
      onStateChange={handleStateChange}
      searchPlaceholder="Buscar por cliente o comprobante"
      emptyMessage="No hay comprobantes pendientes de cobro"
      exportConfig={exportConfig}
      data-testid="treasury-receivables-table"
    />
  );
}
