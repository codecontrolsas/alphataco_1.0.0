'use client';

import { Skeleton } from '@/components/ui/skeleton';
import {
  CatalogCreateButton,
  CatalogFormSheet,
  CatalogTableSurface,
  useCatalogSheet,
  useCatalogSheetClose,
} from '@/shared/components/common/CatalogFormSheet';
import {
  DataTable,
  useDataTableFilter,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useQuery } from '@tanstack/react-query';
import { Check, CircleOff, Truck, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { activeStatusLabel, buildActiveFacetResult } from '../../lib/active-status';
import EquipmentTypesForm from './EquipmentTypeForm';
import {
  getAllEquipmentTypesForExport,
  getChecklistIdsForType,
  getEquipmentTypeSingleFacet,
  getEquipmentTypesPaginated,
  getHitchTypeIdsForType,
  type EquipmentTypeListItem,
} from './actions.server';
import { APPLIES_TO_LABELS, HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from './columns';
import { useEquipmentTypeStore } from './store/equipmentType.store';

/** Lleva la vista al bloque de la tabla relacionada (respeta `prefers-reduced-motion`). */
function scrollToBlock(id: string) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}

// ============================================================================
// TYPES
// ============================================================================

interface EquipmentTypeDataTableProps {
  data: EquipmentTypeListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  /** Flat permissions map from server: "module:tab:action" → boolean */
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
  /** Todos los tipos activos para el multi-select de enganche en el form */
  allActiveTypes: { id: string; name: string; is_tractor_unit: boolean | null }[];
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function _EquipmentTypeDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
  allActiveTypes,
}: EquipmentTypeDataTableProps) {
  // ── Permisos ──────────────────────────────────────────────────────────────
  const permissions = useMemo(
    () => ({
      hasPermission: (module: string, tab: string, action: string) =>
        permissionsMap[`${module}:${tab}:${action}`] === true,
    }),
    [permissionsMap]
  );

  const canCreate = permissions.hasPermission('configuracion', 'tipos', 'create');
  const canUpdate = permissions.hasPermission('configuracion', 'tipos', 'update');

  // ── Sheet de alta/edición (el form sigue leyendo el store de edición) ─────
  const setEquipmentType = useEquipmentTypeStore((state) => state.setEquipmentType);

  const handleReset = useCallback(() => {
    setEquipmentType(null);
  }, [setEquipmentType]);

  const sheet = useCatalogSheet<EquipmentTypeListItem>({
    canCreate,
    canUpdate,
    onOpenEdit: setEquipmentType,
    onOpenCreate: handleReset,
    onClosed: handleReset,
  });
  const handleEdit = sheet.openEdit;

  // ── "Ver subtipos": fija el filtro de tipo de la tabla de subtipos (mismo bloque agrupado) ──
  // 'equipment-sub-types' = tableId de EquipmentSubTypeList (namespace de la URL de esa tabla).
  const [, setSubTypeTypeFilter] = useDataTableFilter('equipment-sub-types', 'type');
  const canViewSubTypes = permissions.hasPermission('configuracion', 'subtipos', 'view');
  const handleViewSubTypes = useCallback(
    (item: EquipmentTypeListItem) => {
      setSubTypeTypeFilter(item.id);
      scrollToBlock('subtipos');
    },
    [setSubTypeTypeFilter]
  );

  // ── Client-side navigation mode ───────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getEquipmentTypesPaginated(params), []);

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns = useMemo(
    () => getColumns(permissions, handleEdit, canViewSubTypes ? handleViewSubTypes : undefined),
    [permissions, handleEdit, canViewSubTypes, handleViewSubTypes]
  );

  // ── Column visibility ─────────────────────────────────────────────────────
  const mergedColumnVisibility = useMemo(() => {
    const defaults: Record<string, boolean> = {};
    for (const col of HIDDEN_COLUMNS_BY_DEFAULT) {
      defaults[col] = false;
    }
    return { ...defaults, ...(initialColumnVisibility ?? {}) };
  }, [initialColumnVisibility]);

  // ── Filter visibility — 3 visibles por defecto ─────────────────────────────
  const DEFAULT_VISIBLE_FILTERS = ['is_active', 'applies_to', 'name'];
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    const allFilterIds = ['name', 'is_active', 'applies_to', 'is_tractor_unit', 'created_at'];
    return Object.fromEntries(allFilterIds.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
  }, [initialFilterVisibility]);

  // ── Lazy-load facets ───────────────────────────────────────────────────────

  const fetchIsActiveFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getEquipmentTypeSingleFacet('is_active', params);
    if (!result) return { options: [], counts: new Map() };
    return buildActiveFacetResult(result.counts);
  }, []);

  const fetchAppliesToFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getEquipmentTypeSingleFacet('applies_to', params);
    if (!result) return { options: [], counts: new Map() };
    return {
      options: [
        { value: 'vehicle', label: APPLIES_TO_LABELS['vehicle'], icon: Truck },
        { value: 'other_equipment', label: APPLIES_TO_LABELS['other_equipment'] },
        ...(result.counts.has(NULL_FILTER_VALUE)
          ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff }]
          : []),
      ],
      counts: result.counts,
    };
  }, []);

  const fetchIsTractorUnitFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getEquipmentTypeSingleFacet('is_tractor_unit', params);
    if (!result) return { options: [], counts: new Map() };
    return {
      options: [
        { value: 'true', label: 'Sí', icon: Check },
        { value: 'false', label: 'No', icon: X },
        ...(result.counts.has(NULL_FILTER_VALUE)
          ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff }]
          : []),
      ],
      counts: result.counts,
    };
  }, []);

  // ── Faceted filters ───────────────────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      {
        columnId: 'name',
        title: 'Nombre',
        type: 'text' as const,
        placeholder: 'Buscar por nombre...',
      },
      {
        columnId: 'is_active',
        title: 'Estado',
        fetchFacet: fetchIsActiveFacet,
      },
      {
        columnId: 'applies_to',
        title: 'Aplica a',
        fetchFacet: fetchAppliesToFacet,
      },
      {
        columnId: 'is_tractor_unit',
        title: 'Unidad Tractora',
        fetchFacet: fetchIsTractorUnitFacet,
      },
      {
        columnId: 'created_at',
        title: 'Fecha de creación',
        type: 'dateRange' as const,
      },
    ],
    [fetchIsActiveFacet, fetchAppliesToFacet, fetchIsTractorUnitFacet]
  );

  // ── DataTable ─────────────────────────────────────────────────────────────
  const table = (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      queryFn={tableQueryFn}
      queryKey={['equipment-types']}
      onStateChange={handleStateChange}
      toolbarActions={<CatalogCreateButton sheet={sheet} label="Nuevo tipo" />}
      tableId={tableId}
      paramNamespace={tableId}
      facetedFilters={facetedFilters}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      showFilterToggle
      searchPlaceholder="Buscar por nombre..."
      emptyMessage="No se encontraron tipos de equipo"
      exportConfig={{
        fetchAllData: async () => unwrapExportResult(await getAllEquipmentTypesForExport(currentParams)),
        options: {
          filename: 'tipos-de-equipo',
          sheetName: 'Tipos de Equipo',
          title: 'Tipos de Equipo',
        },
        formatters: {
          is_active: (value) => activeStatusLabel(value),
          applies_to: (value) => {
            if (!value) return '—';
            return APPLIES_TO_LABELS[value as string] ?? String(value);
          },
          is_tractor_unit: (value) => {
            if (value === null || value === undefined) return '—';
            return value ? 'Sí' : 'No';
          },
          has_hitch: (value) => {
            if (value === null || value === undefined) return '—';
            return value ? 'Sí' : 'No';
          },
          is_operative: (value) => {
            if (value === null || value === undefined) return '—';
            return value ? 'Sí' : 'No';
          },
          generates_qr: (value) => {
            if (value === null || value === undefined) return '—';
            return value ? 'Sí' : 'No';
          },
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
        getKey={(type) => type.id}
        title={{ create: 'Nuevo tipo de unidad', edit: 'Editar tipo de unidad' }}
        size="xl"
      >
        {() => <EquipmentTypesFormWrapper allActiveTypes={allActiveTypes} onReset={handleReset} />}
      </CatalogFormSheet>
    </>
  );
}

// ============================================================================
// FORM WRAPPER — conecta el store Zustand al form existente
// ============================================================================

function EquipmentTypesFormWrapper({
  allActiveTypes,
  onReset,
}: {
  allActiveTypes: { id: string; name: string; is_tractor_unit: boolean | null }[];
  onReset: () => void;
}) {
  const equipmentType = useEquipmentTypeStore((state) => state.equipmentType);
  const closeSheet = useCatalogSheetClose();
  const handleClose = useCallback(() => {
    onReset();
    closeSheet();
  }, [onReset, closeSheet]);
  const typeId = equipmentType?.id ?? null;

  // Relaciones existentes del tipo. El form las toma en `defaultValues`, que solo se evaluan
  // al montar: por eso se espera a que las queries resuelvan y se remonta con `key`.
  // Esa lectura es tambien la base del delta {add, remove} que se envia al guardar.
  const { data: checklistIds = [], isLoading: isLoadingChecklists } = useQuery({
    queryKey: ['type-checklists', typeId],
    queryFn: () => getChecklistIdsForType(typeId!),
    enabled: !!typeId,
    // Alimenta el form y la base del delta: siempre datos frescos al abrir.
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  const { data: hitchTypeIds = [], isLoading: isLoadingHitchTypes } = useQuery({
    queryKey: ['type-hitch-types', typeId],
    queryFn: () => getHitchTypeIdsForType(typeId!),
    enabled: !!typeId,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  // Memoizar para evitar re-renders infinitos (estos objetos se pasan como props)
  const formInitialData = useMemo(
    () =>
      equipmentType
        ? {
            id: equipmentType.id,
            name: equipmentType.name,
            is_active: equipmentType.is_active ?? true,
            applies_to: equipmentType.applies_to ?? 'vehicle',
            is_tractor_unit: equipmentType.is_tractor_unit ?? false,
            has_hitch: equipmentType.has_hitch ?? false,
            is_operative: equipmentType.is_operative ?? false,
          }
        : null,
    [equipmentType]
  );

  // Memoizar allTypes para referencia estable
  const formAllTypes = useMemo(
    () =>
      allActiveTypes.map((t) => ({
        id: t.id,
        name: t.name,
        is_active: true,
        is_tractor_unit: t.is_tractor_unit ?? false,
      })),
    [allActiveTypes]
  );

  if (isLoadingChecklists || isLoadingHitchTypes) {
    return <FormRelationsSkeleton />;
  }

  return (
    <EquipmentTypesForm
      key={typeId ?? 'create'}
      initialData={formInitialData}
      isEditing={!!equipmentType}
      onReset={handleClose}
      allTypes={formAllTypes}
      initialChecklistIds={checklistIds}
      initialHitchTypeIds={hitchTypeIds}
    />
  );
}

/** Placeholder mientras se cargan las relaciones del tipo seleccionado. */
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
