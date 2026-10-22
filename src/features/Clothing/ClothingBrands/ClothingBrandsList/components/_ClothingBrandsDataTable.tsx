'use client';

import { Button } from '@/components/ui/button';
import { toggleClothingBrandActive } from '@/features/Clothing/actions/catalog.server';
import { ACTIVE_STATUS_OPTIONS } from '@/features/Clothing/components/catalog-columns';
import { useCatalogTable } from '@/features/Clothing/hooks/useCatalogTable';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { createFacetFilters, dateRangeFilter, textFilter } from '@/shared/components/common/DataTable/facet-filters';
import {
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
} from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { Plus } from 'lucide-react';
import moment from 'moment';
import { useCallback, useMemo } from 'react';
import {
  getAllClothingBrandsForExport,
  getClothingBrandsPaginated,
  getClothingBrandsSingleFacet,
  type ClothingBrandListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from '../columns';
import { ClothingBrandForm } from './ClothingBrandForm';

// ============================================================================
// TYPES
// ============================================================================

interface ClothingBrandsDataTableProps {
  data: ClothingBrandListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  /** Flat permissions map from server: "module:tab:action" → boolean */
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

// ============================================================================
// FILTERS
// ============================================================================

const DEFAULT_VISIBLE_FILTERS = ['is_active', 'name', 'created_at'];

const facets = createFacetFilters(getClothingBrandsSingleFacet);

const FACETED_FILTERS: DataTableFacetedFilterConfig[] = [
  textFilter('name', 'Nombre', 'Buscar por nombre...'),
  facets.fixed('is_active', 'Estado', ACTIVE_STATUS_OPTIONS),
  dateRangeFilter('created_at', 'Fecha de creación'),
];

const TOGGLE_MESSAGES = {
  activated: 'Marca activada',
  deactivated: 'Marca desactivada',
  error: 'Error al cambiar el estado de la marca',
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function _ClothingBrandsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: ClothingBrandsDataTableProps) {
  const { permissions, formOpen, setFormOpen, editing, openCreate, openEdit, handleToggleActive } =
    useCatalogTable<ClothingBrandListItem>({
      permissionsMap,
      queryKey: 'clothing-brands',
      loggerName: '_ClothingBrandsDataTable',
      toggleActive: toggleClothingBrandActive,
      messages: TOGGLE_MESSAGES,
    });

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getClothingBrandsPaginated(params), []);

  // ─── Columns ──────────────────────────────────────────────────────────────
  const columns = useMemo(
    () => getColumns(permissions, { onEdit: openEdit, onToggleActive: handleToggleActive }),
    [permissions, openEdit, handleToggleActive]
  );

  const { currentParams, tableProps } = useServerTableView({
    searchParams,
    tableId,
    hiddenColumnsByDefault: HIDDEN_COLUMNS_BY_DEFAULT,
    defaultVisibleFilters: DEFAULT_VISIBLE_FILTERS,
    facetedFilters: FACETED_FILTERS,
    initialColumnVisibility,
    savedFilterVisibility: initialFilterVisibility,
  });

  // ─── Export config ────────────────────────────────────────────────────────
  const exportConfig = useMemo(
    () => ({
      fetchAllData: () => getAllClothingBrandsForExport(currentParams),
      options: {
        filename: 'marcas-indumentaria',
        sheetName: 'Marcas',
        title: 'Marcas de Indumentaria',
      },
      formatters: {
        is_active: (val: unknown) => (val ? 'Activo' : 'Inactivo'),
        created_at: (val: unknown) => (val ? moment(val as Date).format('DD/MM/YYYY') : '-'),
      },
    }),
    [currentParams]
  );

  // ─── Toolbar actions ──────────────────────────────────────────────────────
  const toolbarActions = useMemo(
    () => (
      <PermissionGuard module="configuracion" tab="marcas_indumentaria" action="create">
        <Button size="sm" onClick={openCreate} className="h-8">
          <Plus className="mr-2 h-4 w-4" />
          Nueva Marca
        </Button>
      </PermissionGuard>
    ),
    [openCreate]
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        totalRows={totalRows}
        {...tableProps}
        queryFn={tableQueryFn}
        queryKey={['clothing-brands']}
        searchPlaceholder="Buscar por nombre..."
        showSearch={true}
        emptyMessage="No hay marcas registradas"
        exportConfig={exportConfig}
        toolbarActions={toolbarActions}
      />

      <ClothingBrandForm open={formOpen} onOpenChange={setFormOpen} brand={editing} />
    </>
  );
}
