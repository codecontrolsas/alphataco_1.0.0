'use client';

import { Button } from '@/components/ui/button';
import { ActivityHistoryModal } from '@/features/Mantenimiento/components/ActivityHistoryModal';
import { invalidateAllMaintenanceQueries } from '@/features/Mantenimiento/utils/queryInvalidation';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { buildEnumFacetResult, buildFkFacetResult } from '@/shared/components/common/DataTable/facet-results';
import type {
  DataTableFacetedFilterConfig,
  DataTableSearchParams,
  FacetResult,
} from '@/shared/components/common/DataTable/types';
import { argentinaDate, formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import {
  getAllMaintenanceRequestsForExport,
  getMaintenanceRequestSingleFacet,
  getMaintenanceRequestsPaginated,
  type MaintenanceRequestListItem,
} from './actions/actionsTableServer';
import { getMaintenanceRequestById } from './actions/queries.server';
import { REQUESTS_PARAM_NAMESPACE } from './constants';
import {
  HIDDEN_COLUMNS_BY_DEFAULT,
  ORDER_STATUS_LABELS,
  REQUEST_STATUS_LABELS,
  SOURCE_LABELS,
  STATUS_ICONS,
  getMaintenanceRequestColumns,
} from './tableColumns';

// Diálogos pesados: se cargan recién cuando se abren (no forman parte del bundle inicial de la tabla)
const SolicitudApprovalDialog = dynamic(() =>
  import('./components/SolicitudApprovalDialog').then((m) => m.SolicitudApprovalDialog)
);
const SolicitudDetailDialog = dynamic(() =>
  import('./components/SolicitudDetailDialog').then((m) => m.SolicitudDetailDialog)
);
const SolicitudRejectDialog = dynamic(() =>
  import('./components/SolicitudRejectDialog').then((m) => m.SolicitudRejectDialog)
);
const ReassignSupervisorDialog = dynamic(() =>
  import('./components/ReassignSupervisorDialog').then((m) => m.ReassignSupervisorDialog)
);

// Filtros visibles por defecto
const DEFAULT_VISIBLE_FILTERS = ['status', 'vehicle', 'source'];

interface MaintenanceRequestDataTableProps {
  data: MaintenanceRequestListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
  canApproveReject?: boolean;
  fetchAllForExport: typeof getAllMaintenanceRequestsForExport;
}

// ============================================================================
// HELPERS — builders para reducir boilerplate en fetchFacet
// ============================================================================

export function MaintenanceRequestDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
  canApproveReject = false,
  fetchAllForExport,
}: MaintenanceRequestDataTableProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [dialogType, setDialogType] = useState<'view' | 'approve' | 'reject' | null>(null);
  const [historyRequestId, setHistoryRequestId] = useState<string | null>(null);
  const [reassignRequestId, setReassignRequestId] = useState<string | null>(null);
  const [showReassignDialog, setShowReassignDialog] = useState(false);

  // Cargar request completo cuando se abre un diálogo (para datos detallados)
  const { data: fullRequest, isLoading: isLoadingRequest } = useQuery({
    queryKey: ['maintenance-request-detail', selectedRequestId],
    queryFn: () => getMaintenanceRequestById(selectedRequestId!),
    enabled: !!selectedRequestId,
    staleTime: 0,
  });

  const { data: fullReassignRequest } = useQuery({
    queryKey: ['maintenance-request-detail', reassignRequestId],
    queryFn: () => getMaintenanceRequestById(reassignRequestId!),
    enabled: !!reassignRequestId,
    staleTime: 0,
  });

  // ─── Client-side navigation: estado reactivo para queries dependientes (export) ────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  // queryFn para fetch client-side de datos de tabla (sin router.push, sin re-render de toda la página)
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getMaintenanceRequestsPaginated(params), []);

  // Handlers de acciones
  const handleView = (request: MaintenanceRequestListItem) => {
    setSelectedRequestId(request.id);
    setDialogType('view');
  };

  const handleApprove = (request: MaintenanceRequestListItem) => {
    setSelectedRequestId(request.id);
    setDialogType('approve');
  };

  const handleReject = (request: MaintenanceRequestListItem) => {
    setSelectedRequestId(request.id);
    setDialogType('reject');
  };

  // Tras aprobar / rechazar / reasignar la tabla sale de React Query (client-side mode): hay que
  // invalidar el detalle, la lista y las facetas además de refrescar los Server Components.
  const refreshAfterChange = () => {
    queryClient.invalidateQueries({ queryKey: ['maintenance-request-detail'] });
    queryClient.invalidateQueries({ queryKey: ['datatable-facet'] });
    // Lista, métricas de la banda y contadores del pipeline (todas cuelgan de `['maintenance']`).
    invalidateAllMaintenanceQueries(queryClient);
    router.refresh();
  };

  const handleCloseDialog = () => {
    setSelectedRequestId(null);
    setDialogType(null);
    refreshAfterChange();
  };

  const handleViewHistory = (request: MaintenanceRequestListItem) => {
    setHistoryRequestId(request.id);
  };

  const handleCloseHistory = () => {
    setHistoryRequestId(null);
  };

  const handleReassign = (request: MaintenanceRequestListItem) => {
    setReassignRequestId(request.id);
    setShowReassignDialog(true);
  };

  // Columnas del DataTable
  const columns = useMemo(
    () =>
      getMaintenanceRequestColumns({
        onView: handleView,
        onApprove: handleApprove,
        onReject: handleReject,
        onViewHistory: handleViewHistory,
        onReassign: handleReassign,
        canApproveReject,
      }),
    [canApproveReject]
  );

  // ─── fetchFacet factories: cada filtro carga sus opciones+counts bajo demanda ──────

  const makeEnumFetchFacet = useCallback(
    (
      columnId: string,
      enumValues: string[],
      labels: Record<string, string>,
      icons: Record<string, LucideIcon | undefined>
    ) => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getMaintenanceRequestSingleFacet(columnId, params);
        if (!result) return { options: [], counts: new Map() };
        return buildEnumFacetResult(enumValues, labels, icons, result.counts);
      };
    },
    []
  );

  const makeFkFetchFacet = useCallback((columnId: string, nullLabel = 'Sin asignar') => {
    return async (params: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getMaintenanceRequestSingleFacet(columnId, params);
      if (!result) return { options: [], counts: new Map() };
      return buildFkFacetResult(result.resolvedOptions, result.counts, nullLabel);
    };
  }, []);

  // Configuración de filtros facetados (lazy-load — cada uno se carga al abrir su popover)
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      {
        columnId: 'status',
        title: 'Estado',
        fetchFacet: makeEnumFetchFacet(
          'status',
          Object.keys(REQUEST_STATUS_LABELS),
          REQUEST_STATUS_LABELS,
          STATUS_ICONS
        ),
      },
      {
        columnId: 'vehicle',
        title: 'Equipo',
        fetchFacet: makeFkFetchFacet('vehicle'),
      },
      {
        columnId: 'source',
        title: 'Origen',
        fetchFacet: makeEnumFetchFacet('source', Object.keys(SOURCE_LABELS), SOURCE_LABELS, {}),
      },
      {
        columnId: 'supervisor',
        title: 'Supervisor',
        fetchFacet: makeFkFetchFacet('supervisor'),
      },
      // Filtro de fecha (dateRange) — columna created_at
      {
        columnId: 'created_at',
        title: 'Fecha Solicitud',
        type: 'dateRange' as const,
      },
      // Legajo del chofer — coincidencia EXACTA (ingresar el número completo)
      {
        columnId: 'fileNumber',
        title: 'Legajo (exacto)',
        type: 'text' as const,
        placeholder: 'Nro. de legajo completo...',
      },
      {
        columnId: 'kilometer',
        title: 'Kilometraje',
        type: 'text' as const,
        placeholder: 'Buscar por kilometraje...',
      },
      {
        columnId: 'engine_hours',
        title: 'Horas Motor',
        type: 'text' as const,
        placeholder: 'Buscar por horas...',
      },
    ],
    [makeEnumFetchFacet, makeFkFetchFacet]
  );

  // Visibilidad de filtros por defecto (preferencias de BD tienen prioridad)
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

  // Visibilidad de columnas por defecto
  const columnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((col) => [col, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  // Configuración de exportación a Excel
  const exportConfig = useMemo(
    () => ({
      options: {
        filename: `solicitudes-mantenimiento-${argentinaDate()}`,
        sheetName: 'Solicitudes',
      },
      // Usa currentParams (estado reactivo del client-side mode), NO searchParams (prop inicial de SSR),
      // para que la exportación respete los filtros activos en el momento del click.
      fetchAllData: async () => unwrapExportResult(await fetchAllForExport(currentParams)),
      formatters: {
        created_at: (val: unknown) => (val ? formatArgentinaDateTime(val as string) : '-'),
        status: (val: unknown) => {
          const s = val as string;
          return REQUEST_STATUS_LABELS[s] ?? ORDER_STATUS_LABELS[s] ?? s ?? '-';
        },
        source: (val: unknown) => SOURCE_LABELS[val as string] ?? String(val ?? '-'),
        kilometer: (val: unknown) => (val ? `${val} km` : '-'),
        engine_hours: (val: unknown) => (val ? `${val} hs` : '-'),
        items_count: (val: unknown) => String(val ?? 0),
        // accessorFn retorna string vacío cuando no hay valor — normalizar a '-'
        supervisor: (val: unknown) => (val ? String(val) : 'Sin asignar'),
        driver: (val: unknown) => (val ? String(val) : '-'),
        fileNumber: (val: unknown) => (val ? String(val) : '-'),
        vehicle: (val: unknown) => (val ? String(val) : '-'),
      },
    }),
    [fetchAllForExport, currentParams]
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        totalRows={totalRows}
        searchParams={searchParams}
        paramNamespace={REQUESTS_PARAM_NAMESPACE}
        tableId={tableId}
        mobileCards
        facetedFilters={facetedFilters}
        exportConfig={exportConfig}
        initialColumnVisibility={columnVisibility}
        initialFilterVisibility={mergedFilterVisibility}
        searchPlaceholder="Buscar solicitudes..."
        emptyMessage="No hay solicitudes esperando validación. Aparecen cuando un chofer o supervisor informa desvíos; si aplicaste filtros, probá quitarlos."
        showFilterToggle={true}
        // Client-side navigation: fetch instantáneo vía React Query, sin router.push
        queryFn={tableQueryFn}
        queryKey={['maintenance-requests-paginated']}
        onStateChange={handleStateChange}
      />

      {/* Mientras se trae el detalle no hay diálogo: se avisa, y si no se pudo cargar se dice y se puede cerrar. */}
      {selectedRequestId && isLoadingRequest && (
        <p role="status" className="sr-only">
          Cargando la solicitud…
        </p>
      )}
      {selectedRequestId && !isLoadingRequest && !fullRequest && (
        <div
          role="alert"
          className="border-danger/30 bg-danger-subtle text-danger-subtle-foreground mt-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm"
        >
          <span className="min-w-0 flex-1">
            No se pudo cargar la solicitud. Puede haber sido resuelta por otra persona.
          </span>
          <Button type="button" variant="outline" size="sm" onClick={handleCloseDialog}>
            Cerrar y actualizar
          </Button>
        </div>
      )}

      {selectedRequestId && dialogType === 'view' && fullRequest && (
        <SolicitudDetailDialog request={fullRequest} open={true} onClose={handleCloseDialog} />
      )}

      {selectedRequestId && dialogType === 'approve' && fullRequest && (
        <SolicitudApprovalDialog request={fullRequest} open={true} onClose={handleCloseDialog} />
      )}

      {selectedRequestId && dialogType === 'reject' && fullRequest && (
        <SolicitudRejectDialog request={fullRequest} open={true} onClose={handleCloseDialog} />
      )}

      {reassignRequestId && fullReassignRequest && (
        <ReassignSupervisorDialog
          request={fullReassignRequest}
          open={showReassignDialog}
          onOpenChange={(open) => {
            setShowReassignDialog(open);
            if (!open) {
              setReassignRequestId(null);
              refreshAfterChange();
            }
          }}
        />
      )}

      <ActivityHistoryModal
        open={!!historyRequestId}
        onClose={handleCloseHistory}
        maintenanceRequestId={historyRequestId}
        title="Historial de la Solicitud"
      />
    </>
  );
}
