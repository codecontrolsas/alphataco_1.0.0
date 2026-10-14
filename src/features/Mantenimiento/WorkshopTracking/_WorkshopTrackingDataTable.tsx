'use client';

import { ActivityHistoryModal } from '@/features/Mantenimiento/components/ActivityHistoryModal';
import { DataTable } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type {
  DataTableFacetedFilterConfig,
  DataTableFilterOption,
  DataTableSearchParams,
  FacetResult,
} from '@/shared/components/common/DataTable/types';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { conditionLabels } from '@/shared/utils/mappers';
import { CircleOff } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { OrderDetailDialog } from '../MaintenanceOrders/components/OrderDetailDialog';
import {
  getAllWorkshopTrackingForExport,
  getWorkshopTrackingPaginated,
  getWorkshopTrackingSingleFacet,
  type WorkshopTrackingListItem,
} from './actions.server';
import {
  HIDDEN_COLUMNS_BY_DEFAULT,
  WORKSHOP_STATUS_ICONS,
  WORKSHOP_STATUS_LABELS,
  getWorkshopTrackingColumns,
  getWorkshopTrackingExportFormatters,
} from './workshopTrackingColumns';

// ============================================================================
// CONSTANTS
// ============================================================================

const TABLE_ID = 'workshop-tracking';

const DEFAULT_VISIBLE_FILTERS = ['status', 'vehicle', 'workshop_entry_date'];

// ============================================================================
// PROPS
// ============================================================================

interface WorkshopTrackingDataTableProps {
  data: WorkshopTrackingListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function _WorkshopTrackingDataTable({
  data,
  totalRows,
  searchParams,
  initialColumnVisibility,
  initialFilterVisibility,
}: WorkshopTrackingDataTableProps) {
  // ── Dialog state ──────────────────────────────────────────────────────────
  const [selectedOrder, setSelectedOrder] = useState<WorkshopTrackingListItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [historyOrder, setHistoryOrder] = useState<WorkshopTrackingListItem | null>(null);

  const handleViewDetail = (order: WorkshopTrackingListItem) => {
    setLoadingDetail(true);
    setSelectedOrder(order);
    setDialogOpen(true);
  };

  const handleViewHistory = (order: WorkshopTrackingListItem) => {
    setHistoryOrder(order);
  };

  const handleCloseHistory = () => {
    setHistoryOrder(null);
  };

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns = useMemo(
    () => getWorkshopTrackingColumns({ onViewDetail: handleViewDetail, onViewHistory: handleViewHistory }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ── Client-side navigation: estado reactivo para queries dependientes (export) ──
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  // queryFn para fetch client-side de datos de tabla (sin router.push, sin re-render de toda la página)
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getWorkshopTrackingPaginated(params), []);

  // ── fetchFacet: cada filtro carga sus opciones+counts bajo demanda (lazy-load) ──

  const statusFetchFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getWorkshopTrackingSingleFacet('status', params);
    if (!result) return { options: [], counts: new Map() };
    // Solo se muestran los estados que tienen registros en el universo filtrado
    // actual (mismo comportamiento que el patrón bulk anterior).
    const options: DataTableFilterOption[] = Object.keys(WORKSHOP_STATUS_LABELS)
      .filter((value) => result.counts.size === 0 || result.counts.has(value))
      .map((value) => ({ value, label: WORKSHOP_STATUS_LABELS[value], icon: WORKSHOP_STATUS_ICONS[value] }));
    return { options, counts: result.counts };
  }, []);

  const vehicleFetchFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getWorkshopTrackingSingleFacet('vehicle', params);
    if (!result) return { options: [], counts: new Map() };
    const options: DataTableFilterOption[] = (result.resolvedOptions ?? []).map((v) => ({
      value: v.id,
      label: v.name ?? '',
    }));
    if (result.counts.has(NULL_FILTER_VALUE)) {
      options.push({ value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff });
    }
    return { options, counts: result.counts };
  }, []);

  const conditionFetchFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getWorkshopTrackingSingleFacet('condition', params);
    if (!result) return { options: [], counts: new Map() };
    const options: DataTableFilterOption[] = [];
    for (const value of result.counts.keys()) {
      if (value === NULL_FILTER_VALUE) continue;
      options.push({ value, label: conditionLabels[value] ?? value });
    }
    if (result.counts.has(NULL_FILTER_VALUE)) {
      options.push({ value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff });
    }
    return { options, counts: result.counts };
  }, []);

  // ── Faceted Filters ────────────────────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      {
        columnId: 'status',
        title: 'Estado',
        fetchFacet: statusFetchFacet,
      },
      {
        columnId: 'vehicle',
        title: 'Equipo',
        fetchFacet: vehicleFetchFacet,
      },
      {
        columnId: 'condition',
        title: 'Condición Actual',
        fetchFacet: conditionFetchFacet,
      },
      {
        columnId: 'workshop_entry_date',
        title: 'Fecha Ingreso',
        type: 'dateRange' as const,
      },
      {
        columnId: 'scheduled_date',
        title: 'Fecha Planificada',
        type: 'dateRange' as const,
      },
      {
        columnId: 'created_at',
        title: 'Fecha Creación',
        type: 'dateRange' as const,
      },
      {
        columnId: 'order_number',
        title: 'N° Orden',
        type: 'text' as const,
      },
      {
        columnId: 'domain',
        title: 'Dominio',
        type: 'text' as const,
      },
      {
        columnId: 'serie',
        title: 'Serie',
        type: 'text' as const,
      },
      {
        columnId: 'intern_number',
        title: 'N° Interno',
        type: 'text' as const,
      },
      {
        columnId: 'kilometer',
        title: 'Km Actual',
        type: 'text' as const,
      },
      {
        columnId: 'description',
        title: 'Descripción',
        type: 'text' as const,
      },
    ],
    [statusFetchFacet, vehicleFetchFacet, conditionFetchFacet]
  );

  // ── Filter visibility ─────────────────────────────────────────────────────
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

  // ── Export config ─────────────────────────────────────────────────────────
  const exportFormatters = useMemo(() => getWorkshopTrackingExportFormatters(), []);

  const exportConfig = useMemo(
    () => ({
      options: {
        filename: 'seguimiento-taller',
        sheetName: 'Seguimiento Taller',
      },
      // Usa currentParams (estado reactivo del client-side mode), NO la prop searchParams
      // (solo el valor inicial de SSR), para que la exportación respete los filtros activos.
      fetchAllData: async () => unwrapExportResult(await getAllWorkshopTrackingForExport(currentParams)),
      formatters: exportFormatters,
    }),
    [currentParams, exportFormatters]
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        totalRows={totalRows}
        searchParams={searchParams}
        tableId={TABLE_ID}
        paramNamespace={TABLE_ID}
        searchPlaceholder="Buscar por equipo (dominio, serie, N° interno) o N° de orden..."
        emptyMessage="No hay órdenes de mantenimiento en taller"
        showFilterToggle={true}
        facetedFilters={facetedFilters}
        exportConfig={exportConfig}
        initialColumnVisibility={{
          ...Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((c) => [c, false])),
          ...(initialColumnVisibility ?? {}),
        }}
        initialFilterVisibility={mergedFilterVisibility}
        // Client-side navigation: fetch instantáneo vía React Query, sin router.push
        queryFn={tableQueryFn}
        queryKey={['workshop-tracking-paginated']}
        onStateChange={handleStateChange}
      />

      {/* Loading overlay para carga de detalle */}
      {loadingDetail && (
        <div className="fixed inset-0 bg-background/50 flex items-center justify-center z-50">
          <div className="bg-card p-4 rounded-lg shadow-lg flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm">Cargando detalle de orden...</span>
          </div>
        </div>
      )}

      {/* Dialog de detalle — solo lectura para operaciones */}
      <OrderDetailDialog
        orderId={selectedOrder?.id}
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setSelectedOrder(null);
        }}
        onLoaded={() => setLoadingDetail(false)}
        context="operations"
      />

      {/* Modal de historial */}
      <ActivityHistoryModal
        open={!!historyOrder}
        onClose={handleCloseHistory}
        maintenanceOrderId={historyOrder?.id}
        maintenanceRequestId={historyOrder?.maintenance_requests?.id}
        title="Historial de la Orden"
      />
    </>
  );
}
