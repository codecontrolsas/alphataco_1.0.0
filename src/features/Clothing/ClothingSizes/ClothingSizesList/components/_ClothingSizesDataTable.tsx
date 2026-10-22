'use client';

import { Button } from '@/components/ui/button';
import { toggleClothingSizeActive } from '@/features/Clothing/actions/catalog.server';
import { useCatalogTable } from '@/features/Clothing/hooks/useCatalogTable';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { createFacetFilters, dateRangeFilter, textFilter } from '@/shared/components/common/DataTable/facet-filters';
import {
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
} from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import moment from 'moment';
import { useCallback, useMemo } from 'react';
import { ClothingSizeForm } from '../../components/ClothingSizeForm';
import {
  getAllClothingSizesForExport,
  getClothingSizesPaginated,
  getClothingSizesSingleFacet,
  type ClothingSizeListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from '../columns';

// ============================================================================
// TYPES
// ============================================================================

interface ClothingSizesDataTableProps {
  data: ClothingSizeListItem[];
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

const DEFAULT_VISIBLE_FILTERS = ['is_active'];

const facets = createFacetFilters(getClothingSizesSingleFacet);

const FACETED_FILTERS: DataTableFacetedFilterConfig[] = [
  facets.fixed('is_active', 'Estado', [
    { value: 'true', label: 'Activo' },
    { value: 'false', label: 'Inactivo' },
  ]),
  textFilter('name', 'Nombre', 'Buscar por nombre...'),
  dateRangeFilter('created_at', 'Fecha de creación'),
];

const TOGGLE_MESSAGES = {
  activated: 'Talle activado',
  deactivated: 'Talle desactivado',
  error: 'Error al cambiar el estado del talle',
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function _ClothingSizesDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: ClothingSizesDataTableProps) {
  const queryClient = useQueryClient();
  const { permissions, formOpen, setFormOpen, editing, openCreate, openEdit, closeForm, handleToggleActive } =
    useCatalogTable<ClothingSizeListItem>({
      permissionsMap,
      queryKey: 'clothing-sizes',
      loggerName: '_ClothingSizesDataTable',
      toggleActive: toggleClothingSizeActive,
      messages: TOGGLE_MESSAGES,
    });

  const handleFormSuccess = useCallback(() => {
    closeForm();
    queryClient.invalidateQueries({ queryKey: ['clothing-sizes'] });
  }, [closeForm, queryClient]);

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getClothingSizesPaginated(params), []);

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

  // ─── Toolbar actions ───────────────────────────────────────────────────────
  const canCreate = permissions.hasPermission('configuracion', 'talles_indumentaria', 'create');

  const toolbarActions = canCreate ? (
    <Button variant="brand" size="sm" onClick={openCreate}>
      <Plus className="mr-2 h-4 w-4" />
      Nuevo Talle
    </Button>
  ) : undefined;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        totalRows={totalRows}
        {...tableProps}
        toolbarActions={toolbarActions}
        searchPlaceholder="Buscar talles..."
        emptyMessage="No se encontraron talles"
        queryFn={tableQueryFn}
        queryKey={['clothing-sizes']}
        exportConfig={{
          fetchAllData: () => getAllClothingSizesForExport(currentParams),
          options: {
            filename: 'talles-indumentaria',
            sheetName: 'Talles',
            title: 'Listado de Talles de Indumentaria',
          },
          formatters: {
            is_active: (value) => (value ? 'Activo' : 'Inactivo'),
            created_at: (value) => (value ? moment(value as string | Date).format('DD/MM/YYYY') : '-'),
            updated_at: (value) => (value ? moment(value as string | Date).format('DD/MM/YYYY') : '-'),
          },
        }}
      />

      <ClothingSizeForm open={formOpen} onOpenChange={setFormOpen} size={editing} onSuccess={handleFormSuccess} />
    </>
  );
}
