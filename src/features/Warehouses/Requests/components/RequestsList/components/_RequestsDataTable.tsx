'use client';

import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { EMPTY_FACET } from '@/shared/components/common/DataTable/facet-filters';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import {
  type DataTableExportConfig,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable/types';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { CircleOff, User } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { destinationTypeIcons } from '../../../../Movements/components/MovementsList/columns';
import { DESTINATION_TYPE_LABELS, REQUEST_STATUS_LABELS } from '../../../../lib/labels';
import { WAREHOUSE_QUERY_KEYS } from '../../../../lib/query-keys';
import { MATERIAL_REQUEST_STATUSES, type MaterialRequestStatus } from '../../../../lib/request-state-machine';
import { STOCK_DESTINATION_TYPES, type StockDestinationTypeValue } from '../../../../schemas/stock-movement';
import { requestStatusIcons } from '../../RequestStatusBadge';
import {
  getAllRequestsForExport,
  getRequestSingleFacet,
  getRequestsPaginated,
  type RequestListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from '../columns';

// El detalle solo se necesita al abrirlo: no entra en el bundle de la lista.
const RequestDetailSheet = dynamic(() => import('../../RequestDetailSheet').then((m) => m.RequestDetailSheet), {
  ssr: false,
});

interface Props {
  data: RequestListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  /** Banda de atencion resuelta en el servidor; se muestra sobre la tabla. */
  topSlot?: ReactNode;
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['status', 'destination_type', 'created_at'];

export function _RequestsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  topSlot,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);
  const handleStateChange = useCallback((params: DataTableSearchParams) => setCurrentParams(params), []);
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getRequestsPaginated(params), []);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const openDetail = useCallback((id: string) => {
    setDetailId(id);
    setDetailOpen(true);
  }, []);

  const columns = useMemo(() => getColumns({ onOpenDetail: openDetail }), [openDetail]);

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
      fetchAllData: async () => unwrapExportResult(await getAllRequestsForExport(currentParams)),
      options: { filename: 'pedidos-materiales', title: 'Pedidos de materiales', sheetName: 'Pedidos' },
      formatters: {
        status: (value) => REQUEST_STATUS_LABELS[value as MaterialRequestStatus] ?? String(value),
        destination_type: (value) =>
          value ? DESTINATION_TYPE_LABELS[value as StockDestinationTypeValue] ?? String(value) : '',
        created_at: (value) => (value ? formatArgentinaDay(value as string | Date) : ''),
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

      {detailId ? <RequestDetailSheet requestId={detailId} open={detailOpen} onOpenChange={setDetailOpen} /> : null}
    </div>
  );
}
