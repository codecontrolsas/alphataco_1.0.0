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
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { Landmark } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { TREASURY_QUERY_KEYS } from '../../../lib/query-keys';
import { TRANSFER_STATE_UI } from '../../../lib/status-presentation';
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

const STATE_VALUES = Object.keys(TRANSFER_STATE_LABELS) as (keyof typeof TRANSFER_STATE_LABELS)[];

const facets = createFacetFilters(getTreasuryTransferSingleFacet);

export function _TransfersDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  canUpdate,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getTreasuryTransfersPaginated(params), []);

  const columns = useMemo(() => getColumns({ canUpdate }), [canUpdate]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(() => {
    return [
      facets.lookup('from_account', 'Origen', Landmark),
      facets.lookup('to_account', 'Destino', Landmark),
      { columnId: 'date', title: 'Fecha', type: 'dateRange' as const },
      facets.fixed(
        'state',
        'Estado',
        STATE_VALUES.map((value) => ({
          value,
          label: TRANSFER_STATE_LABELS[value],
          icon: TRANSFER_STATE_UI[value].icon,
        }))
      ),
      { columnId: 'created_at', title: 'Fecha de alta', type: 'dateRange' as const },
      { columnId: 'number', title: 'Número', type: 'text' as const, placeholder: 'Buscar por número...' },
      { columnId: 'amount', title: 'Importe', type: 'text' as const, placeholder: 'Importe exacto, ej: 1234,56' },
      { columnId: 'notes', title: 'Notas', type: 'text' as const, placeholder: 'Buscar en las notas...' },
      {
        columnId: 'cancel_reason',
        title: 'Motivo de anulación',
        type: 'text' as const,
        placeholder: 'Buscar en el motivo...',
      },
    ];
  }, []);

  const { currentParams, tableProps } = useServerTableView({
    searchParams,
    tableId,
    hiddenColumnsByDefault: HIDDEN_COLUMNS_BY_DEFAULT,
    defaultVisibleFilters: DEFAULT_VISIBLE_FILTERS,
    facetedFilters,
    initialColumnVisibility,
    savedFilterVisibility: initialFilterVisibility,
  });

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
      {...tableProps}
      queryFn={tableQueryFn}
      queryKey={[...TREASURY_QUERY_KEYS.transfers]}
      searchPlaceholder="Buscar por número, notas o cuenta"
      emptyMessage="No hay transferencias"
      exportConfig={exportConfig}
      data-testid="treasury-transfers-table"
    />
  );
}
