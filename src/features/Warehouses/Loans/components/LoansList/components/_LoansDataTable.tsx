'use client';

import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { createFacetFilters } from '@/shared/components/common/DataTable/facet-filters';
import {
  type DataTableExportConfig,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
} from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { formatDateAr } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useCallback, useMemo, type ReactNode } from 'react';
import { destinationTypeIcons } from '../../../../Movements/components/MovementsList/columns';
import { DESTINATION_TYPE_LABELS } from '../../../../lib/labels';
import { WAREHOUSE_QUERY_KEYS } from '../../../../lib/query-keys';
import { STOCK_DESTINATION_TYPES, type StockDestinationTypeValue } from '../../../../schemas/stock-movement';
import { getAllLoansForExport, getLoanSingleFacet, getLoansPaginated, type LoanListItem } from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from '../columns';

interface Props {
  data: LoanListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
  topSlot?: ReactNode;
}

const DEFAULT_VISIBLE_FILTERS = ['destination_type', 'holder', 'since'];

const facets = createFacetFilters(getLoanSingleFacet);

export function _LoansDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
  topSlot,
}: Props) {
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getLoansPaginated(params), []);

  const canReturn = permissionsMap['almacenes:prestamos:create'] === true;
  const canWriteOff = permissionsMap['almacenes:prestamos:delete'] === true;
  const columns = useMemo(() => getColumns({ canReturn, canWriteOff }), [canReturn, canWriteOff]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      facets.fixed(
        'destination_type',
        'Tipo de destino',
        STOCK_DESTINATION_TYPES.map((value) => ({
          value,
          label: DESTINATION_TYPE_LABELS[value],
          icon: destinationTypeIcons[value],
        })),
        { label: 'Sin asignar' }
      ),
      {
        columnId: 'holder',
        title: 'Tenedor',
        type: 'text' as const,
        placeholder: 'Legajo, apellido, dominio, interno, orden o cliente...',
      },
      { columnId: 'since', title: 'Desde', type: 'dateRange' as const },
      { columnId: 'material_code', title: 'Código', type: 'text' as const, placeholder: 'Buscar por código...' },
      { columnId: 'material', title: 'Material', type: 'text' as const, placeholder: 'Buscar por material...' },
      {
        columnId: 'serial_number',
        title: 'Número de serie',
        type: 'text' as const,
        placeholder: 'Buscar por serie...',
      },
      { columnId: 'days', title: 'Días en préstamo', type: 'text' as const, placeholder: 'Cantidad exacta de días...' },
      { columnId: 'exit', title: 'Salida', type: 'text' as const, placeholder: 'Buscar por número de salida...' },
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

  const exportConfig: DataTableExportConfig<LoanListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllLoansForExport(currentParams)),
      options: { filename: 'prestamos', title: 'Préstamos abiertos', sheetName: 'Préstamos' },
      formatters: {
        destination_type: (value) =>
          value ? DESTINATION_TYPE_LABELS[value as StockDestinationTypeValue] ?? String(value) : '',
        since: (value) => (value ? formatDateAr(value as string) : ''),
        days: (value) => (value == null || value === '' ? '' : String(value)),
      },
    }),
    [currentParams]
  );

  return (
    <>
      {topSlot}
      <DataTable
        columns={columns}
        data={data}
        totalRows={totalRows}
        {...tableProps}
        queryFn={tableQueryFn}
        queryKey={[...WAREHOUSE_QUERY_KEYS.loans]}
        searchPlaceholder="Buscar por material, código o número de serie"
        emptyMessage="No hay préstamos abiertos"
        exportConfig={exportConfig}
        data-testid="warehouse-loans-table"
      />
    </>
  );
}
