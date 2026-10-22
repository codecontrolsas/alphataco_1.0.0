'use client';

import { Button } from '@/components/ui/button';
import { toggleClothingBrandActive } from '@/features/Clothing/actions/catalog.server';
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
import {
  getAllClothingBrandsForExport,
  getClothingBrandsPaginated,
  getClothingBrandsSingleFacet,
  type ClothingBrandListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from '../columns';
import { ClothingBrandForm } from './ClothingBrandForm';

// ============================================================================
// LOGGER
// ============================================================================

const logger = new Logger('_ClothingBrandsDataTable');

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

const DEFAULT_VISIBLE_FILTERS = ['is_active', 'name', 'created_at'];

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
  const [editingBrand, setEditingBrand] = useState<ClothingBrandListItem | null>(null);

  const handleCreateNew = useCallback(() => {
    setEditingBrand(null);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((brand: ClothingBrandListItem) => {
    setEditingBrand(brand);
    setFormOpen(true);
  }, []);

  const handleToggleActive = useCallback(
    async (brand: ClothingBrandListItem) => {
      logger.debug('Toggling brand active status', { data: { id: brand.id, isActive: brand.is_active } });
      try {
        await toggleClothingBrandActive(brand.id, !brand.is_active);
        toast.success(brand.is_active ? 'Marca desactivada' : 'Marca activada');
        await queryClient.invalidateQueries({ queryKey: ['clothing-brands'] });
      } catch (error) {
        logger.error('Error toggling brand active status', { data: { error } });
        toast.error('Error al cambiar el estado de la marca');
      }
    },
    [queryClient]
  );

  // ─── Client-side navigation ───────────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getClothingBrandsPaginated(params), []);

  // ─── Lazy-load facets — factories ─────────────────────────────────────────

  const makeEnumFetchFacet = useCallback(
    (columnId: string) =>
      async (facetParams: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getClothingBrandsSingleFacet(columnId, facetParams);
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
        <Button size="sm" onClick={handleCreateNew} className="h-8">
          <Plus className="mr-2 h-4 w-4" />
          Nueva Marca
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
        queryKey={['clothing-brands']}
        onStateChange={handleStateChange}
        facetedFilters={facetedFilters}
        initialFilterVisibility={mergedFilterVisibility}
        initialColumnVisibility={mergedColumnVisibility}
        searchPlaceholder="Buscar por nombre..."
        showFilterToggle={true}
        showSearch={true}
        emptyMessage="No hay marcas registradas"
        exportConfig={exportConfig}
        toolbarActions={toolbarActions}
      />

      <ClothingBrandForm open={formOpen} onOpenChange={setFormOpen} brand={editingBrand} />
    </>
  );
}
