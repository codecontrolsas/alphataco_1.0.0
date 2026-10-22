'use client';

import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { createFacetFilters } from '@/shared/components/common/DataTable/facet-filters';
import {
  type DataTableExportConfig,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
} from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useCallback, useMemo, type ReactNode } from 'react';
import { WAREHOUSE_QUERY_KEYS } from '../../../../lib/query-keys';
import { getAllStockForExport, getStockPaginated, getStockSingleFacet, type StockListItem } from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, formatBatchExpiry, getColumns, stockLevelByBelowMin } from '../columns';

interface Props {
  data: StockListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
  /** Banda y tarjetas de atención resueltas en el servidor; se muestran sobre la tabla. */
  topSlot?: ReactNode;
}

const DEFAULT_VISIBLE_FILTERS = ['warehouse', 'category', 'below_min'];

const facets = createFacetFilters(getStockSingleFacet);

export function _StockDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
  topSlot,
}: Props) {
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getStockPaginated(params), []);

  // El servidor decide por su cuenta: esto solo agrega las columnas de costo si va a haber datos.
  const canViewPrices = permissionsMap['almacenes:stock:view_prices'] === true;
  const columns = useMemo(() => getColumns({ canViewPrices }), [canViewPrices]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      facets.lookup('warehouse', 'Depósito', undefined, { label: 'Sin asignar' }),
      facets.lookup('category', 'Categoría', undefined, { label: 'Sin asignar' }),
      facets.fixed('below_min', 'Nivel de stock', [
        // Mismos textos e íconos que el badge de la celda (STOCK_LEVEL_UI)
        { value: 'true', label: stockLevelByBelowMin.true.label, icon: stockLevelByBelowMin.true.icon },
        { value: 'false', label: stockLevelByBelowMin.false.label, icon: stockLevelByBelowMin.false.icon },
      ]),
      facets.lookup('unit', 'Unidad', undefined, { label: 'Sin asignar' }),
      facets.lookup('batch', 'Lote', undefined, { label: 'Sin asignar' }),
      { columnId: 'code', title: 'Código', type: 'text' as const, placeholder: 'Buscar por código...' },
      { columnId: 'material', title: 'Material', type: 'text' as const, placeholder: 'Buscar por material...' },
      { columnId: 'expires_at', title: 'Vencimiento', type: 'dateRange' as const },
      // Numericos: el servidor busca el valor exacto (contains no aplica a Decimal)
      { columnId: 'quantity', title: 'Cantidad', type: 'text' as const, placeholder: 'Valor exacto...' },
      ...(canViewPrices
        ? [{ columnId: 'average_cost', title: 'Costo promedio', type: 'text' as const, placeholder: 'Valor exacto...' }]
        : []),
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

  const exportConfig: DataTableExportConfig<StockListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllStockForExport(currentParams)),
      options: { filename: 'stock', title: 'Stock por depósito', sheetName: 'Stock' },
      formatters: {
        expires_at: (value) => formatBatchExpiry(value as string | Date | null),
        below_min: (value) => (value ? stockLevelByBelowMin.true.label : stockLevelByBelowMin.false.label),
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
        queryKey={[...WAREHOUSE_QUERY_KEYS.stock]}
        searchPlaceholder="Buscar por código, material o lote"
        emptyMessage="No hay stock cargado"
        exportConfig={exportConfig}
        data-testid="warehouse-stock-table"
      />
    </div>
  );
}
