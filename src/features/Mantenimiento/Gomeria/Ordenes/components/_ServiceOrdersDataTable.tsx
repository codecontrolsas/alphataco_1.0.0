'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { buildEnumFacetResult, buildFkFacetResult } from '@/features/Mantenimiento/Gomeria/shared/facet-helpers';
import { tireServiceOrderStatusLabels } from '@/features/Mantenimiento/Gomeria/shared/tire-mappers';
import { TireServiceOrderStatus } from '@/generated/prisma/enums';
import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import type { LucideIcon } from 'lucide-react';
import { Plus } from 'lucide-react';
import moment from 'moment';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  cancelServiceOrder,
  closeServiceOrder,
  getServiceOrderSingleFacet,
  getServiceOrdersForExport,
  getServiceOrdersPaginated,
  type ServiceOrderListItem,
} from '../actions/actions.server';
import { ServiceOrderDetailView } from './ServiceOrderDetailView';
import { ServiceOrderWizard } from './ServiceOrderWizard';
import { getColumns } from './columns';

// ============================================================================
// CONSTANTS
// ============================================================================

const TABLE_ID = 'tire-service-orders';
const DEFAULT_VISIBLE_FILTERS = ['status', 'vehicle_id', 'created_by'];

const ALL_FILTER_IDS = [
  'status',
  'vehicle_id',
  'trailer_vehicle_id',
  'created_by',
  'kilometer',
  'service_date',
  'created_at',
];

// ============================================================================
// TYPES
// ============================================================================

interface ServiceOrdersDataTableProps {
  data: ServiceOrderListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function _ServiceOrdersDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: ServiceOrdersDataTableProps) {
  // ─── Permissions ──────────────────────────────────────────────────────────
  const permissions = useMemo(
    () => ({
      hasPermission: (module: string, tab: string, action: string) =>
        permissionsMap[`${module}:${tab}:${action}`] === true,
    }),
    [permissionsMap]
  );

  const canCreate = permissions.hasPermission('mantenimiento', 'ordenes_gomeria', 'create');

  // ─── Dialog state ─────────────────────────────────────────────────────────
  const [closingOrder, setClosingOrder] = useState<ServiceOrderListItem | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState<ServiceOrderListItem | null>(null);
  const [isActionPending, setIsActionPending] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [continuingOrder, setContinuingOrder] = useState<ServiceOrderListItem | null>(null);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);

  // ─── Client-side navigation ───────────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getServiceOrdersPaginated(params), []);

  // ─── Columns ──────────────────────────────────────────────────────────────
  const columns = useMemo(
    () =>
      getColumns(
        permissions,
        (order) => setClosingOrder(order),
        (order) => setCancellingOrder(order),
        (order) => setDetailOrderId(order.id),
        (order) => setContinuingOrder(order)
      ),
    [permissions]
  );

  // ─── Filter visibility ────────────────────────────────────────────────────
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    return Object.fromEntries(ALL_FILTER_IDS.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
  }, [initialFilterVisibility]);

  // ─── fetchFacet factories ─────────────────────────────────────────────────

  const makeEnumFetchFacet = useCallback(
    (
      columnId: string,
      enumValues: string[],
      labels: Record<string, string>,
      icons?: Record<string, LucideIcon | undefined>
    ) => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getServiceOrderSingleFacet(columnId, params);
        if (!result) return { options: [], counts: new Map() };
        return buildEnumFacetResult(enumValues, labels, icons, result.counts);
      };
    },
    []
  );

  const makeFkFetchFacet = useCallback((columnId: string, nullLabel = 'Sin asignar') => {
    return async (params: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getServiceOrderSingleFacet(columnId, params);
      if (!result) return { options: [], counts: new Map() };
      return buildFkFacetResult(result.resolvedOptions, result.counts, nullLabel);
    };
  }, []);

  // ─── Faceted filters ──────────────────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      // ── Status (enum) ──────────────────────────────────────────────────────
      {
        columnId: 'status',
        title: 'Estado',
        fetchFacet: makeEnumFetchFacet('status', Object.values(TireServiceOrderStatus), tireServiceOrderStatusLabels),
      },

      // ── Vehicle (FK UUID) ──────────────────────────────────────────────────
      {
        columnId: 'vehicle_id',
        title: 'Vehículo',
        fetchFacet: makeFkFetchFacet('vehicle_id'),
      },

      // ── Trailer (FK UUID nullable) ─────────────────────────────────────────
      {
        columnId: 'trailer_vehicle_id',
        title: 'Enganche',
        fetchFacet: makeFkFetchFacet('trailer_vehicle_id', 'Sin asignar'),
      },

      // ── Created By (FK UUID) ───────────────────────────────────────────────
      {
        columnId: 'created_by',
        title: 'Creado por',
        fetchFacet: makeFkFetchFacet('created_by'),
      },

      // ── Text filters ──────────────────────────────────────────────────────
      {
        columnId: 'kilometer',
        title: 'Kilómetros',
        type: 'text' as const,
        placeholder: 'Buscar por kilómetros...',
      },

      // ── Date range filters ────────────────────────────────────────────────
      { columnId: 'service_date', title: 'Fecha', type: 'dateRange' as const },
      { columnId: 'created_at', title: 'Creado', type: 'dateRange' as const },
    ],
    [makeEnumFetchFacet, makeFkFetchFacet]
  );

  // ─── Toolbar actions ──────────────────────────────────────────────────────
  const toolbarActions = canCreate ? (
    <Button variant="brand" size="sm" onClick={() => setShowWizard(true)}>
      <Plus className="mr-2 size-4" />
      Nueva Orden
    </Button>
  ) : undefined;

  // ─── Close order handler ──────────────────────────────────────────────────
  async function handleCloseConfirm() {
    if (!closingOrder) return;
    setIsActionPending(true);
    try {
      await closeServiceOrder(closingOrder.id);
      toast.success('Orden finalizada correctamente');
      setClosingOrder(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al finalizar la orden');
    } finally {
      setIsActionPending(false);
    }
  }

  // ─── Cancel order handler ─────────────────────────────────────────────────
  async function handleCancelConfirm() {
    if (!cancellingOrder) return;
    setIsActionPending(true);
    try {
      const result = await cancelServiceOrder(cancellingOrder.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Orden anulada, cubiertas revertidas y movimientos de stock anulados');
      setCancellingOrder(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al anular la orden');
    } finally {
      setIsActionPending(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        totalRows={totalRows}
        searchParams={searchParams}
        tableId={tableId}
        paramNamespace={TABLE_ID}
        facetedFilters={facetedFilters}
        initialColumnVisibility={initialColumnVisibility}
        initialFilterVisibility={mergedFilterVisibility}
        toolbarActions={toolbarActions}
        showFilterToggle
        queryFn={tableQueryFn}
        queryKey={['tire-service-orders']}
        onStateChange={handleStateChange}
        emptyMessage="No hay órdenes de gomería"
        searchPlaceholder="Buscar por kilómetros..."
        exportConfig={{
          fetchAllData: () => getServiceOrdersForExport(currentParams),
          options: {
            filename: 'ordenes-gomeria',
            sheetName: 'Órdenes',
            title: 'Órdenes de Gomería',
          },
          formatters: {
            status: (value) => tireServiceOrderStatusLabels[value as string] ?? String(value),
            service_date: (value) => (value ? moment(value as string | Date).format('DD/MM/YYYY') : '-'),
            created_at: (value) => (value ? moment(value as string | Date).format('DD/MM/YYYY') : '-'),
            vehicle_id: (_value, row) => row.vehicle?.domain ?? '-',
            trailer_vehicle_id: (_value, row) => row.trailer?.domain ?? 'Sin asignar',
            created_by: (_value, row) => row.creator?.fullname ?? '-',
          },
        }}
      />

      {/* ─── Finalize order confirmation ───────────────────────────────── */}
      <AlertDialog
        open={closingOrder !== null}
        onOpenChange={(open) => {
          if (!open) setClosingOrder(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Finalizar orden de gomería?</AlertDialogTitle>
            <AlertDialogDescription>
              Se finalizará la orden del vehículo <strong>{closingOrder?.vehicle?.domain}</strong>. Una vez finalizada
              no se podrán agregar nuevas intervenciones.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isActionPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCloseConfirm} disabled={isActionPending}>
              {isActionPending ? 'Finalizando...' : 'Finalizar orden'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Annul order confirmation ──────────────────────────────────── */}
      <AlertDialog
        open={cancellingOrder !== null}
        onOpenChange={(open) => {
          if (!open) setCancellingOrder(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Anular orden de gomería?</AlertDialogTitle>
            <AlertDialogDescription>
              Se anulará la orden del vehículo <strong>{cancellingOrder?.vehicle?.domain}</strong> y se revertirán todos
              los movimientos de cubiertas realizados en esta orden. También se anulan los movimientos de stock de las
              cubiertas (montajes y devoluciones al depósito). Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isActionPending}>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelConfirm}
              disabled={isActionPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isActionPending ? 'Anulando...' : 'Anular orden'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── New Order Wizard ──────────────────────────────────────────── */}
      <Dialog open={showWizard} onOpenChange={setShowWizard}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <ServiceOrderWizard mode="dashboard" onClose={() => setShowWizard(false)} />
        </DialogContent>
      </Dialog>

      {/* ─── Continue Open Order ─────────────────────────────────────── */}
      <Dialog
        open={continuingOrder !== null}
        onOpenChange={(open) => {
          if (!open) setContinuingOrder(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {continuingOrder && (
            <ServiceOrderWizard
              mode="dashboard"
              existingOrderId={continuingOrder.id}
              vehicleId={continuingOrder.vehicle_id}
              trailerId={continuingOrder.trailer_vehicle_id ?? undefined}
              onClose={() => setContinuingOrder(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Order Detail View ─────────────────────────────────────────── */}
      <ServiceOrderDetailView
        orderId={detailOrderId ?? ''}
        open={detailOrderId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailOrderId(null);
        }}
      />
    </>
  );
}
