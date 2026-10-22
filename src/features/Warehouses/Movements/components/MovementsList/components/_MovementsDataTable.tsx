'use client';

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
import { User } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState } from 'react';
import {
  ALL_MOVEMENT_TYPES,
  DESTINATION_TYPE_LABELS,
  MOVEMENT_TYPE_LABELS,
  type MovementKind,
} from '../../../../lib/labels';
import { WAREHOUSE_QUERY_KEYS } from '../../../../lib/query-keys';
import { MOVEMENT_TYPE_UI, REVERSAL_STATUS_UI } from '../../../../lib/status-presentation';
import { STOCK_DESTINATION_TYPES, type StockDestinationTypeValue } from '../../../../schemas/stock-movement';
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
  formatOccurredOn,
  getColumns,
} from '../columns';

// El detalle solo se necesita al abrirlo: no entra en el bundle de la lista.
const MovementDetailSheet = dynamic(() => import('../../MovementDetailSheet').then((m) => m.MovementDetailSheet), {
  ssr: false,
});

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

const facets = createFacetFilters(getMovementSingleFacet);

export function _MovementsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getMovementsPaginated(params), []);

  // El servidor decide por su cuenta: esto solo agrega la columna de costo si va a haber datos.
  const canViewPrices = permissionsMap['almacenes:movimientos:view_prices'] === true;
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const openDetail = useCallback((id: string) => {
    setDetailId(id);
    setDetailOpen(true);
  }, []);
  const columns = useMemo(() => getColumns({ canViewPrices, onOpenDetail: openDetail }), [canViewPrices, openDetail]);

  /** FK con opciones del servidor; `icon` se aplica a todas (tipo de recurso). */
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      facets.fixed(
        'type',
        'Tipo',
        ALL_MOVEMENT_TYPES.map((value) => ({
          value,
          label: MOVEMENT_TYPE_UI[value].label,
          icon: MOVEMENT_TYPE_UI[value].icon,
        }))
      ),
      { columnId: 'occurred_on', title: 'Fecha', type: 'dateRange' as const },
      facets.fixed(
        'status',
        'Estado',
        REVERSAL_STATUSES.map((value) => ({
          value,
          label: REVERSAL_STATUS_UI[value].label,
          icon: REVERSAL_STATUS_UI[value].icon,
        }))
      ),
      facets.lookup('warehouse', 'Depósito', undefined, { label: 'Sin asignar' }),
      facets.lookup('target_warehouse', 'Depósito destino', undefined, { label: 'Sin asignar' }),
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
      facets.lookup('created_by', 'Creado por', User, { label: 'Sin asignar' }),
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

  const exportConfig: DataTableExportConfig<MovementListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllMovementsForExport(currentParams)),
      options: { filename: 'movimientos', title: 'Movimientos de stock', sheetName: 'Movimientos' },
      formatters: {
        type: (value) => MOVEMENT_TYPE_LABELS[value as MovementKind] ?? String(value),
        occurred_on: (value) => (value ? formatOccurredOn(value as string | Date) : ''),
        destination_type: (value) =>
          value ? DESTINATION_TYPE_LABELS[value as StockDestinationTypeValue] ?? String(value) : '',
        reference: (value) => (value ? String(value) : ''),
        notes: (value) => (value ? String(value) : ''),
        status: (value) => REVERSAL_STATUS_LABELS[value as MovementReversalStatus] ?? String(value),
        created_at: (value) => (value ? formatArgentinaDateTime(value as string | Date) : ''),
      },
    }),
    [currentParams]
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        totalRows={totalRows}
        {...tableProps}
        queryFn={tableQueryFn}
        queryKey={[...WAREHOUSE_QUERY_KEYS.movements]}
        searchPlaceholder="Buscar por número o referencia"
        emptyMessage="No hay movimientos registrados"
        exportConfig={exportConfig}
        data-testid="warehouse-movements-table"
      />
      {detailId ? <MovementDetailSheet movementId={detailId} open={detailOpen} onOpenChange={setDetailOpen} /> : null}
    </>
  );
}
