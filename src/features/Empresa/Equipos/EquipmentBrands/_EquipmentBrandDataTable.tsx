'use client';

import {
  CatalogCreateButton,
  CatalogFormSheet,
  CatalogTableSurface,
  useCatalogSheet,
} from '@/shared/components/common/CatalogFormSheet';
import {
  DataTable,
  useDataTableFilter,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useCallback, useMemo, useState } from 'react';
import { activeStatusLabel, buildActiveFacetResult } from '../../lib/active-status';
import EquipmentBrandForm from './EquipmentBrandForm';
import {
  getAllEquipmentBrandsForExport,
  getEquipmentBrandSingleFacet,
  getEquipmentBrandsPaginated,
  type EquipmentBrandListItem,
} from './actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from './columns';
import { useEquipmentBrandStore } from './store/equipmentBrand.store';

/** Lleva la vista al bloque de la tabla relacionada (respeta `prefers-reduced-motion`). */
function scrollToBlock(id: string) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}

// ============================================================================
// TYPES
// ============================================================================

interface EquipmentBrandDataTableProps {
  data: EquipmentBrandListItem[];
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

export default function _EquipmentBrandDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: EquipmentBrandDataTableProps) {
  // ── Permisos: construir helper desde el map serializable del servidor ────────
  const permissions = useMemo(
    () => ({
      hasPermission: (module: string, tab: string, action: string) =>
        permissionsMap[`${module}:${tab}:${action}`] === true,
    }),
    [permissionsMap]
  );

  const canCreate = permissions.hasPermission('configuracion', 'marcas', 'create');
  const canUpdate = permissions.hasPermission('configuracion', 'marcas', 'update');

  // ── Sheet de alta/edición (el form sigue leyendo el store de edición) ─────
  const setEquipmentBrand = useEquipmentBrandStore((state) => state.setEquipmentBrand);
  const handleClearStore = useCallback(() => setEquipmentBrand(null), [setEquipmentBrand]);
  const sheet = useCatalogSheet<EquipmentBrandListItem>({
    canCreate,
    canUpdate,
    onOpenEdit: setEquipmentBrand,
    onOpenCreate: handleClearStore,
    onClosed: handleClearStore,
  });
  const handleEdit = sheet.openEdit;

  // ── "Ver modelos": fija el filtro de marca de la tabla de modelos (mismo bloque agrupado) ──
  // 'equipment-models' = tableId de EquipmentModelList (namespace de la URL de esa tabla).
  const [, setModelBrandFilter] = useDataTableFilter('equipment-models', 'brand');
  const canViewModels = permissions.hasPermission('configuracion', 'modelos', 'view');
  const handleViewModels = useCallback(
    (item: EquipmentBrandListItem) => {
      setModelBrandFilter(String(item.id));
      scrollToBlock('modelos');
    },
    [setModelBrandFilter]
  );

  // ── Client-side navigation mode ──────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getEquipmentBrandsPaginated(params), []);

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns = useMemo(
    () => getColumns(permissions, handleEdit, canViewModels ? handleViewModels : undefined),
    [permissions, handleEdit, canViewModels, handleViewModels]
  );

  // ── Column visibility ─────────────────────────────────────────────────────
  const mergedColumnVisibility = useMemo(() => {
    const defaults: Record<string, boolean> = {};
    for (const col of HIDDEN_COLUMNS_BY_DEFAULT) {
      defaults[col] = false;
    }
    return { ...defaults, ...(initialColumnVisibility ?? {}) };
  }, [initialColumnVisibility]);

  // ── Filter visibility — 3 visibles por defecto ────────────────────────────
  const DEFAULT_VISIBLE_FILTERS = ['is_active', 'name', 'created_at'];
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    const allFilterIds = ['name', 'is_active', 'created_at'];
    return Object.fromEntries(allFilterIds.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
  }, [initialFilterVisibility]);

  // ── Lazy-load facet: is_active ─────────────────────────────────────────────
  const fetchIsActiveFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getEquipmentBrandSingleFacet('is_active', params);
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

  // ── DataTable ─────────────────────────────────────────────────────────────
  const table = (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      queryFn={tableQueryFn}
      queryKey={['equipment-brands']}
      onStateChange={handleStateChange}
      toolbarActions={<CatalogCreateButton sheet={sheet} label="Nueva marca" />}
      tableId={tableId}
      paramNamespace={tableId}
      facetedFilters={facetedFilters}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      showFilterToggle
      searchPlaceholder="Buscar marcas de equipos..."
      emptyMessage="No se encontraron marcas de equipos"
      exportConfig={{
        fetchAllData: async () => unwrapExportResult(await getAllEquipmentBrandsForExport(currentParams)),
        options: {
          filename: 'marcas-de-equipos',
          sheetName: 'Marcas de Equipos',
          title: 'Marcas de Equipos',
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
        getKey={(brand) => brand.id}
        title={{ create: 'Nueva marca', edit: 'Editar marca' }}
        size="md"
      >
        {() => <EquipmentBrandForm />}
      </CatalogFormSheet>
    </>
  );
}
