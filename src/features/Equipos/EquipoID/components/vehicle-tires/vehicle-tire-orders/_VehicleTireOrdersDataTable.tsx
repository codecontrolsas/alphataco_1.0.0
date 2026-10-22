'use client';

import { ServiceOrderDetailView } from '@/features/Mantenimiento/Gomeria/Ordenes/components/ServiceOrderDetailView';
import { tireServiceOrderStatusLabels } from '@/features/Mantenimiento/Gomeria/shared/tire-mappers';
import type { DataTableSearchParams, FacetResult } from '@/shared/components/common/DataTable/types';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useCallback, useMemo, useState } from 'react';
import {
  getVehicleTireOrderSingleFacet,
  getVehicleTireOrdersForExport,
  getVehicleTireOrdersPaginated,
  type VehicleTireOrderItem,
} from '../actions/orders.server';
import { getColumns } from './columns';

// ============================================================================
// TYPES
// ============================================================================

interface VehicleTireOrdersDataTableProps {
  vehicleId: string;
  data: VehicleTireOrderItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

// ============================================================================
// STATUS OPTIONS
// ============================================================================

const STATUS_VALUES = ['OPEN', 'CLOSED'];

// ============================================================================
// COMPONENT
// ============================================================================

export function VehicleTireOrdersDataTable({
  vehicleId,
  data,
  totalRows,
  searchParams,
  initialColumnVisibility = {},
  initialFilterVisibility = {},
}: VehicleTireOrdersDataTableProps) {
  // Current params for export with active filters
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  // Selected order for detail dialog
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const handleViewDetail = useCallback((order: VehicleTireOrderItem) => {
    setSelectedOrderId(order.id);
    setDetailOpen(true);
  }, []);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback(
    (params: DataTableSearchParams) => getVehicleTireOrdersPaginated(vehicleId, params),
    [vehicleId]
  );

  // ── Columns ───────────────────────────────────────────────────────────────

  const columns = useMemo(() => getColumns(handleViewDetail), [handleViewDetail]);

  // ── Lazy-load facets ──────────────────────────────────────────────────────

  const makeEnumFetchFacet = useCallback(
    (columnId: string, enumValues: string[], labels: Record<string, string>) => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getVehicleTireOrderSingleFacet(vehicleId, columnId, params);
        if (!result) return { options: [], counts: new Map() };

        const options = enumValues.map((v) => ({
          value: v,
          label: labels[v] ?? v,
        }));

        return { options, counts: result.counts };
      };
    },
    [vehicleId]
  );

  const makeFkFetchFacet = useCallback(
    (columnId: string) => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getVehicleTireOrderSingleFacet(vehicleId, columnId, params);
        if (!result) return { options: [], counts: new Map() };

        const options = result.resolvedOptions ?? [];
        return { options, counts: result.counts };
      };
    },
    [vehicleId]
  );

  const facetedFilters = useMemo(
    () => [
      {
        columnId: 'status',
        title: 'Estado',
        fetchFacet: makeEnumFetchFacet('status', STATUS_VALUES, tireServiceOrderStatusLabels),
      },
      {
        columnId: 'creator',
        title: 'Creado por',
        fetchFacet: makeFkFetchFacet('creator'),
      },
      {
        columnId: 'service_date',
        title: 'Fecha',
        type: 'dateRange' as const,
      },
      {
        columnId: 'closed_at',
        title: 'Fecha cierre',
        type: 'dateRange' as const,
      },
      {
        columnId: 'kilometer',
        title: 'Kilómetros',
        type: 'text' as const,
        placeholder: 'Filtrar por km...',
      },
    ],
    [makeEnumFetchFacet, makeFkFetchFacet]
  );

  // ── Export ────────────────────────────────────────────────────────────────

  const exportConfig = useMemo(
    () => ({
      fetchAllData: async () => {
        // La action devuelve el error (tope de filas, permiso) en vez de lanzarlo: así llega al toast.
        return unwrapExportResult(await getVehicleTireOrdersForExport(vehicleId, currentParams));
      },
      options: {
        filename: `ordenes-gomeria-equipo`,
        sheetName: 'Órdenes de Gomería',
        title: 'Historial de Órdenes de Gomería',
      },
      formatters: {
        service_date: (val: unknown) => (val ? formatArgentinaDay(val as Date | string) : '-'),
        closed_at: (val: unknown) => (val ? formatArgentinaDay(val as Date | string) : '-'),
        status: (val: unknown) => tireServiceOrderStatusLabels[val as string] ?? String(val ?? ''),
        creator: (_val: unknown, row: VehicleTireOrderItem) => row.creator?.fullname ?? '-',
        interventions: (_val: unknown, row: VehicleTireOrderItem) => row._count.items,
      },
    }),
    [vehicleId, currentParams]
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        totalRows={totalRows}
        searchParams={searchParams}
        queryFn={tableQueryFn}
        queryKey={['vehicle-tire-orders', vehicleId]}
        onStateChange={handleStateChange}
        facetedFilters={facetedFilters}
        paramNamespace="vehicle-tire-orders"
        tableId="vehicle-tire-orders"
        searchPlaceholder="Buscar por kilómetros..."
        showSearch
        showFilterToggle
        emptyMessage="No hay órdenes de gomería para este equipo."
        exportConfig={exportConfig}
        initialColumnVisibility={initialColumnVisibility}
        initialFilterVisibility={initialFilterVisibility}
      />

      {selectedOrderId && (
        <ServiceOrderDetailView
          orderId={selectedOrderId}
          open={detailOpen}
          onOpenChange={(open) => {
            setDetailOpen(open);
            if (!open) setSelectedOrderId(null);
          }}
        />
      )}
    </>
  );
}
