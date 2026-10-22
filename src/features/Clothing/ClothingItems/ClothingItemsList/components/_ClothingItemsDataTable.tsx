'use client';

import { Button } from '@/components/ui/button';
import { toggleClothingItemActive } from '@/features/Clothing/actions/catalog.server';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { Logger } from '@/lib/logger';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { type DataTableFacetedFilterConfig, type DataTableSearchParams, type FacetResult } from '@/shared/components/common/DataTable/types';
import { useQueryClient } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { Check, Plus, X } from 'lucide-react';
import moment from 'moment';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ClothingItemForm } from '../../components/ClothingItemForm';
import {
  getAllClothingItemsForExport,
  getClothingItemsPaginated,
  getClothingItemsSingleFacet,
  type ClothingItemListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from '../columns';

// ============================================================================
// LOGGER
// ============================================================================

const logger = new Logger('_ClothingItemsDataTable');

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
// HELPERS — builders para reducir boilerplate en fetchFacet
// ============================================================================

/** Construye FacetResult para enums booleanos con iconos */
function buildBooleanFacetResult(
  trueLabel: string,
  falseLabel: string,
  trueIcon: LucideIcon,
  falseIcon: LucideIcon,
  counts: Map<string, number>
): FacetResult {
  const options = [
    { value: 'true', label: trueLabel, icon: trueIcon },
    { value: 'false', label: falseLabel, icon: falseIcon },
  ];
  return { options, counts };
}

// ============================================================================
// DEFAULT VISIBLE FILTERS (max 3)
// ============================================================================

const DEFAULT_VISIBLE_FILTERS = ['is_active', 'name', 'code'];

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
  const queryClient = useQueryClient();

  // Build hasPermission helper from serializable map
  const permissions = useMemo(
    () => ({
      hasPermission: (module: string, tab: string, action: string) =>
        permissionsMap[`${module}:${tab}:${action}`] === true,
    }),
    [permissionsMap]
  );

  // ─── Form dialog state ────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ClothingItemListItem | null>(null);

  const handleCreateNew = useCallback(() => {
    setEditingItem(null);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((item: ClothingItemListItem) => {
    setEditingItem(item);
    setFormOpen(true);
  }, []);

  const handleToggleActive = useCallback(
    async (item: ClothingItemListItem) => {
      logger.debug('Toggling item active status', { data: { id: item.id, isActive: item.is_active } });
      try {
        await toggleClothingItemActive(item.id, !item.is_active);
        toast.success(item.is_active ? 'Artículo desactivado' : 'Artículo activado');
        await queryClient.invalidateQueries({ queryKey: ['clothing-items'] });
      } catch (error) {
        logger.error('Error toggling item active status', { data: { error } });
        toast.error('Error al cambiar el estado del artículo');
      }
    },
    [queryClient]
  );

  // ─── Client-side navigation ───────────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getClothingItemsPaginated(params), []);

  // ─── Lazy-load facets — factories ─────────────────────────────────────────

  const makeEnumFetchFacet = useCallback(
    (columnId: string) =>
      async (facetParams: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getClothingItemsSingleFacet(columnId, facetParams);
        if (!result) return { options: [], counts: new Map() };

        if (columnId === 'is_active') {
          return buildBooleanFacetResult('Activo', 'Inactivo', Check, X, result.counts);
        }

        return { options: [], counts: result.counts };
      },
    []
  );

  // ─── Columns ──────────────────────────────────────────────────────────────
  const columns = useMemo(
    () =>
      getColumns(permissions, {
        onEdit: handleEdit,
        onToggleActive: handleToggleActive,
      }),
    [permissions, handleEdit, handleToggleActive]
  );

  // ─── Faceted filters ──────────────────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      // name — text filter
      {
        columnId: 'name',
        title: 'Nombre',
        type: 'text' as const,
        placeholder: 'Buscar por nombre...',
      },
      // code — text filter
      {
        columnId: 'code',
        title: 'Código',
        type: 'text' as const,
        placeholder: 'Buscar por código...',
      },
      // description — text filter
      {
        columnId: 'description',
        title: 'Descripción',
        type: 'text' as const,
        placeholder: 'Buscar por descripción...',
      },
      // is_active — boolean faceted
      {
        columnId: 'is_active',
        title: 'Estado',
        fetchFacet: makeEnumFetchFacet('is_active'),
      },
      // created_at — date range
      {
        columnId: 'created_at',
        title: 'Fecha de creación',
        type: 'dateRange' as const,
      },
    ],
    [makeEnumFetchFacet]
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
        <Button size="sm" onClick={handleCreateNew} className="h-8">
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Artículo
        </Button>
      </PermissionGuard>
    ),
    [handleCreateNew]
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
        queryKey={['clothing-items']}
        onStateChange={handleStateChange}
        facetedFilters={facetedFilters}
        initialFilterVisibility={mergedFilterVisibility}
        initialColumnVisibility={mergedColumnVisibility}
        searchPlaceholder="Buscar por nombre o código..."
        showFilterToggle={true}
        showSearch={true}
        emptyMessage="No hay artículos registrados"
        exportConfig={exportConfig}
        toolbarActions={toolbarActions}
      />

      <ClothingItemForm open={formOpen} onOpenChange={setFormOpen} item={editingItem} />
    </>
  );
}
