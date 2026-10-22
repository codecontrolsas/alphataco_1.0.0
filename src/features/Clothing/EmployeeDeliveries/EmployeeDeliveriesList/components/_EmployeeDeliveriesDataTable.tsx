'use client';

import { Button } from '@/components/ui/button';
import { DeliveriesTable } from '@/features/Clothing/components/DeliveriesTable';
import { deliveryStatusOptions } from '@/features/Clothing/components/DeliveryStatusBadge';
import {
  DELIVERY_EXPORT_FORMATTERS,
  deliveryTypeOptions,
  formatFileForExport,
  signatureFilterFromRows,
} from '@/features/Clothing/lib/delivery-table-config';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { usePermissionChecker } from '@/features/Permissions/hooks/usePermissionChecker';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { Logger } from '@/lib/logger';
import { createFacetFilters, dateRangeFilter, textFilter } from '@/shared/components/common/DataTable/facet-filters';
import {
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
} from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo } from 'react';
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
  const { hasPermission } = usePermissionChecker(permissionsMap);
  const canViewPrices = hasPermission('almacenes', 'movimientos', 'view_prices');
  const canCancel = hasPermission('empleados', 'indumentaria_empleado', 'delete');
  const queryKey = useMemo(() => ['employee-deliveries', employeeId] as const, [employeeId]);

  logger.debug('Rendering employee deliveries table', { data: { employeeId, totalRows } });

  const tableQueryFn = useCallback(
    (params: DataTableSearchParams) => getEmployeeDeliveriesPaginated(employeeId, params),
    [employeeId]
  );

  // ─── Columns ──────────────────────────────────────────────────────────────
  const columns = useMemo(
    () => getColumns({ canViewPrices, canCancel, queryKey }),
    [canViewPrices, canCancel, queryKey]
  );

  // ─── Faceted filters ──────────────────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(() => {
    const facets = createFacetFilters((columnId, params) =>
      getEmployeeDeliveriesSingleFacet(columnId, employeeId, params)
    );
    return [
      dateRangeFilter('delivered_at', 'Fecha de entrega'),
      facets.fixed('delivery_type', 'Tipo de entrega', deliveryTypeOptions),
      facets.fixed('status', 'Estado', deliveryStatusOptions),
      facets.lookup('warehouse', 'Depósito', undefined, { label: 'Sin asignar' }),
      // Costo: importe exacto, solo con view_prices
      ...(canViewPrices ? [textFilter('cost', 'Costo', 'Importe exacto, ej. 15000,50')] : []),
      textFilter('delivered_by_file', 'Legajo Entregado por', 'Buscar por legajo...'),
      facets.lookup('delivered_by_id', 'Entregado por'),
      signatureFilterFromRows(data),
      textFilter('notes', 'Notas', 'Buscar en notas...'),
    ];
  }, [employeeId, canViewPrices, data]);

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
      fetchAllData: () => getAllEmployeeDeliveriesForExport(employeeId, currentParams),
      options: {
        filename: 'entregas-indumentaria',
        sheetName: 'Entregas',
        title: 'Entregas de Indumentaria',
      },
      formatters: {
        ...DELIVERY_EXPORT_FORMATTERS,
        warehouse: (val: unknown) => (val ? String(val) : '-'),
        cost: (val: unknown) => (val != null ? formatMoney(String(val)) : 'Sin costo'),
        delivered_by_file: formatFileForExport,
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
    <DeliveriesTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      {...tableProps}
      queryFn={tableQueryFn}
      queryKey={[...queryKey]}
      searchPlaceholder="Buscar en notas..."
      emptyMessage="No hay entregas registradas para este empleado"
      exportConfig={exportConfig}
      toolbarActions={toolbarActions}
    />
  );
}
