'use client';

import {
  DataTable,
  type DataTableExportConfig,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { CircleOff } from 'lucide-react';
import moment from 'moment';
import { useCallback, useMemo, useState } from 'react';
import { DESTINATION_TYPE_LABELS } from '../../../../lib/labels';
import { WAREHOUSE_QUERY_KEYS } from '../../../../lib/query-keys';
import { STOCK_DESTINATION_TYPES, type StockDestinationTypeValue } from '../../../../schemas/stock-movement';
import { destinationTypeIcons } from '../../../../Movements/components/MovementsList/columns';
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
}

const DEFAULT_VISIBLE_FILTERS = ['destination_type', 'holder', 'since'];

const EMPTY_FACET: FacetResult = { options: [], counts: new Map() };

export function _LoansDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);
  const handleStateChange = useCallback((params: DataTableSearchParams) => setCurrentParams(params), []);
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getLoansPaginated(params), []);

  const canReturn = permissionsMap['almacenes:prestamos:create'] === true;
  const canWriteOff = permissionsMap['almacenes:prestamos:delete'] === true;
  const columns = useMemo(() => getColumns({ canReturn, canWriteOff }), [canReturn, canWriteOff]);

  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((c) => [c, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      {
        columnId: 'destination_type',
        title: 'Tipo de destino',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getLoanSingleFacet('destination_type', params);
          if (!result) return EMPTY_FACET;
          return {
            options: [
              ...STOCK_DESTINATION_TYPES.map((value) => ({
                value,
                label: DESTINATION_TYPE_LABELS[value],
                icon: destinationTypeIcons[value],
              })),
              ...(result.counts.has(NULL_FILTER_VALUE)
                ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff }]
                : []),
            ],
            counts: result.counts,
          };
        },
      },
      {
        columnId: 'holder',
        title: 'Tenedor',
        type: 'text' as const,
        placeholder: 'Legajo, apellido, dominio, interno, orden o cliente...',
      },
      { columnId: 'since', title: 'Desde', type: 'dateRange' as const },
      { columnId: 'material_code', title: 'Código', type: 'text' as const, placeholder: 'Buscar por código...' },
      { columnId: 'material', title: 'Material', type: 'text' as const, placeholder: 'Buscar por material...' },
      { columnId: 'serial_number', title: 'Número de serie', type: 'text' as const, placeholder: 'Buscar por serie...' },
      { columnId: 'days', title: 'Días en préstamo', type: 'text' as const, placeholder: 'Cantidad exacta de días...' },
      { columnId: 'exit', title: 'Salida', type: 'text' as const, placeholder: 'Buscar por número de salida...' },
    ],
    []
  );

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) return initialFilterVisibility;
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

  const exportConfig: DataTableExportConfig<LoanListItem> = useMemo(
    () => ({
      fetchAllData: () => getAllLoansForExport(currentParams),
      options: { filename: 'prestamos', title: 'Préstamos abiertos', sheetName: 'Préstamos' },
      formatters: {
        destination_type: (value) =>
          value ? (DESTINATION_TYPE_LABELS[value as StockDestinationTypeValue] ?? String(value)) : '',
        since: (value) => (value ? moment.utc(value as string).format('DD/MM/YYYY') : ''),
        days: (value) => (value == null || value === '' ? '' : String(value)),
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
      queryKey={[...WAREHOUSE_QUERY_KEYS.loans]}
      onStateChange={handleStateChange}
      searchPlaceholder="Buscar por material, código o número de serie"
      emptyMessage="No hay préstamos abiertos"
      exportConfig={exportConfig}
      data-testid="warehouse-loans-table"
    />
  );
}
