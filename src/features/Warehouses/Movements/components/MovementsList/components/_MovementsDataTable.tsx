'use client';

import {
  DataTable,
  type DataTableExportConfig,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { CircleOff, User } from 'lucide-react';
import moment from 'moment';
import { useCallback, useMemo, useState } from 'react';
import { ALL_MOVEMENT_TYPES, DESTINATION_TYPE_LABELS, MOVEMENT_TYPE_LABELS, type MovementKind } from '../../../../lib/labels';
import { WAREHOUSE_QUERY_KEYS } from '../../../../lib/query-keys';
import {
  STOCK_DESTINATION_TYPES,
  type StockDestinationTypeValue,
} from '../../../../schemas/stock-movement';
import {
  getAllMovementsForExport,
  getMovementSingleFacet,
  getMovementsPaginated,
  type MovementListItem,
  type MovementReversalStatus,
} from '../actions.server';
import {
  HIDDEN_COLUMNS_BY_DEFAULT,
  REVERSAL_STATUS_LABELS,
  destinationTypeIcons,
  getColumns,
  movementTypeIcons,
  reversalStatusIcons,
} from '../columns';

interface Props {
  data: MovementListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['type', 'occurred_on', 'status'];
const REVERSAL_STATUSES: MovementReversalStatus[] = ['VALID', 'REVERSED', 'REVERSAL'];

const EMPTY_FACET: FacetResult = { options: [], counts: new Map() };

export function _MovementsDataTable({
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
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getMovementsPaginated(params), []);

  // El servidor decide por su cuenta: esto solo agrega la columna de costo si va a haber datos.
  const canViewPrices = permissionsMap['almacenes:movimientos:view_prices'] === true;
  const columns = useMemo(() => getColumns({ canViewPrices }), [canViewPrices]);

  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((c) => [c, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  /** FK con opciones del servidor; `icon` se aplica a todas (tipo de recurso). */
  const makeFkFetchFacet = useCallback(
    (columnId: string, icon?: typeof User) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getMovementSingleFacet(columnId, params);
        if (!result) return EMPTY_FACET;
        return {
          options: [
            ...(result.resolvedOptions?.map((o) => ({ value: o.id, label: o.name ?? '', ...(icon ? { icon } : {}) })) ??
              []),
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
      {
        columnId: 'type',
        title: 'Tipo',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getMovementSingleFacet('type', params);
          if (!result) return EMPTY_FACET;
          return {
            options: ALL_MOVEMENT_TYPES.map((value) => ({
              value,
              label: MOVEMENT_TYPE_LABELS[value],
              icon: movementTypeIcons[value],
            })),
            counts: result.counts,
          };
        },
      },
      { columnId: 'occurred_on', title: 'Fecha', type: 'dateRange' as const },
      {
        columnId: 'status',
        title: 'Estado',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getMovementSingleFacet('status', params);
          if (!result) return EMPTY_FACET;
          return {
            options: REVERSAL_STATUSES.map((value) => ({
              value,
              label: REVERSAL_STATUS_LABELS[value],
              icon: reversalStatusIcons[value],
            })),
            counts: result.counts,
          };
        },
      },
      { columnId: 'warehouse', title: 'Depósito', fetchFacet: makeFkFetchFacet('warehouse') },
      { columnId: 'target_warehouse', title: 'Depósito destino', fetchFacet: makeFkFetchFacet('target_warehouse') },
      {
        columnId: 'destination_type',
        title: 'Tipo de destino',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getMovementSingleFacet('destination_type', params);
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
      { columnId: 'created_by', title: 'Creado por', fetchFacet: makeFkFetchFacet('created_by', User) },
      { columnId: 'number', title: 'Número', type: 'text' as const, placeholder: 'Buscar por número...' },
      {
        columnId: 'destination',
        title: 'Destino',
        type: 'text' as const,
        placeholder: 'Legajo, apellido, dominio, interno, orden o cliente...',
      },
      { columnId: 'reference', title: 'Referencia', type: 'text' as const, placeholder: 'Buscar por referencia...' },
      { columnId: 'notes', title: 'Notas', type: 'text' as const, placeholder: 'Buscar en las notas...' },
      { columnId: 'created_at', title: 'Fecha de carga', type: 'dateRange' as const },
      ...(canViewPrices
        ? [{ columnId: 'total_cost', title: 'Total', type: 'text' as const, placeholder: 'Valor exacto...' }]
        : []),
    ],
    [makeFkFetchFacet, canViewPrices]
  );

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) return initialFilterVisibility;
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

  const exportConfig: DataTableExportConfig<MovementListItem> = useMemo(
    () => ({
      fetchAllData: () => getAllMovementsForExport(currentParams),
      options: { filename: 'movimientos', title: 'Movimientos de stock', sheetName: 'Movimientos' },
      formatters: {
        type: (value) => MOVEMENT_TYPE_LABELS[value as MovementKind] ?? String(value),
        occurred_on: (value) => (value ? moment.utc(value as string | Date).format('DD/MM/YYYY') : ''),
        destination_type: (value) =>
          value ? (DESTINATION_TYPE_LABELS[value as StockDestinationTypeValue] ?? String(value)) : '',
        reference: (value) => (value ? String(value) : ''),
        notes: (value) => (value ? String(value) : ''),
        status: (value) => REVERSAL_STATUS_LABELS[value as MovementReversalStatus] ?? String(value),
        created_at: (value) => (value ? moment(value as string | Date).format('DD/MM/YYYY HH:mm') : ''),
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
      queryKey={[...WAREHOUSE_QUERY_KEYS.movements]}
      onStateChange={handleStateChange}
      searchPlaceholder="Buscar por número o referencia"
      emptyMessage="No hay movimientos registrados"
      exportConfig={exportConfig}
      data-testid="warehouse-movements-table"
    />
  );
}
