'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ActivityHistoryModal } from '@/features/Mantenimiento/components/ActivityHistoryModal';
import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableFilterOption,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useCallback, useMemo, useState } from 'react';
import {
  getEquipmentOrdersForExport,
  getEquipmentOrdersPaginated,
  getEquipmentOrdersSingleFacet,
  type EquipmentOrderRow,
} from '../../lib/actions/vehicle-operations-actions';
import {
  ORDER_STATUS_ICONS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_ORDER,
  getOrderStatusLabel,
} from '../../lib/order-status';
import { EquipmentOrderDetailDialog } from '../equipment-order-detail-dialog';
import { buildResolvedFacet, buildStaticFacet } from '../facet-helpers';
import { TableLoadError, useTrackedTableQuery } from '../table-load-state';
import { useTableViewDefaults } from '../use-table-view-defaults';
import { getEquipmentOrderColumns } from './columns';

const TABLE_ID = 'equipment-orders';

/** Prefijo de la `queryKey` de la tabla: no cambiar (invalidaciones por prefijo desde otras pantallas). */
const QUERY_KEY_BASE = ['equipment-maintenance-orders'] as const;

/** Tamaños de página: el servidor corta en 50, así que no se ofrece más. */
const PAGE_SIZE_OPTIONS = [10, 20, 30, 50];

const ORDER_FILTER_IDS = ['status', 'sector', 'order_number', 'workshop_entry_date', 'created_at'];
const DEFAULT_VISIBLE_FILTERS = ['status', 'sector', 'created_at'];

/** Opciones del filtro de estado: todas las conocidas con su rótulo e ícono, más cualquier valor desconocido que aparezca. */
const STATUS_CANDIDATES: DataTableFilterOption[] = ORDER_STATUS_ORDER.map((status) => ({
  value: status,
  label: ORDER_STATUS_LABELS[status],
  icon: ORDER_STATUS_ICONS[status],
}));

interface HistoryTarget {
  orderId: string;
  requestId: string | null;
}

interface EquipmentOrdersDataTableProps {
  equipmentId: string;
}

/**
 * Sub-tab "Órdenes de Mantenimiento": historial paginado en el servidor (50 filas como máximo por página).
 * El detalle completo de una orden (sectores, OTs, reparaciones) se pide recién al abrirla.
 */
export function _EquipmentOrdersDataTable({ equipmentId }: EquipmentOrdersDataTableProps) {
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>({});
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [historyTarget, setHistoryTarget] = useState<HistoryTarget | null>(null);

  const handleViewDetail = useCallback((order: EquipmentOrderRow) => setDetailOrderId(order.id), []);
  const handleViewHistory = useCallback(
    (order: EquipmentOrderRow) => setHistoryTarget({ orderId: order.id, requestId: order.maintenanceRequestId }),
    []
  );

  const columns = useMemo(
    () => getEquipmentOrderColumns({ onViewDetail: handleViewDetail, onViewHistory: handleViewHistory }),
    [handleViewDetail, handleViewHistory]
  );

  // ── Datos paginados en el servidor ───────────────────────────────────────

  const fetchPage = useCallback(
    (params: DataTableSearchParams) => getEquipmentOrdersPaginated(equipmentId, params),
    [equipmentId]
  );
  const { tableQueryFn, loadFailed, settled } = useTrackedTableQuery(fetchPage);
  const queryKey = useMemo(() => [...QUERY_KEY_BASE, equipmentId], [equipmentId]);

  // ── Facetas lazy-load ────────────────────────────────────────────────────

  const statusFacet = useCallback(
    async (params: DataTableSearchParams): Promise<FacetResult> => {
      const response = await getEquipmentOrdersSingleFacet(equipmentId, 'status', params);
      if (!response) return buildStaticFacet(null, 'status', params, []);

      // Un estado que el cliente no conoce se muestra con su valor crudo en vez de perderse del filtro.
      const unknown: DataTableFilterOption[] = [...response.counts.keys()]
        .filter((value) => !STATUS_CANDIDATES.some((option) => option.value === value) && value !== NULL_FILTER_VALUE)
        .map((value) => ({ value, label: getOrderStatusLabel(value) }));

      return buildStaticFacet(response, 'status', params, [...STATUS_CANDIDATES, ...unknown]);
    },
    [equipmentId]
  );

  const sectorFacet = useCallback(
    async (params: DataTableSearchParams): Promise<FacetResult> =>
      buildResolvedFacet(await getEquipmentOrdersSingleFacet(equipmentId, 'sector', params), 'Sin asignar'),
    [equipmentId]
  );

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      { columnId: 'status', title: 'Estado', fetchFacet: statusFacet },
      { columnId: 'sector', title: 'Sectores', fetchFacet: sectorFacet },
      { columnId: 'order_number', title: 'N° Orden', type: 'text', placeholder: 'Buscar por N° de orden...' },
      { columnId: 'workshop_entry_date', title: 'Ingreso', type: 'dateRange' },
      { columnId: 'created_at', title: 'Creada', type: 'dateRange' },
    ],
    [statusFacet, sectorFacet]
  );

  // ── Export a Excel ───────────────────────────────────────────────────────

  const exportConfig = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getEquipmentOrdersForExport(equipmentId, currentParams)),
      options: {
        filename: 'ordenes-mantenimiento-equipo',
        sheetName: 'Órdenes de Mantenimiento',
        title: 'Historial de Órdenes de Mantenimiento',
      },
      formatters: {
        status: (value: unknown) => getOrderStatusLabel(typeof value === 'string' ? value : null),
        workshop_entry_date: (value: unknown) => (value ? formatArgentinaDay(value as Date) : ''),
        created_at: (value: unknown) => (value ? formatArgentinaDay(value as Date) : ''),
      },
    }),
    [equipmentId, currentParams]
  );

  const viewDefaults = useTableViewDefaults(TABLE_ID, {
    hiddenColumns: [],
    visibleFilters: DEFAULT_VISIBLE_FILTERS,
    filterIds: ORDER_FILTER_IDS,
  });

  if (!viewDefaults.ready) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider delayDuration={100}>
      <Card>
        <CardContent className="pt-6">
          {loadFailed && <TableLoadError queryKey={queryKey} label="las órdenes de mantenimiento" />}

          <DataTable
            columns={columns}
            data={[]}
            totalRows={0}
            queryFn={tableQueryFn}
            queryKey={queryKey}
            queryStaleTimeMs={10 * 1000}
            onStateChange={setCurrentParams}
            facetedFilters={facetedFilters}
            exportConfig={exportConfig}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            initialColumnVisibility={viewDefaults.initialColumnVisibility}
            initialFilterVisibility={viewDefaults.initialFilterVisibility}
            tableId={TABLE_ID}
            paramNamespace={TABLE_ID}
            searchPlaceholder="Buscar por N° de orden..."
            showSearch
            showFilterToggle
            emptyMessage={settled ? 'No hay órdenes de mantenimiento para este equipo.' : 'Cargando órdenes...'}
            data-testid="equipment-orders-table"
          />
        </CardContent>
      </Card>

      <EquipmentOrderDetailDialog
        equipmentId={equipmentId}
        orderId={detailOrderId}
        onClose={() => setDetailOrderId(null)}
        onViewHistory={(target) => {
          setDetailOrderId(null);
          setHistoryTarget(target);
        }}
      />

      <ActivityHistoryModal
        open={!!historyTarget}
        onClose={() => setHistoryTarget(null)}
        maintenanceOrderId={historyTarget?.orderId}
        maintenanceRequestId={historyTarget?.requestId ?? undefined}
        title="Historial Completo"
      />
    </TooltipProvider>
  );
}
