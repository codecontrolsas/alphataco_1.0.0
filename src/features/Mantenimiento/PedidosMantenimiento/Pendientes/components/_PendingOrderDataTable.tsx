'use client';

import { Dialog, DialogContent } from '@/components/ui/dialog';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { type DataTableExportConfig, type DataTableFacetedFilterConfig, type DataTableSearchParams, type FacetResult } from '@/shared/components/common/DataTable/types';
import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import moment from 'moment';
import dynamic from 'next/dynamic';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useCallback, useMemo, useState } from 'react';

import { ActivityHistoryModal } from '@/features/Mantenimiento/components/ActivityHistoryModal';
import { LEGACY_HISTORY_LABELS } from '@/features/Mantenimiento/lib/status-presentation';
import { getResourceInternNumber, getResourceLabel } from '../../../shared/maintenance-resource';
import { getMaintenanceOrderById, type MaintenanceOrderData } from '../../actions/actionsServer';
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
  STATUS_ICONS,
  getPendingOrderColumns,
} from '../columns';

// Los diálogos se abren a demanda: no pesan en la carga inicial de la tabla.
const PedidoDetailDialog = dynamic(() =>
  import('../../components/PedidoDetailDialog').then((m) => m.PedidoDetailDialog)
);
const PlanificarPedidoDialog = dynamic(() =>
  import('../../components/PlanificarPedidoDialog').then((m) => m.PlanificarPedidoDialog)
);
const RechazarPedidoDialog = dynamic(() => import('./RechazarPedidoDialog').then((m) => m.RechazarPedidoDialog));

const DEFAULT_VISIBLE_FILTERS = ['status', 'vehicle', 'source'];

interface Props {
  data: PendingOrderListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  /** Clave de las preferencias guardadas de la tabla (`-v2`). */
  tableId: string;
  /** Prefijo de los parámetros de la URL: el mismo que usan las tarjetas de métricas para filtrar. */
  paramNamespace: string;
  /** `pedidos_pendientes:update`, resuelto en el servidor: habilita Planificar y Rechazar. */
  canUpdate: boolean;
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
  paramNamespace,
  canUpdate,
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

  const columns = useMemo(() => getPendingOrderColumns(callbacks, { canUpdate }), [callbacks, canUpdate]);

  // ── Visibilidad inicial: lo que el usuario guardó manda sobre las ocultas por defecto ──
  const initialColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((col) => [col, false]));
    return { ...defaults, ...savedColumnVisibility };
  }, [savedColumnVisibility]);

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
        title: 'N° Orden',
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
        vehicle: (_val, row) => {
          const label = getResourceLabel(row);
          const internNumber = getResourceInternNumber(row);
          return internNumber ? `${label} (#${internNumber})` : label;
        },
        status: (val, row) => {
          const label = PENDING_STATUS_LABELS[val as string] || String(val);
          const dateRejected = row.status === 'pending_scheduling' && row.date_rejected_at != null;
          return dateRejected ? `${label} · ${LEGACY_HISTORY_LABELS.date_rejected}` : label;
        },
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
        paramNamespace={paramNamespace}
        tableId={tableId}
        mobileCards
        searchPlaceholder="Buscar por dominio, serie, N° interno o N° de orden…"
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
