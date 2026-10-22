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
import { useCallback, useMemo, useState } from 'react';
import { activeStatusLabel, buildActiveFacetResult } from '../../lib/active-status';
import EquipmentModelForm from './EquipmentModelForm';
import {
  getAllEquipmentModelsForExport,
  getEquipmentModelSingleFacet,
  getEquipmentModelsPaginated,
  type EquipmentModelListItem,
} from './actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from './columns';

// ============================================================================
// TYPES
// ============================================================================

interface EquipmentModelDataTableProps {
  data: EquipmentModelListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  /** Flat permissions map from server: "module:tab:action" → boolean */
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

/** Filtros visibles hasta que el usuario elija otros (las preferencias guardadas tienen prioridad). */
const DEFAULT_VISIBLE_FILTERS = ['is_active', 'brand', 'name'];

// ============================================================================
// COMPONENT
// ============================================================================

export default function _EquipmentModelDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: EquipmentModelDataTableProps) {
  // ── Permisos: helper armado desde el mapa serializable del servidor ───────────
  const permissions = usePermissionChecker(permissionsMap);

  const canCreate = permissions.hasPermission('configuracion', 'modelos', 'create');
  const canUpdate = permissions.hasPermission('configuracion', 'modelos', 'update');

  // ── Sheet de alta/edición (el form sigue leyendo el estado de edición local) ─
  const [editingItem, setEditingItem] = useState<EquipmentModelListItem | null>(null);

  const handleReset = useCallback(() => {
    setEditingItem(null);
  }, []);

  const sheet = useCatalogSheet<EquipmentModelListItem>({
    canCreate,
    canUpdate,
    onOpenEdit: setEditingItem,
    onOpenCreate: handleReset,
    onClosed: handleReset,
  });
  const handleEdit = sheet.openEdit;

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getEquipmentModelsPaginated(params), []);

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns = useMemo(() => getColumns(permissions, handleEdit), [permissions, handleEdit]);

  // ── Lazy-load facet: is_active ─────────────────────────────────────────────
  const fetchIsActiveFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getEquipmentModelSingleFacet('is_active', params);
    if (!result) return { options: [], counts: new Map() };
    return buildActiveFacetResult(result.counts);
  }, []);

  // ── Lazy-load facet: brand ─────────────────────────────────────────────────
  const fetchBrandFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getEquipmentModelSingleFacet('brand', params);
    if (!result) return { options: [], counts: new Map() };
    // Las opciones ya vienen resueltas con nombres desde el server
    const options = result.options.map((o) => ({
      ...o,
      ...(o.value === NULL_FILTER_VALUE ? { icon: CircleOff } : {}),
    }));
    return { options, counts: result.counts };
  }, []);

  // ── Faceted filters ───────────────────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      // ── brand (FK BigInt nullable) ──────────────────────────────────────────
      {
        columnId: 'brand',
        title: 'Marca',
        fetchFacet: fetchBrandFacet,
      },

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
    [fetchBrandFacet, fetchIsActiveFacet]
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
      queryKey={['equipment-models']}
      toolbarActions={<CatalogCreateButton sheet={sheet} label="Nuevo modelo" />}
      searchPlaceholder="Buscar modelos de equipos..."
      emptyMessage="No se encontraron modelos de equipos"
      exportConfig={{
        fetchAllData: async () => unwrapExportResult(await getAllEquipmentModelsForExport(currentParams)),
        options: {
          filename: 'modelos-de-equipos',
          sheetName: 'Modelos',
          title: 'Modelos de Equipos',
        },
        formatters: {
          // FK brand: accessorFn ya retorna el nombre, no necesita formatter
          // brand_vehicles: no es columna exportable directa
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
        getKey={(model) => model.id}
        title={{ create: 'Nuevo modelo de unidad', edit: 'Editar modelo de unidad' }}
        size="lg"
      >
        {({ close }) => <EquipmentModelForm editingItem={editingItem} onReset={close} />}
      </CatalogFormSheet>
    </>
  );
}
