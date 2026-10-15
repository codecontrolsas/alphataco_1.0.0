'use client';

import { formatMoney } from '@/features/Warehouses/lib/format';
import {
  DataTable,
  type DataTableExportConfig,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { Landmark } from 'lucide-react';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { formatArgentinaDateTime } from '../../../lib/today';
import { TRANSFER_STATE_UI } from '../../../lib/status-presentation';
import { useCallback, useMemo, useState } from 'react';
import { TREASURY_QUERY_KEYS } from '../../../lib/query-keys';
import {
  getAllTreasuryTransfersForExport,
  getTreasuryTransferSingleFacet,
  getTreasuryTransfersPaginated,
  type TreasuryTransferListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, formatValueDate, getColumns } from '../columns';
import { TRANSFER_STATE_LABELS } from '../constants';

interface Props {
  data: TreasuryTransferListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  canUpdate: boolean;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['date', 'from_account', 'to_account'];

const EMPTY_FACET: FacetResult = { options: [], counts: new Map() };

const STATE_VALUES = Object.keys(TRANSFER_STATE_LABELS) as (keyof typeof TRANSFER_STATE_LABELS)[];

export function _TransfersDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  canUpdate,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);
  const handleStateChange = useCallback((params: DataTableSearchParams) => setCurrentParams(params), []);
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getTreasuryTransfersPaginated(params), []);

  const columns = useMemo(() => getColumns({ canUpdate }), [canUpdate]);

  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((c) => [c, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(() => {
    const accountFacet =
      (columnId: string) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getTreasuryTransferSingleFacet(columnId, params);
        if (!result) return EMPTY_FACET;
        return {
          options: (result.resolvedOptions ?? []).map((o) => ({ value: o.id, label: o.name ?? '', icon: Landmark })),
          counts: result.counts,
        };
      };

    return [
      { columnId: 'from_account', title: 'Origen', fetchFacet: accountFacet('from_account') },
      { columnId: 'to_account', title: 'Destino', fetchFacet: accountFacet('to_account') },
      { columnId: 'date', title: 'Fecha', type: 'dateRange' as const },
      {
        columnId: 'state',
        title: 'Estado',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getTreasuryTransferSingleFacet('state', params);
          if (!result) return EMPTY_FACET;
          return {
            options: STATE_VALUES.map((value) => ({
              value,
              label: TRANSFER_STATE_LABELS[value],
              icon: TRANSFER_STATE_UI[value].icon,
            })),
            counts: result.counts,
          };
        },
      },
      { columnId: 'created_at', title: 'Fecha de alta', type: 'dateRange' as const },
      { columnId: 'number', title: 'Número', type: 'text' as const, placeholder: 'Buscar por número...' },
      { columnId: 'amount', title: 'Importe', type: 'text' as const, placeholder: 'Importe exacto, ej: 1234,56' },
      { columnId: 'notes', title: 'Notas', type: 'text' as const, placeholder: 'Buscar en las notas...' },
      { columnId: 'cancel_reason', title: 'Motivo de anulación', type: 'text' as const, placeholder: 'Buscar en el motivo...' },
    ];
  }, []);

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) return initialFilterVisibility;
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

  const exportConfig: DataTableExportConfig<TreasuryTransferListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllTreasuryTransfersForExport(currentParams)),
      options: { filename: 'transferencias-tesoreria', title: 'Transferencias', sheetName: 'Transferencias' },
      formatters: {
        date: (value) => formatValueDate(value as string),
        created_at: (value) => (value ? formatArgentinaDateTime(value as string | Date) : ''),
        amount: (value) => formatMoney(value as string),
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
      queryKey={[...TREASURY_QUERY_KEYS.transfers]}
      onStateChange={handleStateChange}
      searchPlaceholder="Buscar por número, notas o cuenta"
      emptyMessage="No hay transferencias"
      exportConfig={exportConfig}
      data-testid="treasury-transfers-table"
    />
  );
}
