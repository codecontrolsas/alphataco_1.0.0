'use client';

import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  DataTable,
  type DataTableExportConfig,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { Clock, HourglassIcon, Loader2 } from 'lucide-react';
import moment from 'moment';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useCallback, useMemo, useState } from 'react';

import { ActivityHistoryModal } from '@/features/Mantenimiento/components/ActivityHistoryModal';
import { getMaintenanceOrderById, type MaintenanceOrderData } from '../../actions/actionsServer';
import { PedidoDetailDialog } from '../../components/PedidoDetailDialog';
import { PlanificarPedidoDialog } from '../../components/PlanificarPedidoDialog';
import {
  getAllPendingOrdersForExport,
  getPendingOrdersPaginated,
  getPendingOrdersSingleFacet,
  type PendingOrderListItem,
} from '../actions.server';
import {
  HIDDEN_COLUMNS_BY_DEFAULT,
  PENDING_STATUS_LABELS,
  SOURCE_ICONS,
  SOURCE_LABELS,
  getPendingOrderColumns,
} from '../columns';
import { RechazarPedidoDialog } from './RechazarPedidoDialog';

// ── Íconos de estado para filtros ─────────────────────────────────────────────
const STATUS_ICONS: Record<string, LucideIcon> = {
  pending_scheduling: HourglassIcon,
  scheduled: Clock,
};

const DEFAULT_VISIBLE_FILTERS = ['status', 'vehicle', 'source'];

interface Props {
  data: PendingOrderListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

// ============================================================================
// HELPERS — builders para reducir boilerplate en fetchFacet
// ============================================================================

/** Construye FacetResult para enums: opciones estáticas + counts del servidor */
function buildEnumFacetResult(
  labels: Record<string, string>,
  icons: Record<string, React.ComponentType<{ className?: string }> | undefined>,
  counts: Map<string, number>
): FacetResult {
  return {
    options: Object.entries(labels).map(([value, label]) => ({
      value,
      label,
      icon: icons[value] as LucideIcon | undefined,
    })),
    counts,
  };
}

/** Construye FacetResult para FK: opciones resueltas del servidor + counts */
function buildFkFacetResult(
  resolvedOptions: Array<{ id: string; name: string | null }> | undefined,
  counts: Map<string, number>
): FacetResult {
  return {
    options: resolvedOptions?.map((o) => ({ value: o.id, label: o.name ?? '' })) ?? [],
    counts,
  };
}

export function _PendingOrderDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility: savedColumnVisibility,
  initialFilterVisibility,
}: Props) {
  // ── Estado de diálogos ────────────────────────────────────────────────────
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [dialogType, setDialogType] = useState<'view' | 'schedule' | null>(null);
  const [historyOrder, setHistoryOrder] = useState<PendingOrderListItem | null>(null);
  // Ticket 676: rechazo del taller. Se resuelve con la fila del listado (no
  // necesita el detalle completo del pedido), asi que no pasa por la query de detalle.
  const [rejectOrder, setRejectOrder] = useState<PendingOrderListItem | null>(null);

  // ── Query para cargar detalles completos al abrir diálogo ─────────────────
  const { data: selectedOrderDetail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['maintenance-order-detail', selectedOrderId],
    queryFn: () => (selectedOrderId ? getMaintenanceOrderById(selectedOrderId) : null),
    enabled: !!selectedOrderId,
    staleTime: 0,
  });

  const isWaitingForDetail = !!selectedOrderId && !!dialogType && isLoadingDetail;

  // ── Client-side navigation: estado reactivo para queries dependientes (export) ────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  // queryFn para fetch client-side de datos de tabla (sin router.push, sin re-render de toda la página)
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getPendingOrdersPaginated(params), []);

  // ── Columnas ──────────────────────────────────────────────────────────────
  const callbacks = useMemo(
    () => ({
      onView: (order: PendingOrderListItem) => {
        setSelectedOrderId(order.id);
        setDialogType('view');
      },
      onSchedule: (order: PendingOrderListItem) => {
        setSelectedOrderId(order.id);
        setDialogType('schedule');
      },
      onViewHistory: (order: PendingOrderListItem) => {
        setHistoryOrder(order);
      },
      onReject: (order: PendingOrderListItem) => {
        setRejectOrder(order);
      },
    }),
    []
  );

  const columns = useMemo(() => getPendingOrderColumns(callbacks), [callbacks]);

  // ── Visibilidad inicial ───────────────────────────────────────────────────
  const defaultColumnVisibility = useMemo(
    () => Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((col) => [col, false])),
    []
  );
  const initialColumnVisibility =
    savedColumnVisibility && Object.keys(savedColumnVisibility).length > 0
      ? savedColumnVisibility
      : defaultColumnVisibility;

  // ── fetchFacet factories: cada filtro carga sus opciones+counts bajo demanda ──────

  const makeEnumFetchFacet = useCallback(
    (
      columnId: string,
      labels: Record<string, string>,
      icons: Record<string, React.ComponentType<{ className?: string }> | undefined>
    ) => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getPendingOrdersSingleFacet(columnId, params);
        if (!result) return { options: [], counts: new Map() };
        return buildEnumFacetResult(labels, icons, result.counts);
      };
    },
    []
  );

  const makeFkFetchFacet = useCallback((columnId: string) => {
    return async (params: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getPendingOrdersSingleFacet(columnId, params);
      if (!result) return { options: [], counts: new Map() };
      return buildFkFacetResult(result.resolvedOptions, result.counts);
    };
  }, []);

  // ── Filtros facetados (lazy-load — cada uno se carga al abrir su popover) ─
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      {
        columnId: 'status',
        title: 'Estado',
        fetchFacet: makeEnumFetchFacet('status', PENDING_STATUS_LABELS, STATUS_ICONS),
      },
      {
        columnId: 'vehicle',
        title: 'Equipo',
        fetchFacet: makeFkFetchFacet('vehicle'),
      },
      {
        columnId: 'source',
        title: 'Origen',
        fetchFacet: makeEnumFetchFacet('source', SOURCE_LABELS, SOURCE_ICONS),
      },
      {
        columnId: 'order_number',
        title: 'Nro. Pedido',
        type: 'text' as const,
      },
      {
        columnId: 'description',
        title: 'Descripción',
        type: 'text' as const,
      },
      {
        columnId: 'created_at',
        title: 'Fecha Aprobación',
        type: 'dateRange' as const,
      },
      {
        columnId: 'scheduled_date',
        title: 'Fecha Planificada',
        type: 'dateRange' as const,
      },
    ],
    [makeEnumFetchFacet, makeFkFetchFacet]
  );

  // ── Visibilidad de filtros por defecto ────────────────────────────────────
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

  // ── Exportación a Excel ───────────────────────────────────────────────────
  const exportConfig: DataTableExportConfig<PendingOrderListItem> = useMemo(
    () => ({
      // Usa currentParams (estado reactivo del client-side mode), NO searchParams (prop inicial de SSR),
      // para que la exportación respete los filtros activos en el momento del click.
      fetchAllData: async () => unwrapExportResult(await getAllPendingOrdersForExport(currentParams)),
      options: {
        filename: 'pedidos-pendientes',
        title: 'Pedidos Pendientes de Mantenimiento',
        sheetName: 'Pendientes',
      },
      formatters: {
        status: (val) => PENDING_STATUS_LABELS[val as string] || String(val),
        source: (val) => SOURCE_LABELS[val as string] || String(val ?? ''),
        order_number: (val) => String(val ?? ''),
        description: (val) => String(val ?? ''),
        created_at: (val) => (val ? formatArgentinaDateTime(val as string) : ''),
        scheduled_date: (val) => (val ? moment.utc(val as string).format('DD/MM/YYYY') : ''),
        items: (val) => (val != null ? String(val) : ''),
      },
    }),
    [currentParams]
  );

  // ── Handlers de cierre ────────────────────────────────────────────────────
  const handleCloseDialog = () => {
    setSelectedOrderId(null);
    setDialogType(null);
  };

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        totalRows={totalRows}
        searchParams={searchParams}
        paramNamespace={tableId}
        tableId={tableId}
        searchPlaceholder="Buscar por equipo (dominio, serie) o nro. pedido..."
        facetedFilters={facetedFilters}
        exportConfig={exportConfig}
        showFilterToggle={true}
        emptyMessage="No hay pedidos pendientes"
        initialColumnVisibility={initialColumnVisibility}
        initialFilterVisibility={mergedFilterVisibility}
        data-testid="pedidos-pendientes-table"
        // Client-side navigation: fetch instantáneo vía React Query, sin router.push.
        // El primer elemento de queryKey ('maintenance-orders') coincide con el que
        // invalida `invalidateAllMaintenanceQueries` — así las acciones de fila
        // (rechazar, planificar) refrescan esta tabla tras su mutación.
        queryFn={tableQueryFn}
        queryKey={['maintenance-orders', 'pending-paginated']}
        onStateChange={handleStateChange}
      />

      {/* Loading mientras se cargan datos del pedido */}
      <Dialog open={isWaitingForDetail} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-xs max-h-[90vh] overflow-y-auto" showCloseButton={false}>
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {dialogType === 'schedule' ? 'Cargando datos de planificación...' : 'Cargando detalle del pedido...'}
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo de detalle */}
      {selectedOrderDetail && dialogType === 'view' && (
        <PedidoDetailDialog
          order={selectedOrderDetail as MaintenanceOrderData}
          open={true}
          onClose={handleCloseDialog}
        />
      )}

      {/* Diálogo de planificación */}
      {selectedOrderDetail && dialogType === 'schedule' && (
        <PlanificarPedidoDialog
          order={selectedOrderDetail as MaintenanceOrderData}
          open={true}
          onClose={handleCloseDialog}
        />
      )}

      {/* Diálogo de rechazo (ticket 676) */}
      {rejectOrder && <RechazarPedidoDialog order={rejectOrder} open={true} onClose={() => setRejectOrder(null)} />}

      {/* Modal de historial de actividad */}
      <ActivityHistoryModal
        open={!!historyOrder}
        onClose={() => setHistoryOrder(null)}
        maintenanceOrderId={historyOrder?.id}
        maintenanceRequestId={historyOrder?.maintenance_requests?.id}
        title="Historial del Pedido"
      />
    </>
  );
}
