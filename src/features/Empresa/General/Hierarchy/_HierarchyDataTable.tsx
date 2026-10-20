'use client';

import {
  CatalogCreateButton,
  CatalogFormSheet,
  CatalogTableSurface,
  useCatalogSheet,
} from '@/shared/components/common/CatalogFormSheet';
import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { CircleOff } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
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
  // ── Permisos: construir helper desde el map serializable del servidor ────────
  const permissions = useMemo(
    () => ({
      hasPermission: (module: string, tab: string, action: string) =>
        permissionsMap[`${module}:${tab}:${action}`] === true,
    }),
    [permissionsMap]
  );

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

  // ── Client-side navigation mode ──────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getHierarchiesPaginated(params), []);

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns = useMemo(() => getColumns(permissions, handleEdit), [permissions, handleEdit]);

  // ── Column visibility ─────────────────────────────────────────────────────
  const mergedColumnVisibility = useMemo(() => {
    const defaults: Record<string, boolean> = {};
    for (const col of HIDDEN_COLUMNS_BY_DEFAULT) {
      defaults[col] = false;
    }
    return { ...defaults, ...(initialColumnVisibility ?? {}) };
  }, [initialColumnVisibility]);

  // ── Filter visibility — 3 visibles por defecto ────────────────────────────
  const DEFAULT_VISIBLE_FILTERS = ['is_active', 'parent', 'name'];
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    const allFilterIds = ['is_active', 'parent', 'name', 'created_at'];
    return Object.fromEntries(allFilterIds.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
  }, [initialFilterVisibility]);

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

  // ── DataTable ─────────────────────────────────────────────────────────────
  const table = (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      queryFn={tableQueryFn}
      queryKey={['hierarchy']}
      onStateChange={handleStateChange}
      toolbarActions={<CatalogCreateButton sheet={sheet} label="Nuevo sector" />}
      tableId={tableId}
      paramNamespace={tableId}
      facetedFilters={facetedFilters}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      showFilterToggle
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
