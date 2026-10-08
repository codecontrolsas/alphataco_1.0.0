'use client';

import { buildDeliveryStatusFacetResult } from '@/features/Clothing/components/DeliveryStatusBadge';
import { deliveryStatusLabels } from '@/features/Clothing/lib/delivery-stock-where';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { BulkDownloadBar } from '@/features/Clothing/pdf/BulkDownloadBar';
import { clothingDeliveryTypeLabels } from '@/features/Clothing/utils/mappers';
import type { clothing_delivery_type } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { Check, CircleOff, X } from 'lucide-react';
import moment from 'moment';
import { useCallback, useMemo, useState } from 'react';
import {
  getAllClothingReportsForExport,
  getClothingReportsPaginated,
  getClothingReportsSingleFacet,
  type ClothingReportListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from '../columns';

// ============================================================================
// LOGGER
// ============================================================================

const logger = new Logger('_ClothingReportsDataTable');

// ============================================================================
// TYPES
// ============================================================================

interface ClothingReportsDataTableProps {
  data: ClothingReportListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
  /** Mapa "module:tab:action" -> concedido, cargado en el servidor. */
  permissionsMap: Record<string, boolean>;
}

// ============================================================================
// HELPERS — builders for fetchFacet boilerplate reduction
// ============================================================================

/** Builds FacetResult for FK columns where resolvedOptions come from the server */
function buildFkFacetResult(
  resolvedOptions: Array<{ id: string; name: string | null }> | undefined,
  counts: Map<string, number>
): FacetResult {
  const options = (resolvedOptions ?? []).map((opt) => ({
    value: opt.id,
    label: opt.name ?? opt.id,
  }));
  return { options, counts };
}

/** Builds FacetResult for enum columns */
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

// ============================================================================
// DEFAULT VISIBLE FILTERS (max 3)
// ============================================================================

const DEFAULT_VISIBLE_FILTERS = ['delivery_type', 'employee', 'delivered_at'];

// ============================================================================
// COMPONENT
// ============================================================================

export default function _ClothingReportsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
  permissionsMap,
}: ClothingReportsDataTableProps) {
  const canViewPrices = permissionsMap['almacenes:movimientos:view_prices'] === true;
  const canCancel = permissionsMap['empleados:indumentaria_empleado:delete'] === true;
  const queryKey = useMemo(() => ['clothing-reports'] as const, []);

  // ─── Client-side navigation ───────────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getClothingReportsPaginated(params), []);

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
        logger.debug('Fetching enum facet', { data: { columnId } });
        const result = await getClothingReportsSingleFacet(columnId, facetParams);
        if (!result) return { options: [], counts: new Map() };
        return buildEnumFacetResult(enumValues, labels, result.counts);
      },
    []
  );

  const makeFkFetchFacet = useCallback(
    (columnId: string) =>
      async (facetParams: DataTableSearchParams): Promise<FacetResult> => {
        logger.debug('Fetching FK facet', { data: { columnId } });
        const result = await getClothingReportsSingleFacet(columnId, facetParams);
        if (!result) return { options: [], counts: new Map() };
        return buildFkFacetResult(result.resolvedOptions, result.counts);
      },
    []
  );

  const makeBooleanFetchFacet = useCallback(
    (columnId: string, trueLabel: string, falseLabel: string) =>
      async (facetParams: DataTableSearchParams): Promise<FacetResult> => {
        logger.debug('Fetching boolean facet', { data: { columnId } });
        const result = await getClothingReportsSingleFacet(columnId, facetParams);
        if (!result) return { options: [], counts: new Map() };
        return {
          options: [
            { value: 'true', label: trueLabel, icon: Check },
            { value: 'false', label: falseLabel, icon: X },
          ],
          counts: result.counts,
        };
      },
    []
  );

  const fetchStatusFacet = useCallback(async (facetParams: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getClothingReportsSingleFacet('status', facetParams);
    return buildDeliveryStatusFacetResult(result?.counts ?? new Map());
  }, []);

  const fetchWarehouseFacet = useCallback(async (facetParams: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getClothingReportsSingleFacet('warehouse', facetParams);
    if (!result) return { options: [], counts: new Map() };
    const base = buildFkFacetResult(result.resolvedOptions, result.counts);
    const nullCount = result.counts.get(NULL_FILTER_VALUE);
    return nullCount
      ? { ...base, options: [...base.options, { value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff }] }
      : base;
  }, []);

  // ─── Columns ──────────────────────────────────────────────────────────────
  const columns = useMemo(
    () => getColumns({ canViewPrices, canCancel, queryKey }),
    [canViewPrices, canCancel, queryKey]
  );

  // ─── Faceted filters ──────────────────────────────────────────────────────
  const deliveryTypeValues = useMemo(
    () => ['PLANNED_CCT', 'PLANNED_EPP', 'REPLACEMENT'] satisfies clothing_delivery_type[],
    []
  );

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      // delivered_at — date range
      {
        columnId: 'delivered_at',
        title: 'Fecha de entrega',
        type: 'dateRange' as const,
      },
      // employee_file — text filter (legajo receptor)
      {
        columnId: 'employee_file',
        title: 'Legajo Receptor',
        type: 'text' as const,
        placeholder: 'Buscar por legajo...',
      },
      // employee — FK faceted
      {
        columnId: 'employee',
        title: 'Empleado',
        fetchFacet: makeFkFetchFacet('employee'),
      },
      // delivered_by_file — text filter (legajo del que entrega)
      {
        columnId: 'delivered_by_file',
        title: 'Legajo Entregado por',
        type: 'text' as const,
        placeholder: 'Buscar por legajo...',
      },
      // delivered_by — FK faceted
      {
        columnId: 'delivered_by',
        title: 'Entregado por',
        fetchFacet: makeFkFetchFacet('delivered_by'),
      },
      // delivery_type — enum faceted
      {
        columnId: 'delivery_type',
        title: 'Tipo de entrega',
        fetchFacet: makeEnumFetchFacet('delivery_type', deliveryTypeValues, clothingDeliveryTypeLabels),
      },
      // has_signature — computed boolean faceted
      {
        columnId: 'has_signature',
        title: 'Firma',
        fetchFacet: makeBooleanFetchFacet('has_signature', 'Con firma', 'Sin firma'),
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
      // notes — text filter
      {
        columnId: 'notes',
        title: 'Notas',
        type: 'text' as const,
        placeholder: 'Buscar por notas...',
      },
      // created_at — date range
      {
        columnId: 'created_at',
        title: 'Fecha de registro',
        type: 'dateRange' as const,
      },
    ],
    [
      makeEnumFetchFacet,
      makeFkFetchFacet,
      makeBooleanFetchFacet,
      deliveryTypeValues,
      fetchStatusFacet,
      fetchWarehouseFacet,
      canViewPrices,
    ]
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
      fetchAllData: () => getAllClothingReportsForExport(currentParams),
      options: {
        filename: 'reportes-indumentaria',
        sheetName: 'Reportes',
        title: 'Reportes de Entregas de Indumentaria',
      },
      formatters: {
        delivered_at: (val: unknown) => (val ? moment(val as Date).format('DD/MM/YYYY') : '-'),
        created_at: (val: unknown) => (val ? moment(val as Date).format('DD/MM/YYYY') : '-'),
        delivery_type: (val: unknown) =>
          val ? clothingDeliveryTypeLabels[val as clothing_delivery_type] ?? String(val) : '-',
        has_signature: (val: unknown) => (val === 'true' ? 'Sí' : 'No'),
        status: (val: unknown) => deliveryStatusLabels[String(val)] ?? '-',
        warehouse: (val: unknown) => (val ? String(val) : '-'),
        cost: (val: unknown) => (val != null ? formatMoney(String(val)) : 'Sin costo'),
        employee_file: (val: unknown) => (val != null ? String(val) : '-'),
        delivered_by_file: (val: unknown) => (val != null ? String(val) : '-'),
        items_summary: (_val: unknown, row: ClothingReportListItem) => {
          const items = row.clothing_delivery_items;
          if (!items || items.length === 0) return 'Sin artículos';
          return items
            .map((item) => {
              const name = item.clothing_items?.name ?? 'Artículo';
              const brand = item.clothing_brands?.name;
              const size = item.clothing_sizes?.name;
              const parts = [name, brand, size].filter(Boolean).join(' - ');
              return `${parts} (x${item.quantity})`;
            })
            .join(', ');
        },
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
        searchParams={searchParams}
        paramNamespace={tableId}
        tableId={tableId}
        queryFn={tableQueryFn}
        queryKey={[...queryKey]}
        onStateChange={handleStateChange}
        facetedFilters={facetedFilters}
        initialFilterVisibility={mergedFilterVisibility}
        initialColumnVisibility={mergedColumnVisibility}
        searchPlaceholder="Buscar por notas..."
        showFilterToggle={true}
        showSearch={true}
        emptyMessage="No hay entregas registradas"
        exportConfig={exportConfig}
        enableRowSelection
        showRowSelection
        onRowSelectionIdsChange={setSelectedIds}
        clearSelectionTrigger={clearTrigger}
      />
      <BulkDownloadBar selectedIds={selectedIds} onClear={clearSelection} />
    </>
  );
}
