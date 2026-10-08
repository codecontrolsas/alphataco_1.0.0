'use client';

import { Button } from '@/components/ui/button';
import { BulkDownloadBar } from '@/features/Clothing/pdf/BulkDownloadBar';
import { clothingDeliveryTypeLabels } from '@/features/Clothing/utils/mappers';
import { buildDeliveryStatusFacetResult } from '@/features/Clothing/components/DeliveryStatusBadge';
import { deliveryStatusLabels } from '@/features/Clothing/lib/delivery-stock-where';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { clothing_delivery_type } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { CircleOff, ExternalLink } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import {
  getAllEmployeeDeliveriesForExport,
  getEmployeeDeliveriesPaginated,
  getEmployeeDeliveriesSingleFacet,
  type EmployeeDeliveryListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from '../columns';

// ============================================================================
// LOGGER
// ============================================================================

const logger = new Logger('_EmployeeDeliveriesDataTable');

// ============================================================================
// TYPES
// ============================================================================

interface EmployeeDeliveriesDataTableProps {
  employeeId: string;
  data: EmployeeDeliveryListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
  /** Mapa "module:tab:action" -> concedido, cargado en el servidor. */
  permissionsMap: Record<string, boolean>;
}

// ============================================================================
// HELPERS — builders para reducir boilerplate en fetchFacet
// ============================================================================

function buildEnumFacetResult(
  enumValues: string[],
  labels: Record<string, string>,
  counts: Map<string, number>
): FacetResult {
  const options = enumValues.map((v) => ({
    value: v,
    label: labels[v] ?? v,
  }));
  return { options, counts };
}

function buildFkFacetResult(
  resolvedOptions: Array<{ id: string; name: string | null }> | undefined,
  counts: Map<string, number>
): FacetResult {
  const options = (resolvedOptions ?? []).map((o) => ({
    value: o.id,
    label: o.name ?? o.id,
  }));
  return { options, counts };
}

// ============================================================================
// DEFAULT VISIBLE FILTERS (max 3)
// ============================================================================

const DEFAULT_VISIBLE_FILTERS = ['delivered_at', 'delivery_type', 'delivered_by_id'];

// ============================================================================
// COMPONENT
// ============================================================================

export default function _EmployeeDeliveriesDataTable({
  employeeId,
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
  permissionsMap,
}: EmployeeDeliveriesDataTableProps) {
  const canViewPrices = permissionsMap['almacenes:movimientos:view_prices'] === true;
  const canCancel = permissionsMap['empleados:indumentaria_empleado:delete'] === true;
  const queryKey = useMemo(() => ['employee-deliveries', employeeId] as const, [employeeId]);

  logger.debug('Rendering employee deliveries table', { data: { employeeId, totalRows } });

  // ─── Client-side navigation ───────────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback(
    (params: DataTableSearchParams) => getEmployeeDeliveriesPaginated(employeeId, params),
    [employeeId]
  );

  // ─── Bulk download — selección cross-page ─────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [clearTrigger, setClearTrigger] = useState(0);
  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setClearTrigger((n) => n + 1);
  }, []);

  // ─── Lazy-load facets — factories ─────────────────────────────────────────

  const makeEnumFetchFacet = useCallback(
    (columnId: string, enumValues: string[], labels: Record<string, string>) =>
      async (facetParams: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getEmployeeDeliveriesSingleFacet(columnId, employeeId, facetParams);
        if (!result) return { options: [], counts: new Map() };
        return buildEnumFacetResult(enumValues, labels, result.counts);
      },
    [employeeId]
  );

  const makeFkFetchFacet = useCallback(
    (columnId: string) =>
      async (facetParams: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getEmployeeDeliveriesSingleFacet(columnId, employeeId, facetParams);
        if (!result) return { options: [], counts: new Map() };
        return buildFkFacetResult(result.resolvedOptions, result.counts);
      },
    [employeeId]
  );

  const fetchStatusFacet = useCallback(
    async (facetParams: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getEmployeeDeliveriesSingleFacet('status', employeeId, facetParams);
      return buildDeliveryStatusFacetResult(result?.counts ?? new Map());
    },
    [employeeId]
  );

  const fetchWarehouseFacet = useCallback(
    async (facetParams: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getEmployeeDeliveriesSingleFacet('warehouse', employeeId, facetParams);
      if (!result) return { options: [], counts: new Map() };
      const base = buildFkFacetResult(
        result.resolvedOptions?.map((o) => ({ id: o.id, name: o.name })),
        result.counts
      );
      const nullCount = result.counts.get(NULL_FILTER_VALUE);
      return nullCount
        ? { ...base, options: [...base.options, { value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff }] }
        : base;
    },
    [employeeId]
  );

  // ─── Columns ──────────────────────────────────────────────────────────────
  const columns = useMemo(
    () => getColumns({ canViewPrices, canCancel, queryKey }),
    [canViewPrices, canCancel, queryKey]
  );

  // ─── Faceted filters ──────────────────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      // delivered_at — date range
      {
        columnId: 'delivered_at',
        title: 'Fecha de entrega',
        type: 'dateRange' as const,
      },
      // delivery_type — enum faceted
      {
        columnId: 'delivery_type',
        title: 'Tipo de entrega',
        fetchFacet: makeEnumFetchFacet(
          'delivery_type',
          Object.values(clothing_delivery_type),
          clothingDeliveryTypeLabels
        ),
      },
      // status — virtual faceted (cancelled_at)
      {
        columnId: 'status',
        title: 'Estado',
        fetchFacet: fetchStatusFacet,
      },
      // warehouse — FK nullable faceted
      {
        columnId: 'warehouse',
        title: 'Depósito',
        fetchFacet: fetchWarehouseFacet,
      },
      // cost — text (importe exacto), solo con view_prices
      ...(canViewPrices
        ? [
            {
              columnId: 'cost',
              title: 'Costo',
              type: 'text' as const,
              placeholder: 'Importe exacto, ej. 15000,50',
            },
          ]
        : []),
      // delivered_by_file — text filter (legajo del que entrega)
      {
        columnId: 'delivered_by_file',
        title: 'Legajo Entregado por',
        type: 'text' as const,
        placeholder: 'Buscar por legajo...',
      },
      // delivered_by_id — FK faceted
      {
        columnId: 'delivered_by_id',
        title: 'Entregado por',
        fetchFacet: makeFkFetchFacet('delivered_by_id'),
      },
      // has_signature — boolean faceted
      {
        columnId: 'has_signature',
        title: 'Firma',
        fetchFacet: async (): Promise<FacetResult> => {
          // Computed client-side from data — no server facet needed
          const trueCount = data.filter((d) => d.signature_url != null).length;
          const falseCount = data.filter((d) => d.signature_url == null).length;
          const counts = new Map<string, number>();
          if (trueCount > 0) counts.set('true', trueCount);
          if (falseCount > 0) counts.set('false', falseCount);
          return {
            options: [
              { value: 'true', label: 'Con firma' },
              { value: 'false', label: 'Sin firma' },
            ],
            counts,
          };
        },
      },
      // notes — text filter
      {
        columnId: 'notes',
        title: 'Notas',
        type: 'text' as const,
        placeholder: 'Buscar en notas...',
      },
    ],
    [makeEnumFetchFacet, makeFkFetchFacet, fetchStatusFacet, fetchWarehouseFacet, canViewPrices, data]
  );

  // ─── Filter visibility (max 3 by default) ────────────────────────────────
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

  // ─── Column visibility ────────────────────────────────────────────────────
  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((col) => [col, false]));
    return { ...defaults, ...(initialColumnVisibility ?? {}) };
  }, [initialColumnVisibility]);

  // ─── Export config ────────────────────────────────────────────────────────
  const exportConfig = useMemo(
    () => ({
      fetchAllData: () => getAllEmployeeDeliveriesForExport(employeeId, currentParams),
      options: {
        filename: 'entregas-indumentaria',
        sheetName: 'Entregas',
        title: 'Entregas de Indumentaria',
      },
      formatters: {
        delivered_at: (val: unknown) => (val ? moment(val as Date).format('DD/MM/YYYY') : '-'),
        delivery_type: (val: unknown) =>
          val ? clothingDeliveryTypeLabels[val as keyof typeof clothingDeliveryTypeLabels] ?? String(val) : '-',
        has_signature: (val: unknown) => (val === 'true' ? 'Sí' : 'No'),
        status: (val: unknown) => deliveryStatusLabels[String(val)] ?? '-',
        warehouse: (val: unknown) => (val ? String(val) : '-'),
        cost: (val: unknown) => (val != null ? formatMoney(String(val)) : 'Sin costo'),
        delivered_by_file: (val: unknown) => (val != null ? String(val) : '-'),
      },
    }),
    [employeeId, currentParams]
  );

  // ─── Toolbar actions ───────────────────────────────────────────────────
  const toolbarActions = (
    <PermissionGuard module="empleados" tab="indumentaria_empleado" action="create">
      <Button asChild size="sm" className="gap-2">
        <Link href={`/clothing/delivery?employee_id=${employeeId}`} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="mr-1 h-4 w-4" />
          Nueva Entrega
        </Link>
      </Button>
    </PermissionGuard>
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        totalRows={totalRows}
        searchParams={searchParams}
        paramNamespace={tableId}
        tableId={tableId}
        queryFn={tableQueryFn}
        queryKey={[...queryKey]}
        onStateChange={handleStateChange}
        facetedFilters={facetedFilters}
        initialFilterVisibility={mergedFilterVisibility}
        initialColumnVisibility={mergedColumnVisibility}
        searchPlaceholder="Buscar en notas..."
        showFilterToggle={true}
        showSearch={true}
        emptyMessage="No hay entregas registradas para este empleado"
        exportConfig={exportConfig}
        toolbarActions={toolbarActions}
        enableRowSelection
        showRowSelection
        onRowSelectionIdsChange={setSelectedIds}
        clearSelectionTrigger={clearTrigger}
      />
      <BulkDownloadBar selectedIds={selectedIds} onClear={clearSelection} />
    </>
  );
}
