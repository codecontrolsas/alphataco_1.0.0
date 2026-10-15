'use client';

import {
  CatalogCreateButton,
  CatalogFormSheet,
  CatalogTableSurface,
  useCatalogSheet,
  type CatalogSheetMode,
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
import WorkDiagramForm from './WorkDiagramForm';
import {
  getAllWorkDiagramsForExport,
  getWorkDiagramSingleFacet,
  getWorkDiagramsPaginated,
  type DiagramTypeItem,
  type WorkDiagramListItem,
} from './actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from './columns';
import { useWorkDiagramStore } from './store/workDiagram.store';

// ============================================================================
// TYPES
// ============================================================================

export interface WorkDiagramDataTableProps {
  data: WorkDiagramListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  /** Flat permissions map from server: "module:tab:action" → boolean */
  permissionsMap: Record<string, boolean>;
  /** Tipos de diagrama para los selects del formulario */
  diagramTypes: DiagramTypeItem[];
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function _WorkDiagramDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  diagramTypes,
  initialColumnVisibility,
  initialFilterVisibility,
}: WorkDiagramDataTableProps) {
  // ── Permisos: construir helper desde el map serializable del servidor ────────
  const permissions = useMemo(
    () => ({
      hasPermission: (module: string, tab: string, action: string) =>
        permissionsMap[`${module}:${tab}:${action}`] === true,
    }),
    [permissionsMap]
  );

  const canCreate = permissions.hasPermission('configuracion', 'listado', 'create');
  const canUpdate = permissions.hasPermission('configuracion', 'listado', 'update');

  // ── Sheet de alta/edición (el form sigue leyendo el store de edición) ─────
  const setWorkDiagram = useWorkDiagramStore((state) => state.setWorkDiagram);
  const workDiagram = useWorkDiagramStore((state) => state.workDiagram);
  const handleClearStore = useCallback(() => setWorkDiagram(null), [setWorkDiagram]);
  const sheet = useCatalogSheet<WorkDiagramListItem>({
    canCreate,
    canUpdate,
    onOpenEdit: setWorkDiagram,
    onOpenCreate: handleClearStore,
    onClosed: handleClearStore,
  });
  const handleEdit = sheet.openEdit;
  const { close: closeSheet } = sheet;

  // El form pide volver a 'create' al cancelar: equivale a cerrar el Sheet
  const handleSetMode = useCallback(
    (newMode: CatalogSheetMode) => {
      if (newMode === 'create') closeSheet();
    },
    [closeSheet]
  );

  // ── Client-side navigation mode ──────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getWorkDiagramsPaginated(params), []);

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
  const DEFAULT_VISIBLE_FILTERS = ['is_active', 'name', 'active_novelties'];
  const allFilterIds = [
    'name',
    'is_active',
    'active_novelties',
    'inactive_novelty',
    'active_working_days',
    'inactive_working_days',
    'created_at',
  ];
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    return Object.fromEntries(allFilterIds.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFilterVisibility]);

  // ── Lazy-load facet: is_active ─────────────────────────────────────────────
  const fetchIsActiveFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getWorkDiagramSingleFacet('is_active', params);
    if (!result) return { options: [], counts: new Map() };
    return buildActiveFacetResult(result.counts);
  }, []);

  // ── Lazy-load facet: inactive_novelty (FK → diagram_type) ─────────────────
  const fetchInactiveNoveltyFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getWorkDiagramSingleFacet('inactive_novelty', params);
    if (!result) return { options: [], counts: new Map() };
    return {
      options: result.options.map((option) =>
        option.value === NULL_FILTER_VALUE ? { ...option, icon: CircleOff } : option
      ),
      counts: result.counts,
    };
  }, []);

  // ── Lazy-load facet: active_novelties (M:M → diagram_type) ──────────────
  const fetchActiveNoveltiesFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getWorkDiagramSingleFacet('active_novelties', params);
    if (!result) return { options: [], counts: new Map() };
    return {
      options: [
        ...result.options,
        ...(result.counts.has(NULL_FILTER_VALUE)
          ? [{ value: NULL_FILTER_VALUE, label: 'Sin novedades', icon: CircleOff }]
          : []),
      ],
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

      // ── active_novelties (M:M → diagram_type) ────────────────────────────
      {
        columnId: 'active_novelties',
        title: 'Novedades activas',
        fetchFacet: fetchActiveNoveltiesFacet,
      },

      // ── inactive_novelty (FK → diagram_type) ──────────────────────────────
      {
        columnId: 'inactive_novelty',
        title: 'Novedad inactiva',
        fetchFacet: fetchInactiveNoveltyFacet,
      },

      // ── name (texto libre) ─────────────────────────────────────────────────
      {
        columnId: 'name',
        title: 'Nombre',
        type: 'text' as const,
        placeholder: 'Buscar por nombre...',
      },

      // ── active_working_days (número — texto libre) ─────────────────────────
      {
        columnId: 'active_working_days',
        title: 'Días activos',
        type: 'text' as const,
        placeholder: 'Buscar días...',
      },

      // ── inactive_working_days (número — texto libre) ───────────────────────
      {
        columnId: 'inactive_working_days',
        title: 'Días inactivos',
        type: 'text' as const,
        placeholder: 'Buscar días...',
      },

      // ── created_at (rango de fechas) ───────────────────────────────────────
      {
        columnId: 'created_at',
        title: 'Fecha de creación',
        type: 'dateRange' as const,
      },
    ],
    [fetchIsActiveFacet, fetchInactiveNoveltyFacet, fetchActiveNoveltiesFacet]
  );

  // ── DataTable ─────────────────────────────────────────────────────────────
  const table = (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      queryFn={tableQueryFn}
      queryKey={['work-diagrams']}
      onStateChange={handleStateChange}
      toolbarActions={<CatalogCreateButton sheet={sheet} label="Nuevo diagrama" />}
      tableId={tableId}
      paramNamespace={tableId}
      facetedFilters={facetedFilters}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      showFilterToggle
      searchPlaceholder="Buscar por nombre..."
      emptyMessage="No se encontraron diagramas de trabajo"
      data-testid="work-diagrams-table"
      exportConfig={{
        fetchAllData: async () => unwrapExportResult(await getAllWorkDiagramsForExport(currentParams)),
        options: {
          filename: 'diagramas-de-trabajo',
          sheetName: 'Diagramas',
          title: 'Diagramas de Trabajo',
        },
        formatters: {
          // Booleano nullable
          is_active: (value) => activeStatusLabel(value),
          // Decimales — Prisma Decimal llega como objeto, convertir a string
          active_working_days: (value) => (value !== null && value !== undefined ? String(value) : '—'),
          inactive_working_days: (value) => (value !== null && value !== undefined ? String(value) : '—'),
          // Fecha
          created_at: (value) => (value ? formatArgentinaDay(value as string | Date) : '—'),
          // M:M activas — el accessorFn ya retorna un string joinado
          active_novelties: (value) => (value ? String(value) : '—'),
        },
      }}
    />
  );

  return (
    <>
      <CatalogTableSurface>{table}</CatalogTableSurface>
      <CatalogFormSheet
        sheet={sheet}
        getKey={(diagram) => diagram.id}
        title={{ create: 'Nuevo diagrama', edit: 'Editar diagrama' }}
        size="xl"
      >
        {({ mode }) => (
          <WorkDiagramForm diagram={workDiagram} mode={mode} diagramsTypes={diagramTypes} setMode={handleSetMode} />
        )}
      </CatalogFormSheet>
    </>
  );
}
