'use client';

import { Skeleton } from '@/components/ui/skeleton';
import {
  CatalogCreateButton,
  CatalogFormSheet,
  CatalogTableSurface,
  useCatalogSheet,
  useCatalogSheetClose,
} from '@/shared/components/common/CatalogFormSheet';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { type DataTableFacetedFilterConfig, type DataTableSearchParams, type FacetResult } from '@/shared/components/common/DataTable/types';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleOff } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { activeStatusLabel, buildActiveFacetResult } from '../../lib/active-status';
import EquipmentSubTypesForm from './EquipmentSubTypeForm';
import {
  getActiveEquipmentTypes,
  getAllEquipmentSubTypesForExport,
  getCompatibleItemsForSubTypePrisma,
  getEquipmentSubTypeSingleFacet,
  getEquipmentSubTypesPaginated,
  type EquipmentSubTypeListItem,
} from './actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from './columns';
import { useSubTypeChecklists } from './hooks/useSubTypeChecklists';

// ============================================================================
// TYPES
// ============================================================================

interface EquipmentSubTypeDataTableProps {
  data: EquipmentSubTypeListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  /** Flat permissions map from server: "module:tab:action" → boolean */
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

// ============================================================================
// FORM WRAPPER — adapta el formulario existente al nuevo contexto
// ============================================================================

interface FormWrapperProps {
  editingItem: EquipmentSubTypeListItem | null;
  onReset: () => void;
}

/**
 * Wrapper que provee los datos necesarios al formulario existente.
 * Carga tipos de unidad via React Query + server action (sin Supabase).
 */
function EquipmentSubTypesFormWrapper({ editingItem, onReset }: FormWrapperProps) {
  const queryClient = useQueryClient();
  const closeSheet = useCatalogSheetClose();
  const handleClose = useCallback(() => {
    onReset();
    closeSheet();
  }, [onReset, closeSheet]);
  const subTypeId = editingItem?.id ?? null;

  // Cargar tipos de unidad via server action (reemplaza FetchTypeOfVehicles con Supabase)
  const { data: types = [] } = useQuery({
    queryKey: ['equipment-types-active'],
    queryFn: () => getActiveEquipmentTypes(),
    staleTime: 5 * 60 * 1000,
  });

  // Relaciones existentes del subtipo. El form las toma en `defaultValues`, que solo se evaluan
  // al montar: por eso se espera a que las queries resuelvan y se remonta con `key`.
  // Esa lectura es tambien la base del delta {add, remove} que se envia al guardar.
  const { data: checklistIds = [], isLoading: isLoadingChecklists } = useSubTypeChecklists(subTypeId);

  const { data: compatibleRows = [], isLoading: isLoadingCompatibleItems } = useQuery({
    queryKey: ['subtype-compatible-items', subTypeId],
    queryFn: () => getCompatibleItemsForSubTypePrisma(subTypeId!),
    enabled: !!subTypeId,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  const compatibleItems = useMemo(
    () =>
      compatibleRows.map((row) => ({
        id: row.compatible_item_id,
        type: row.item_type as 'sub_type' | 'type',
      })),
    [compatibleRows]
  );

  const handleSuccess = useCallback(() => {
    // Invalidar la tabla y las relaciones para refrescar los datos
    queryClient.invalidateQueries({ queryKey: ['equipment-sub-types'] });
    queryClient.invalidateQueries({ queryKey: ['subtype-compatible-items', subTypeId] });
  }, [queryClient, subTypeId]);

  const formInitialData = useMemo(
    () =>
      editingItem
        ? {
            id: editingItem.id,
            name: editingItem.name,
            is_active: editingItem.is_active,
            type: editingItem.type,
          }
        : null,
    [editingItem]
  );

  if (isLoadingChecklists || isLoadingCompatibleItems) {
    return <FormRelationsSkeleton />;
  }

  return (
    <EquipmentSubTypesForm
      key={subTypeId ?? 'create'}
      initialData={formInitialData}
      onReset={handleClose}
      isEditing={!!editingItem}
      onSuccess={handleSuccess}
      types={types}
      initialChecklistIds={checklistIds}
      initialCompatibleItems={compatibleItems}
    />
  );
}

/** Placeholder mientras se cargan las relaciones del subtipo seleccionado. */
function FormRelationsSkeleton() {
  return (
    <div className="space-y-4 p-1">
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-9 w-1/2" />
    </div>
  );
}

// ============================================================================
// MAIN CLIENT COMPONENT
// ============================================================================

export default function _EquipmentSubTypeDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: EquipmentSubTypeDataTableProps) {
  // ── Permisos: construir helper desde el map serializable del servidor ────────
  const permissions = useMemo(
    () => ({
      hasPermission: (module: string, tab: string, action: string) =>
        permissionsMap[`${module}:${tab}:${action}`] === true,
    }),
    [permissionsMap]
  );

  const canCreate = permissions.hasPermission('configuracion', 'subtipos', 'create');
  const canUpdate = permissions.hasPermission('configuracion', 'subtipos', 'update');

  // ── Sheet de alta/edición (el form sigue leyendo el estado de edición local) ─
  const [editingItem, setEditingItem] = useState<EquipmentSubTypeListItem | null>(null);

  const handleReset = useCallback(() => {
    setEditingItem(null);
  }, []);

  const sheet = useCatalogSheet<EquipmentSubTypeListItem>({
    canCreate,
    canUpdate,
    onOpenEdit: setEditingItem,
    onOpenCreate: handleReset,
    onClosed: handleReset,
  });
  const handleEdit = sheet.openEdit;

  // ── Client-side navigation mode ──────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getEquipmentSubTypesPaginated(params), []);

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
  const DEFAULT_VISIBLE_FILTERS = ['is_active', 'type', 'name'];
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    const allFilterIds = ['name', 'type', 'is_active', 'created_at'];
    return Object.fromEntries(allFilterIds.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
  }, [initialFilterVisibility]);

  // ── Lazy-load facet: is_active ─────────────────────────────────────────────
  const fetchIsActiveFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getEquipmentSubTypeSingleFacet('is_active', params);
    if (!result) return { options: [], counts: new Map() };
    return buildActiveFacetResult(result.counts);
  }, []);

  // ── Lazy-load facet: type (FK UUID — Tipo de Unidad) ───────────────────────
  const fetchTypeFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getEquipmentSubTypeSingleFacet('type', params);
    if (!result) return { options: [], counts: new Map() };
    const options = [
      ...(result.options ?? []),
      ...(result.counts.has(NULL_FILTER_VALUE)
        ? [{ value: NULL_FILTER_VALUE, label: 'Sin tipo', icon: CircleOff }]
        : []),
    ];
    return { options, counts: result.counts };
  }, []);

  // ── Faceted filters ───────────────────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      // ── name (texto libre) ─────────────────────────────────────────────────
      {
        columnId: 'name',
        title: 'Nombre',
        type: 'text' as const,
        placeholder: 'Buscar por nombre...',
      },

      // ── type (FK UUID — Tipo de Unidad) ────────────────────────────────────
      {
        columnId: 'type',
        title: 'Tipo de Unidad',
        fetchFacet: fetchTypeFacet,
      },

      // ── is_active (booleano nullable) ──────────────────────────────────────
      {
        columnId: 'is_active',
        title: 'Estado',
        fetchFacet: fetchIsActiveFacet,
      },

      // ── created_at (rango de fechas) ───────────────────────────────────────
      {
        columnId: 'created_at',
        title: 'Fecha de creación',
        type: 'dateRange' as const,
      },
    ],
    [fetchIsActiveFacet, fetchTypeFacet]
  );

  // ── DataTable ─────────────────────────────────────────────────────────────
  const table = (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      queryFn={tableQueryFn}
      queryKey={['equipment-sub-types']}
      onStateChange={handleStateChange}
      toolbarActions={<CatalogCreateButton sheet={sheet} label="Nuevo subtipo" />}
      tableId={tableId}
      paramNamespace={tableId}
      facetedFilters={facetedFilters}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      showFilterToggle
      searchPlaceholder="Buscar subtipos..."
      emptyMessage="No se encontraron subtipos de equipos"
      exportConfig={{
        fetchAllData: async () => unwrapExportResult(await getAllEquipmentSubTypesForExport(currentParams)),
        options: {
          filename: 'subtipos-equipos',
          sheetName: 'Subtipos',
          title: 'Subtipos de Equipos',
        },
        formatters: {
          // La columna 'type' usa accessorFn que retorna el nombre — sin formatter necesario
          // para el nombre. Pero exportamos el nombre directamente via la FK resolved.
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
        getKey={(subType) => subType.id}
        title={{ create: 'Nuevo subtipo de unidad', edit: 'Editar subtipo de unidad' }}
        size="xl"
      >
        {() => <EquipmentSubTypesFormWrapper editingItem={editingItem} onReset={handleReset} />}
      </CatalogFormSheet>
    </>
  );
}
