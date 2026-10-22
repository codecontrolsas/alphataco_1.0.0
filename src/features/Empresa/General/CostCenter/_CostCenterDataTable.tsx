'use client';

import { usePermissionChecker } from '@/features/Permissions/hooks/usePermissionChecker';
import {
  CatalogCreateButton,
  CatalogFormSheet,
  CatalogTableSurface,
  useCatalogSheet,
} from '@/shared/components/common/CatalogFormSheet';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import {
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useCallback, useMemo } from 'react';
import { activeStatusLabel, buildActiveFacetResult } from '../../lib/active-status';
import CostCenterForm from '../components/cost-center/CostCenterForm';
import { useCostCenterStore } from '../components/cost-center/store/costCenter.store';
import {
  getAllCostCentersForExport,
  getCostCenterSingleFacet,
  getCostCentersPaginated,
  type CostCenterListItem,
} from './actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from './columns';

// ============================================================================
// TYPES
// ============================================================================

interface CostCenterDataTableProps {
  data: CostCenterListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  /** Flat permissions map from server: "module:tab:action" → boolean */
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

/** Filtros visibles hasta que el usuario elija otros (las preferencias guardadas tienen prioridad). */
const DEFAULT_VISIBLE_FILTERS = ['is_active', 'name', 'created_at'];

// ============================================================================
// COMPONENT
// ============================================================================

export default function _CostCenterDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: CostCenterDataTableProps) {
  // ── Permisos: helper armado desde el mapa serializable del servidor ───────────
  const permissions = usePermissionChecker(permissionsMap);

  const canCreate = permissions.hasPermission('configuracion', 'cost-center', 'create');
  const canUpdate = permissions.hasPermission('configuracion', 'cost-center', 'update');

  // ── Sheet de alta/edición (el form sigue leyendo el store de edición) ─────
  const setCostCenter = useCostCenterStore((state) => state.setCostCenter);
  const handleClearStore = useCallback(() => setCostCenter(null), [setCostCenter]);
  const sheet = useCatalogSheet<CostCenterListItem>({
    canCreate,
    canUpdate,
    onOpenEdit: setCostCenter,
    onOpenCreate: handleClearStore,
    onClosed: handleClearStore,
  });
  const handleEdit = sheet.openEdit;

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getCostCentersPaginated(params), []);

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns = useMemo(() => getColumns(permissions, handleEdit), [permissions, handleEdit]);

  // ── Lazy-load facet: is_active ─────────────────────────────────────────────
  const fetchIsActiveFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getCostCenterSingleFacet('is_active', params);
    if (!result) return { options: [], counts: new Map() };
    return buildActiveFacetResult(result.counts);
  }, []);

  // ── Faceted filters ───────────────────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      // ── is_active (booleano nullable) ──────────────────────────────────────
      {
        columnId: 'is_active',
        title: 'Estado',
        fetchFacet: fetchIsActiveFacet,
      },

      // ── name (texto libre) ─────────────────────────────────────────────────
      {
        columnId: 'name',
        title: 'Nombre',
        type: 'text' as const,
        placeholder: 'Buscar por nombre...',
      },

      // ── created_at (rango de fechas) ───────────────────────────────────────
      {
        columnId: 'created_at',
        title: 'Fecha de creación',
        type: 'dateRange' as const,
      },
    ],
    [fetchIsActiveFacet]
  );

  // ── Estado de vista: params vigentes (para exportar) y visibilidad inicial ─────
  const { currentParams, tableProps } = useServerTableView({
    searchParams,
    tableId,
    hiddenColumnsByDefault: HIDDEN_COLUMNS_BY_DEFAULT,
    defaultVisibleFilters: DEFAULT_VISIBLE_FILTERS,
    facetedFilters,
    initialColumnVisibility,
    savedFilterVisibility: initialFilterVisibility,
  });

  // ── DataTable ─────────────────────────────────────────────────────────────
  const table = (
    <DataTable
      {...tableProps}
      columns={columns}
      data={data}
      totalRows={totalRows}
      queryFn={tableQueryFn}
      queryKey={['cost-centers']}
      toolbarActions={<CatalogCreateButton sheet={sheet} label="Nuevo centro de costo" />}
      searchPlaceholder="Buscar centros de costo..."
      emptyMessage="No se encontraron centros de costo"
      exportConfig={{
        fetchAllData: async () => unwrapExportResult(await getAllCostCentersForExport(currentParams)),
        options: {
          filename: 'centros-de-costo',
          sheetName: 'Centros de Costo',
          title: 'Centros de Costo',
        },
        formatters: {
          is_active: (value) => activeStatusLabel(value),
          created_at: (value) => (value ? formatArgentinaDay(value as string | Date) : '-'),
        },
      }}
    />
  );

  return (
    <>
      <CatalogTableSurface>{table}</CatalogTableSurface>
      <CatalogFormSheet
        sheet={sheet}
        getKey={(item) => item.id}
        title={{ create: 'Nuevo centro de costo', edit: 'Editar centro de costo' }}
        size="md"
      >
        {() => <CostCenterForm />}
      </CatalogFormSheet>
    </>
  );
}
