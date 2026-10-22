'use client';

import { DeliveriesTable } from '@/features/Clothing/components/DeliveriesTable';
import { deliveryStatusOptions } from '@/features/Clothing/components/DeliveryStatusBadge';
import {
  DELIVERY_EXPORT_FORMATTERS,
  deliveryTypeOptions,
  formatFileForExport,
} from '@/features/Clothing/lib/delivery-table-config';
import { usePermissionChecker } from '@/features/Permissions/hooks/usePermissionChecker';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { createFacetFilters, dateRangeFilter, textFilter } from '@/shared/components/common/DataTable/facet-filters';
import {
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
} from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { Check, X } from 'lucide-react';
import moment from 'moment';
import { useCallback, useMemo } from 'react';
import {
  getAllClothingReportsForExport,
  getClothingReportsPaginated,
  getClothingReportsSingleFacet,
  type ClothingReportListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from '../columns';

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
// DEFAULT VISIBLE FILTERS (max 3)
// ============================================================================

const DEFAULT_VISIBLE_FILTERS = ['delivery_type', 'employee', 'delivered_at'];

const facets = createFacetFilters(getClothingReportsSingleFacet);

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
  const { hasPermission } = usePermissionChecker(permissionsMap);
  const canViewPrices = hasPermission('almacenes', 'movimientos', 'view_prices');
  const canCancel = hasPermission('empleados', 'indumentaria_empleado', 'delete');
  const queryKey = useMemo(() => ['clothing-reports'] as const, []);

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getClothingReportsPaginated(params), []);

  // ─── Columns ──────────────────────────────────────────────────────────────
  const columns = useMemo(
    () => getColumns({ canViewPrices, canCancel, queryKey }),
    [canViewPrices, canCancel, queryKey]
  );

  // ─── Faceted filters ──────────────────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      dateRangeFilter('delivered_at', 'Fecha de entrega'),
      textFilter('employee_file', 'Legajo Receptor', 'Buscar por legajo...'),
      facets.lookup('employee', 'Empleado'),
      textFilter('delivered_by_file', 'Legajo Entregado por', 'Buscar por legajo...'),
      facets.lookup('delivered_by', 'Entregado por'),
      facets.fixed('delivery_type', 'Tipo de entrega', deliveryTypeOptions),
      facets.fixed('has_signature', 'Firma', [
        { value: 'true', label: 'Con firma', icon: Check },
        { value: 'false', label: 'Sin firma', icon: X },
      ]),
      facets.fixed('status', 'Estado', deliveryStatusOptions),
      facets.lookup('warehouse', 'Depósito', undefined, { label: 'Sin asignar' }),
      // Costo: importe exacto, solo con view_prices
      ...(canViewPrices ? [textFilter('cost', 'Costo', 'Importe exacto, ej. 15000,50')] : []),
      textFilter('notes', 'Notas', 'Buscar por notas...'),
      dateRangeFilter('created_at', 'Fecha de registro'),
    ],
    [canViewPrices]
  );

  const { currentParams, tableProps } = useServerTableView({
    searchParams,
    tableId,
    hiddenColumnsByDefault: HIDDEN_COLUMNS_BY_DEFAULT,
    defaultVisibleFilters: DEFAULT_VISIBLE_FILTERS,
    facetedFilters,
    initialColumnVisibility,
    savedFilterVisibility: initialFilterVisibility,
  });

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
        ...DELIVERY_EXPORT_FORMATTERS,
        created_at: (val: unknown) => (val ? moment(val as Date).format('DD/MM/YYYY') : '-'),
        warehouse: (val: unknown) => (val ? String(val) : '-'),
        cost: (val: unknown) => (val != null ? formatMoney(String(val)) : 'Sin costo'),
        employee_file: formatFileForExport,
        delivered_by_file: formatFileForExport,
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
    <DeliveriesTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      {...tableProps}
      queryFn={tableQueryFn}
      queryKey={[...queryKey]}
      searchPlaceholder="Buscar por notas..."
      emptyMessage="No hay entregas registradas"
      exportConfig={exportConfig}
    />
  );
}
