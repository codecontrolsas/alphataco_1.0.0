'use client';

import { Button } from '@/components/ui/button';
import { toggleClothingItemActive } from '@/features/Clothing/actions/catalog.server';
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
import { ClothingItemForm } from '../../components/ClothingItemForm';
import {
  getAllClothingItemsForExport,
  getClothingItemsPaginated,
  getClothingItemsSingleFacet,
  type ClothingItemListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from '../columns';

// ============================================================================
// TYPES
// ============================================================================

interface ClothingItemsDataTableProps {
  data: ClothingItemListItem[];
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

const DEFAULT_VISIBLE_FILTERS = ['is_active', 'name', 'code'];

const facets = createFacetFilters(getClothingItemsSingleFacet);

const FACETED_FILTERS: DataTableFacetedFilterConfig[] = [
  textFilter('name', 'Nombre', 'Buscar por nombre...'),
  textFilter('code', 'Código', 'Buscar por código...'),
  textFilter('description', 'Descripción', 'Buscar por descripción...'),
  facets.fixed('is_active', 'Estado', ACTIVE_STATUS_OPTIONS),
  dateRangeFilter('created_at', 'Fecha de creación'),
];

const TOGGLE_MESSAGES = {
  activated: 'Artículo activado',
  deactivated: 'Artículo desactivado',
  error: 'Error al cambiar el estado del artículo',
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function _ClothingItemsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: ClothingItemsDataTableProps) {
  const { permissions, formOpen, setFormOpen, editing, openCreate, openEdit, handleToggleActive } =
    useCatalogTable<ClothingItemListItem>({
      permissionsMap,
      queryKey: 'clothing-items',
      loggerName: '_ClothingItemsDataTable',
      toggleActive: toggleClothingItemActive,
      messages: TOGGLE_MESSAGES,
    });

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getClothingItemsPaginated(params), []);

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
      fetchAllData: () => getAllClothingItemsForExport(currentParams),
      options: {
        filename: 'articulos-indumentaria',
        sheetName: 'Artículos',
        title: 'Artículos de Indumentaria',
      },
      formatters: {
        is_active: (val: unknown) => (val ? 'Activo' : 'Inactivo'),
        created_at: (val: unknown) => (val ? moment(val as Date).format('DD/MM/YYYY') : '-'),
        code: (val: unknown) => (val ? String(val) : '-'),
        description: (val: unknown) => (val ? String(val) : '-'),
      },
    }),
    [currentParams]
  );

  // ─── Toolbar actions ──────────────────────────────────────────────────────
  const toolbarActions = useMemo(
    () => (
      <PermissionGuard module="configuracion" tab="articulos_indumentaria" action="create">
        <Button size="sm" onClick={openCreate} className="h-8">
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Artículo
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
        queryKey={['clothing-items']}
        searchPlaceholder="Buscar por nombre o código..."
        showSearch={true}
        emptyMessage="No hay artículos registrados"
        exportConfig={exportConfig}
        toolbarActions={toolbarActions}
      />

      <ClothingItemForm open={formOpen} onOpenChange={setFormOpen} item={editing} />
    </>
  );
}
