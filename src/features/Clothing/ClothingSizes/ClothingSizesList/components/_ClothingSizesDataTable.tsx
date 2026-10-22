'use client';

import { Button } from '@/components/ui/button';
import { toggleClothingSizeActive } from '@/features/Clothing/actions/catalog.server';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { type DataTableFacetedFilterConfig, type DataTableSearchParams, type FacetResult } from '@/shared/components/common/DataTable/types';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import moment from 'moment';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
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
  // Build hasPermission helper from serializable map
  const permissions = useMemo(
    () => ({
      hasPermission: (module: string, tab: string, action: string) =>
        permissionsMap[`${module}:${tab}:${action}`] === true,
    }),
    [permissionsMap]
  );

  const queryClient = useQueryClient();

  // ─── Dialog state ──────────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [editingSize, setEditingSize] = useState<ClothingSizeListItem | null>(null);

  const handleCreate = useCallback(() => {
    setEditingSize(null);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((size: ClothingSizeListItem) => {
    setEditingSize(size);
    setFormOpen(true);
  }, []);

  const handleToggleActive = useCallback(
    async (size: ClothingSizeListItem) => {
      try {
        await toggleClothingSizeActive(size.id, !size.is_active);
        await queryClient.invalidateQueries({ queryKey: ['clothing-sizes'] });
        toast.success(size.is_active ? 'Talle desactivado' : 'Talle activado');
      } catch {
        toast.error('Error al cambiar el estado del talle');
      }
    },
    [queryClient]
  );

  const handleFormSuccess = useCallback(() => {
    setFormOpen(false);
    setEditingSize(null);
    queryClient.invalidateQueries({ queryKey: ['clothing-sizes'] });
  }, [queryClient]);

  // ─── Client-side navigation ────────────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getClothingSizesPaginated(params), []);

  // ─── Columns ──────────────────────────────────────────────────────────────
  const columns = useMemo(
    () =>
      getColumns(permissions, {
        onEdit: handleEdit,
        onToggleActive: handleToggleActive,
      }),
    [permissions, handleEdit, handleToggleActive]
  );

  // ─── Column visibility ─────────────────────────────────────────────────────
  const mergedColumnVisibility = useMemo(() => {
    const defaults: Record<string, boolean> = {};
    for (const col of HIDDEN_COLUMNS_BY_DEFAULT) {
      defaults[col] = false;
    }
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  // ─── Filter visibility (max 3 visibles por defecto) ───────────────────────
  const DEFAULT_VISIBLE_FILTERS = ['is_active'];

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    const allFilterIds = ['is_active', 'name', 'created_at'];
    return Object.fromEntries(allFilterIds.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
  }, [initialFilterVisibility]);

  // ─── Lazy-load facets ──────────────────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      {
        columnId: 'is_active',
        title: 'Estado',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getClothingSizesSingleFacet('is_active', params);
          if (!result) return { options: [], counts: new Map() };
          return {
            options: [
              { value: 'true', label: 'Activo' },
              { value: 'false', label: 'Inactivo' },
            ],
            counts: result.counts,
          };
        },
      },
      {
        columnId: 'name',
        title: 'Nombre',
        type: 'text' as const,
        placeholder: 'Buscar por nombre...',
      },
      {
        columnId: 'created_at',
        title: 'Fecha de creación',
        type: 'dateRange' as const,
      },
    ],
    []
  );

  // ─── Toolbar actions ───────────────────────────────────────────────────────
  const canCreate = permissions.hasPermission('configuracion', 'talles_indumentaria', 'create');

  const toolbarActions = canCreate ? (
    <Button variant="brand" size="sm" onClick={handleCreate}>
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
        searchParams={searchParams}
        tableId={tableId}
        paramNamespace={tableId}
        facetedFilters={facetedFilters}
        initialColumnVisibility={mergedColumnVisibility}
        initialFilterVisibility={mergedFilterVisibility}
        toolbarActions={toolbarActions}
        showFilterToggle
        searchPlaceholder="Buscar talles..."
        emptyMessage="No se encontraron talles"
        queryFn={tableQueryFn}
        queryKey={['clothing-sizes']}
        onStateChange={handleStateChange}
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

      <ClothingSizeForm open={formOpen} onOpenChange={setFormOpen} size={editingSize} onSuccess={handleFormSuccess} />
    </>
  );
}
