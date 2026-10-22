'use client';

import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { createFacetFilters } from '@/shared/components/common/DataTable/facet-filters';
import {
  type DataTableExportConfig,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
} from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { User } from 'lucide-react';
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

const facets = createFacetFilters(getRequestSingleFacet);

export function _RequestsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  topSlot,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getRequestsPaginated(params), []);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const openDetail = useCallback((id: string) => {
    setDetailId(id);
    setDetailOpen(true);
  }, []);

  const columns = useMemo(() => getColumns({ onOpenDetail: openDetail }), [openDetail]);

  /** FK con opciones del servidor; `icon` se aplica a todas (tipo de recurso). */
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      facets.fixed(
        'status',
        'Estado',
        MATERIAL_REQUEST_STATUSES.map((value) => ({
          value,
          label: REQUEST_STATUS_LABELS[value],
          icon: requestStatusIcons[value],
        }))
      ),
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
      { columnId: 'created_at', title: 'Fecha', type: 'dateRange' as const },
      facets.lookup('requester', 'Solicitante', User, { label: 'Sin asignar' }),
      facets.lookup('decider', 'Decidió', User, { label: 'Sin asignar' }),
      { columnId: 'number', title: 'Número', type: 'text' as const, placeholder: 'Buscar por número...' },
      {
        columnId: 'destination',
        title: 'Destino',
        type: 'text' as const,
        placeholder: 'Legajo, apellido, dominio, interno, orden o cliente...',
      },
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
        {...tableProps}
        queryFn={tableQueryFn}
        queryKey={[...WAREHOUSE_QUERY_KEYS.requests]}
        searchPlaceholder="Buscar por número o notas"
        emptyMessage="No hay pedidos"
        exportConfig={exportConfig}
        data-testid="warehouse-requests-table"
      />

      {detailId ? <RequestDetailSheet requestId={detailId} open={detailOpen} onOpenChange={setDetailOpen} /> : null}
    </div>
  );
}
