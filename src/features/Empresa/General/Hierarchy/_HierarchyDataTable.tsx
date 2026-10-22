'use client';

import { usePermissionChecker } from '@/features/Permissions/hooks/usePermissionChecker';
import {
  CatalogCreateButton,
  CatalogFormSheet,
  CatalogTableSurface,
  useCatalogSheet,
} from '@/shared/components/common/CatalogFormSheet';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import {
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { CircleOff } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { activeStatusLabel, buildActiveFacetResult } from '../../lib/active-status';
import HierarchyForm from './HierarchyForm';
import {
  getAllHierarchiesForExport,
  getHierarchiesPaginated,
  getHierarchySingleFacet,
  type HierarchyListItem,
} from './actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, ROOT_SECTOR_LABEL, getColumns } from './columns';
import { useHierarchyStore } from './store/hierarchy.store';

// ============================================================================
// TYPES
// ============================================================================

interface HierarchyDataTableProps {
  data: HierarchyListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  /** Flat permissions map from server: "module:tab:action" → boolean */
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

/** Filtros visibles hasta que el usuario elija otros (las preferencias guardadas tienen prioridad). */
const DEFAULT_VISIBLE_FILTERS = ['is_active', 'parent', 'name'];

// ============================================================================
// COMPONENT
// ============================================================================

export default function _HierarchyDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: HierarchyDataTableProps) {
  // ── Permisos: helper armado desde el mapa serializable del servidor ───────────
  const permissions = usePermissionChecker(permissionsMap);

  const canCreate = permissions.hasPermission('configuracion', 'organigrama', 'create');
  const canUpdate = permissions.hasPermission('configuracion', 'organigrama', 'update');

  // ── Sheet de alta/edición (el form sigue leyendo el store de edición) ─────
  const setHierarchy = useHierarchyStore((state) => state.setHierarchy);
  const handleClearStore = useCallback(() => setHierarchy(null), [setHierarchy]);
  const sheet = useCatalogSheet<HierarchyListItem>({
    canCreate,
    canUpdate,
    onOpenEdit: setHierarchy,
    onOpenCreate: handleClearStore,
    onClosed: handleClearStore,
  });
  const handleEdit = sheet.openEdit;

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getHierarchiesPaginated(params), []);

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns = useMemo(() => getColumns(permissions, handleEdit), [permissions, handleEdit]);

  // ── Lazy-load facet: is_active ─────────────────────────────────────────────
  const fetchIsActiveFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getHierarchySingleFacet('is_active', params);
    if (!result) return { options: [], counts: new Map() };
    return buildActiveFacetResult(result.counts);
  }, []);

  // ── Lazy-load facet: parent (FK "Depende de") ──────────────────────────────
  const fetchParentFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getHierarchySingleFacet('parent', params);
    if (!result) return { options: [], counts: new Map() };
    return {
      // El servidor no puede serializar iconos: el de "sector raíz" se agrega acá
      options: result.options.map((o) => (o.value === NULL_FILTER_VALUE ? { ...o, icon: CircleOff } : o)),
      counts: result.counts,
    };
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

      // ── parent (FK nullable) ───────────────────────────────────────────────
      {
        columnId: 'parent',
        title: 'Depende de',
        fetchFacet: fetchParentFacet,
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
    [fetchIsActiveFacet, fetchParentFacet]
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
      queryKey={['hierarchy']}
      toolbarActions={<CatalogCreateButton sheet={sheet} label="Nuevo sector" />}
      searchPlaceholder="Buscar sectores..."
      emptyMessage="No se encontraron sectores"
      exportConfig={{
        fetchAllData: async () => unwrapExportResult(await getAllHierarchiesForExport(currentParams)),
        options: {
          filename: 'sectores',
          sheetName: 'Sectores',
          title: 'Sectores',
        },
        formatters: {
          parent: (value) => (value ? String(value) : ROOT_SECTOR_LABEL),
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
        title={{ create: 'Nuevo sector', edit: 'Editar sector' }}
        size="md"
      >
        {() => <HierarchyForm />}
      </CatalogFormSheet>
    </>
  );
}
