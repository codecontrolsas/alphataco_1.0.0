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
import { DESTINATION_TYPE_LABELS, REQUEST_STATUS_LABELS } from '../../../../lib/labels';
import { WAREHOUSE_QUERY_KEYS } from '../../../../lib/query-keys';
import { MATERIAL_REQUEST_STATUSES, type MaterialRequestStatus } from '../../../../lib/request-state-machine';
import { STOCK_DESTINATION_TYPES, type StockDestinationTypeValue } from '../../../../schemas/stock-movement';
import { destinationTypeIcons } from '../../../../Movements/components/MovementsList/columns';
import {
  getAllRequestsForExport,
  getRequestSingleFacet,
  getRequestsPaginated,
  type RequestListItem,
} from '../actions.server';
import { requestStatusIcons } from '../../RequestStatusBadge';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from '../columns';

interface Props {
  data: RequestListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['status', 'destination_type', 'created_at'];

const EMPTY_FACET: FacetResult = { options: [], counts: new Map() };

export function _RequestsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);
  const handleStateChange = useCallback((params: DataTableSearchParams) => setCurrentParams(params), []);
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getRequestsPaginated(params), []);

  const columns = useMemo(() => getColumns(), []);

  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((c) => [c, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  /** FK con opciones del servidor; `icon` se aplica a todas (tipo de recurso). */
  const makeFkFetchFacet = useCallback(
    (columnId: string, icon?: typeof User) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getRequestSingleFacet(columnId, params);
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
        columnId: 'status',
        title: 'Estado',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getRequestSingleFacet('status', params);
          if (!result) return EMPTY_FACET;
          return {
            options: MATERIAL_REQUEST_STATUSES.map((value) => ({
              value,
              label: REQUEST_STATUS_LABELS[value],
              icon: requestStatusIcons[value],
            })),
            counts: result.counts,
          };
        },
      },
      {
        columnId: 'destination_type',
        title: 'Tipo de destino',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getRequestSingleFacet('destination_type', params);
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
      { columnId: 'created_at', title: 'Fecha', type: 'dateRange' as const },
      { columnId: 'requester', title: 'Solicitante', fetchFacet: makeFkFetchFacet('requester', User) },
      { columnId: 'decider', title: 'Decidió', fetchFacet: makeFkFetchFacet('decider', User) },
      { columnId: 'number', title: 'Número', type: 'text' as const, placeholder: 'Buscar por número...' },
      {
        columnId: 'destination',
        title: 'Destino',
        type: 'text' as const,
        placeholder: 'Legajo, apellido, dominio, interno, orden o cliente...',
      },
    ],
    [makeFkFetchFacet]
  );

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) return initialFilterVisibility;
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

  const exportConfig: DataTableExportConfig<RequestListItem> = useMemo(
    () => ({
      fetchAllData: () => getAllRequestsForExport(currentParams),
      options: { filename: 'pedidos-materiales', title: 'Pedidos de materiales', sheetName: 'Pedidos' },
      formatters: {
        status: (value) => REQUEST_STATUS_LABELS[value as MaterialRequestStatus] ?? String(value),
        destination_type: (value) =>
          value ? (DESTINATION_TYPE_LABELS[value as StockDestinationTypeValue] ?? String(value)) : '',
        created_at: (value) => (value ? moment(value as string | Date).format('DD/MM/YYYY') : ''),
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
      queryKey={[...WAREHOUSE_QUERY_KEYS.requests]}
      onStateChange={handleStateChange}
      searchPlaceholder="Buscar por número o notas"
      emptyMessage="No hay pedidos"
      exportConfig={exportConfig}
      data-testid="warehouse-requests-table"
    />
  );
}
