'use client';

import { Card, CardContent } from '@/components/ui/card';
import { getOrderForManagement, type ExternalWorkshop, type OrderManagementItem, type WorkshopSector } from '@/features/Mantenimiento/OrderManagement/actions/queries.server';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { type DataTableFacetedFilterConfig, type DataTableSearchParams, type FacetResult } from '@/shared/components/common/DataTable/types';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { CircleOff, Truck, type LucideIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ORDER_STATUS_FILTER_ORDER, ORDER_STATUS_UI } from '../../../lib/status-presentation';
import { InWorkshopActionsProvider } from '../../components/InWorkshopActionsContext';
import { RequestedItemsDialog } from '../../components/RequestedItemsDialog';
import {
  getMaintenanceOrdersPaginated,
  getMaintenanceOrdersSingleFacet,
  type MaintenanceOrderListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getMaintenanceOrdersColumns, statusLabels } from '../columns';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { _ExportTasksButton } from './_ExportTasksButton';

// El detalle y el wizard pesan (990 líneas y el flujo de gestión) y se abren a demanda: su chunk se pide
// la primera vez que se usan, no al cargar la tabla.
const OrderDetailDialog = dynamic(() => import('../../components/OrderDetailDialog').then((m) => m.OrderDetailDialog), {
  ssr: false,
});
const ManageOrderWizard = dynamic(
  () => import('@/features/Mantenimiento/OrderManagement/components/ManageOrderWizard').then((m) => m.ManageOrderWizard),
  { ssr: false }
);

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  data: MaintenanceOrderListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  /** Clave de las preferencias de columnas y filtros (con sufijo de versión). */
  tableId: string;
  /** Prefijo de los params de la URL: no cambia aunque cambie `tableId`. */
  paramNamespace: string;
  /** Banda y tarjetas de atención, resueltas en el servidor; se muestran sobre la tabla. */
  topSlot?: ReactNode;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
  // Data for ManageOrderWizard (passed as serializable props from server)
  sectors: WorkshopSector[];
  repairTypes: Array<{ id: string; name: string }>;
  externalWorkshops: ExternalWorkshop[];
}

// ============================================================================
// DEFAULT VISIBLE FILTERS
// ============================================================================

const DEFAULT_VISIBLE_FILTER_IDS = ['status', 'vehicle', 'workshop_entry_date'];

// ============================================================================
// STATUS ICONS
// ============================================================================

const statusIcons: Record<string, LucideIcon> = Object.fromEntries(
  Object.entries(ORDER_STATUS_UI).map(([status, ui]) => [status, ui.icon])
);

// ============================================================================
// HELPERS — builders para FacetResult (lazy-load, ver DOCS.md "Lazy-Load Facets")
// ============================================================================

/** Construye FacetResult para enums: opciones estáticas + counts del servidor */
function buildEnumFacetResult(
  enumValues: string[],
  labels: Record<string, string>,
  icons: Record<string, LucideIcon | undefined>,
  counts: Map<string, number>,
  nullLabel = 'Sin asignar'
): FacetResult {
  return {
    options: [
      ...enumValues.map((value) => ({ value, label: labels[value] ?? value, icon: icons[value] })),
      ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: nullLabel, icon: CircleOff }] : []),
    ],
    counts,
  };
}

/** Construye FacetResult para FK: opciones resueltas del servidor + counts */
function buildFkFacetResult(
  resolvedOptions: Array<{ id: string; name: string | null }> | undefined,
  counts: Map<string, number>,
  nullLabel = 'Sin asignar',
  icon?: LucideIcon
): FacetResult {
  return {
    options: [
      ...(resolvedOptions?.map((o) => ({ value: o.id, label: o.name ?? '', icon })) ?? []),
      ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: nullLabel, icon: CircleOff }] : []),
    ],
    counts,
  };
}

// ============================================================================
// CLIENT COMPONENT
// ============================================================================

export function _MaintenanceOrderDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  paramNamespace,
  topSlot,
  initialColumnVisibility,
  initialFilterVisibility,
  sectors,
  repairTypes,
  externalWorkshops,
}: Props) {
  const { hasPermission } = usePermissions();
  const canManageOrders = hasPermission('mantenimiento', 'gestion_ordenes', 'update');
  const [selectedOrder, setSelectedOrder] = useState<MaintenanceOrderListItem | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailMounted, setDetailMounted] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // ─── Manage Order Wizard state ──────────────────────────────────────────
  const [manageOrder, setManageOrder] = useState<OrderManagementItem | null>(null);
  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  // Se monta la primera vez que se abre (el chunk del wizard no se pide antes) y queda montado
  const [manageMounted, setManageMounted] = useState(false);
  const [loadingManageOrder, setLoadingManageOrder] = useState(false);

  // ─── Requested Items dialog state ───────────────────────────────────────
  const [itemsOrder, setItemsOrder] = useState<MaintenanceOrderListItem | null>(null);
  const [itemsDialogOpen, setItemsDialogOpen] = useState(false);

  const handleViewItems = (order: MaintenanceOrderListItem) => {
    setItemsOrder(order);
    setItemsDialogOpen(true);
  };

  const handleCloseItems = () => {
    setItemsDialogOpen(false);
    setItemsOrder(null);
  };

  // Las tarjetas y la banda viven fuera de la tabla pero abren este wizard: lo reciben por contexto.
  const handleManageOrder = useCallback(async (orderId: string) => {
    setLoadingManageOrder(true);
    try {
      const detailedOrder = await getOrderForManagement(orderId);
      setManageOrder(detailedOrder);
      setManageMounted(true);
      setManageDialogOpen(true);
    } catch {
      toast.error('Error al cargar los datos de gestión');
    } finally {
      setLoadingManageOrder(false);
    }
  }, []);

  // Desde el panel de detalle: se cierra el panel y se abre el wizard (misma permission que el botón de la fila).
  const handleManageFromDetail = (orderId: string) => {
    setDetailDialogOpen(false);
    setSelectedOrder(null);
    void handleManageOrder(orderId);
  };

  const handleCloseManage = () => {
    setManageDialogOpen(false);
    setManageOrder(null);
  };

  // ─── Detail Dialog Handlers ─────────────────────────────────────────────
  const handleViewDetail = (order: MaintenanceOrderListItem) => {
    setLoadingDetail(true);
    setSelectedOrder(order);
    setDetailMounted(true);
    setDetailDialogOpen(true);
  };

  const handleCloseDetail = () => {
    setDetailDialogOpen(false);
    setSelectedOrder(null);
  };

  // ─── Client-side navigation: estado reactivo para queries dependientes (export) ────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  // queryFn para fetch client-side de datos de tabla (sin router.push, sin re-render de la página)
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getMaintenanceOrdersPaginated(params), []);

  // ─── Columnas ─────────────────────────────────────────────────────────────
  const columns = useMemo(
    () =>
      getMaintenanceOrdersColumns({
        onViewDetail: handleViewDetail,
        onManageOrder: (order) => handleManageOrder(order.id),
        onViewItems: handleViewItems,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ─── Column visibility ────────────────────────────────────────────────────
  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((col) => [col, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  // ─── fetchFacet factories: cada filtro carga sus opciones+counts bajo demanda ──────

  const makeEnumFetchFacet = useCallback(
    (
      columnId: string,
      enumValues: string[],
      labels: Record<string, string>,
      icons: Record<string, LucideIcon | undefined>,
      nullLabel = 'Sin asignar'
    ) => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getMaintenanceOrdersSingleFacet(columnId, params);
        if (!result) return { options: [], counts: new Map() };
        return buildEnumFacetResult(enumValues, labels, icons, result.counts, nullLabel);
      };
    },
    []
  );

  const makeFkFetchFacet = useCallback((columnId: string, nullLabel = 'Sin asignar', icon?: LucideIcon) => {
    return async (params: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getMaintenanceOrdersSingleFacet(columnId, params);
      if (!result) return { options: [], counts: new Map() };
      return buildFkFacetResult(result.resolvedOptions, result.counts, nullLabel, icon);
    };
  }, []);

  // ─── Filtros facetados (lazy-load — cada uno se carga al abrir su popover) ────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      // Estado (enum status)
      {
        columnId: 'status',
        title: 'Estado',
        fetchFacet: makeEnumFetchFacet('status', [...ORDER_STATUS_FILTER_ORDER], statusLabels, statusIcons, 'Sin estado'),
      },

      // Equipo (FK UUID → vehicles)
      {
        columnId: 'vehicle',
        title: 'Equipo',
        fetchFacet: makeFkFetchFacet('vehicle', 'Sin equipo', Truck),
      },

      // Sector actual (calculado — ticket 675: Fabricio pidió poder filtrar
      // "cuántas órdenes tiene ahora mismo tal sector", no solo verlo en la columna)
      {
        columnId: 'currentSector',
        title: 'Sector Actual',
        fetchFacet: makeFkFetchFacet('currentSector'),
      },

      // Fecha ingreso a taller (dateRange)
      {
        columnId: 'workshop_entry_date',
        title: 'Ingreso a Taller',
        type: 'dateRange' as const,
      },

      // Fecha creación (dateRange) — oculto por defecto
      {
        columnId: 'created_at',
        title: 'Fecha Creación',
        type: 'dateRange' as const,
      },

      // Dominio (texto libre en vehicles)
      {
        columnId: 'domain',
        title: 'Dominio',
        type: 'text' as const,
        placeholder: 'Buscar por dominio...',
      },

      // Serie (texto libre en vehicles)
      {
        columnId: 'serie',
        title: 'Serie',
        type: 'text' as const,
        placeholder: 'Buscar por serie...',
      },

      // Número interno (texto libre en vehicles)
      {
        columnId: 'intern_number',
        title: 'N° Interno',
        type: 'text' as const,
        placeholder: 'Buscar por número interno...',
      },

      // N° Orden (texto libre)
      {
        columnId: 'order_number',
        title: 'N° Orden',
        type: 'text' as const,
        placeholder: 'Buscar por N° orden...',
      },

      // Descripción del pedido (texto libre)
      {
        columnId: 'description',
        title: 'Descripción',
        type: 'text' as const,
        placeholder: 'Buscar por descripción...',
      },
    ],
    [makeEnumFetchFacet, makeFkFetchFacet]
  );

  // ─── Filter visibility ────────────────────────────────────────────────────
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTER_IDS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

  const actions = useMemo(
    () => ({ manageOrder: handleManageOrder, isManageLoading: loadingManageOrder }),
    [handleManageOrder, loadingManageOrder]
  );

  return (
    <InWorkshopActionsProvider value={actions}>
      <div className="space-y-4">
        {topSlot}

        <Card>
          <CardContent className="pt-6">
            <DataTable
              columns={columns}
              data={data}
              totalRows={totalRows}
              searchParams={searchParams}
              paramNamespace={paramNamespace}
              tableId={tableId}
              facetedFilters={facetedFilters}
              // Botón de export a nivel de tarea (ticket 682) reemplaza al export estándar del DataTable —
              // usa currentParams para reflejar los filtros activos en modo client-side.
              toolbarActions={<_ExportTasksButton searchParams={currentParams} />}
              initialColumnVisibility={mergedColumnVisibility}
              initialFilterVisibility={mergedFilterVisibility}
              searchPlaceholder="Buscar por N° orden..."
              emptyMessage="No hay órdenes de mantenimiento"
              showFilterToggle={true}
              mobileCards
              // Client-side navigation: fetch instantáneo vía React Query, sin router.push
              queryFn={tableQueryFn}
              queryKey={['maintenance-orders-paginated']}
              onStateChange={handleStateChange}
            />
          </CardContent>
        </Card>
      </div>

      {/* Overlay de carga del detalle */}
      {loadingDetail && (
        <div className="bg-background/50 fixed inset-0 z-50 flex items-center justify-center" role="status" aria-live="polite">
          <div className="bg-card flex items-center gap-3 rounded-lg p-4 shadow-lg">
            <div className="border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" aria-hidden="true" />
            <span className="text-sm">Cargando detalle de orden...</span>
          </div>
        </div>
      )}

      {/* Detalle de la orden (mismas props: el panel lateral lo resuelve el propio componente) */}
      {detailMounted && (
        <OrderDetailDialog
          orderId={selectedOrder?.id}
          open={detailDialogOpen}
          onClose={handleCloseDetail}
          onLoaded={() => setLoadingDetail(false)}
          context="workshop"
          onManage={canManageOrders ? handleManageFromDetail : undefined}
        />
      )}

      {/* Dialog con la lista de items solicitados */}
      <RequestedItemsDialog order={itemsOrder} open={itemsDialogOpen} onClose={handleCloseItems} />

      {/* Overlay de carga de los datos de gestión */}
      {loadingManageOrder && (
        <div className="bg-background/50 fixed inset-0 z-50 flex items-center justify-center" role="status" aria-live="polite">
          <div className="bg-card flex items-center gap-3 rounded-lg p-4 shadow-lg">
            <div className="border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" aria-hidden="true" />
            <span className="text-sm">Cargando datos de gestión...</span>
          </div>
        </div>
      )}

      {/* Wizard de gestión de órdenes */}
      {manageMounted && (
        <ManageOrderWizard
          order={manageOrder}
          open={manageDialogOpen}
          onClose={handleCloseManage}
          sectors={sectors}
          repairTypes={repairTypes}
          externalWorkshops={externalWorkshops}
        />
      )}
    </InWorkshopActionsProvider>
  );
}
