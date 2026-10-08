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
import { WAREHOUSE_QUERY_KEYS } from '../../../../lib/query-keys';
import { getAllStockForExport, getStockPaginated, getStockSingleFacet, type StockListItem } from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, belowMinIcons, getColumns } from '../columns';

interface Props {
  data: StockListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['warehouse', 'category', 'below_min'];

const EMPTY_FACET: FacetResult = { options: [], counts: new Map() };

export function _StockDataTable({
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
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getStockPaginated(params), []);

  // El servidor decide por su cuenta: esto solo agrega las columnas de costo si va a haber datos.
  const canViewPrices = permissionsMap['almacenes:stock:view_prices'] === true;
  const columns = useMemo(() => getColumns({ canViewPrices }), [canViewPrices]);

  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((c) => [c, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  const makeFkFetchFacet = useCallback(
    (columnId: string) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getStockSingleFacet(columnId, params);
        if (!result) return EMPTY_FACET;
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

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      { columnId: 'warehouse', title: 'Depósito', fetchFacet: makeFkFetchFacet('warehouse') },
      { columnId: 'category', title: 'Categoría', fetchFacet: makeFkFetchFacet('category') },
      {
        columnId: 'below_min',
        title: 'Bajo mínimo',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getStockSingleFacet('below_min', params);
          if (!result) return EMPTY_FACET;
          return {
            options: [
              { value: 'true', label: 'Sí', icon: belowMinIcons.true },
              { value: 'false', label: 'No', icon: belowMinIcons.false },
            ],
            counts: result.counts,
          };
        },
      },
      { columnId: 'unit', title: 'Unidad', fetchFacet: makeFkFetchFacet('unit') },
      { columnId: 'batch', title: 'Lote', fetchFacet: makeFkFetchFacet('batch') },
      { columnId: 'code', title: 'Código', type: 'text' as const, placeholder: 'Buscar por código...' },
      { columnId: 'material', title: 'Material', type: 'text' as const, placeholder: 'Buscar por material...' },
      { columnId: 'expires_at', title: 'Vencimiento', type: 'dateRange' as const },
      // Numericos: el servidor busca el valor exacto (contains no aplica a Decimal)
      { columnId: 'quantity', title: 'Cantidad', type: 'text' as const, placeholder: 'Valor exacto...' },
      ...(canViewPrices
        ? [{ columnId: 'average_cost', title: 'Costo promedio', type: 'text' as const, placeholder: 'Valor exacto...' }]
        : []),
    ],
    [makeFkFetchFacet, canViewPrices]
  );

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) return initialFilterVisibility;
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

  const exportConfig: DataTableExportConfig<StockListItem> = useMemo(
    () => ({
      fetchAllData: () => getAllStockForExport(currentParams),
      options: { filename: 'stock', title: 'Stock por depósito', sheetName: 'Stock' },
      formatters: {
        expires_at: (value) => (value ? moment.utc(value as string | Date).format('DD/MM/YYYY') : ''),
        below_min: (value) => (value ? 'Sí' : 'No'),
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
      queryKey={[...WAREHOUSE_QUERY_KEYS.stock]}
      onStateChange={handleStateChange}
      searchPlaceholder="Buscar por código, material o lote"
      emptyMessage="No hay stock cargado"
      exportConfig={exportConfig}
      data-testid="warehouse-stock-table"
    />
  );
}
