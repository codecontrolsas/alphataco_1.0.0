'use client';

import { destinationTypeIcons } from '@/features/Warehouses/Movements/components/MovementsList/columns';
import { DESTINATION_TYPE_LABELS } from '@/features/Warehouses/lib/labels';
import { STOCK_DESTINATION_TYPES, type StockDestinationTypeValue } from '@/features/Warehouses/schemas/stock-movement';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { createFacetFilters } from '@/shared/components/common/DataTable/facet-filters';
import {
  type DataTableExportConfig,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
} from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { formatArgentinaDay, formatDateOnlyAr } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { User } from 'lucide-react';
import { useCallback, useMemo, type ReactNode } from 'react';
import { PURCHASES_QUERY_KEYS } from '../../../lib/query-keys';
import {
  PURCHASE_REQUEST_STATUSES,
  PURCHASE_REQUEST_STATUS_LABELS,
  type PurchaseRequestStatus,
} from '../../../lib/request-state-machine';
import { purchaseRequestStatusIcons } from '../../components/PurchaseRequestStatusBadge';
import {
  getAllPurchaseRequestsForExport,
  getPurchaseRequestSingleFacet,
  getPurchaseRequestsPaginated,
  type PurchaseRequestListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from '../columns';

interface Props {
  data: PurchaseRequestListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  /** Banda de atención resuelta en el servidor; se muestra sobre la tabla. */
  topSlot?: ReactNode;
  initialColumnVisibility?: Record<string, boolean>;
  /** Preferencia guardada de filtros visibles: esta tabla hoy no la aplica (ver REVISION-CODIGO.md). */
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['status', 'destination_type', 'created_at'];

const facets = createFacetFilters(getPurchaseRequestSingleFacet);

const STATUS_OPTIONS = PURCHASE_REQUEST_STATUSES.map((value) => ({
  value,
  label: PURCHASE_REQUEST_STATUS_LABELS[value],
  icon: purchaseRequestStatusIcons[value],
}));

const DESTINATION_OPTIONS = STOCK_DESTINATION_TYPES.map((value) => ({
  value,
  label: DESTINATION_TYPE_LABELS[value],
  icon: destinationTypeIcons[value],
}));

export function _RequestsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  topSlot,
  initialColumnVisibility,
}: Props) {
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getPurchaseRequestsPaginated(params), []);

  const columns = useMemo(() => getColumns(), []);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      facets.fixed('status', 'Estado', STATUS_OPTIONS),
      // El valor null del filtro es "sin destino": la solicitud repone stock.
      facets.fixed('destination_type', 'Tipo de destino', DESTINATION_OPTIONS, { label: 'Para stock' }),
      { columnId: 'created_at', title: 'Fecha', type: 'dateRange' as const },
      { columnId: 'needed_by', title: 'Se necesita para', type: 'dateRange' as const },
      facets.lookup('requester', 'Solicitante', User),
      { columnId: 'number', title: 'Número', type: 'text' as const, placeholder: 'Buscar por número...' },
      {
        columnId: 'destination',
        title: 'Destino',
        type: 'text' as const,
        placeholder: 'Legajo, apellido, dominio, interno, orden o cliente...',
      },
      {
        columnId: 'material_request',
        title: 'Pedido de origen',
        type: 'text' as const,
        placeholder: 'Número del pedido de materiales...',
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
  });

  const exportConfig: DataTableExportConfig<PurchaseRequestListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllPurchaseRequestsForExport(currentParams)),
      options: { filename: 'solicitudes-de-compra', title: 'Solicitudes de compra', sheetName: 'Solicitudes' },
      formatters: {
        status: (value) => PURCHASE_REQUEST_STATUS_LABELS[value as PurchaseRequestStatus] ?? String(value),
        destination_type: (value) =>
          value ? DESTINATION_TYPE_LABELS[value as StockDestinationTypeValue] ?? String(value) : 'Para stock',
        created_at: (value) => (value ? formatArgentinaDay(value as string | Date) : ''),
        // `needed_by` es @db.Date (medianoche UTC): se lee como fecha, no como instante.
        needed_by: (value) => (value ? formatDateOnlyAr(value as string | Date) : ''),
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
        queryKey={[...PURCHASES_QUERY_KEYS.requests]}
        searchPlaceholder="Buscar por número o notas"
        emptyMessage="No hay solicitudes de compra"
        exportConfig={exportConfig}
        data-testid="purchase-requests-table"
      />
    </div>
  );
}
