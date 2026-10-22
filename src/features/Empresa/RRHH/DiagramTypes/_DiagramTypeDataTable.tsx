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
import { Check, CircleOff, X } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { activeStatusLabel, buildActiveFacetResult } from '../../lib/active-status';
import {
  getAllDiagramTypesForExport,
  getDiagramTypeSingleFacet,
  getDiagramTypesPaginated,
  type DiagramTypeListItem,
} from './actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from './columns';
import DiagramTypeForm from './components/DiagramTypeForm';
import { useDiagramTypeStore } from './store/diagramType.store';

// ============================================================================
// TYPES
// ============================================================================

interface DiagramTypeDataTableProps {
  data: DiagramTypeListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  /** Flat permissions map from server: "module:tab:action" → boolean */
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

/** Filtros visibles hasta que el usuario elija otros (las preferencias guardadas tienen prioridad). */
const DEFAULT_VISIBLE_FILTERS = ['is_active', 'work_active', 'name'];

// ============================================================================
// COMPONENT
// ============================================================================

export default function _DiagramTypeDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: DiagramTypeDataTableProps) {
  // ── Permisos: helper armado desde el mapa serializable del servidor ───────────
  const permissions = usePermissionChecker(permissionsMap);

  const canCreate = permissions.hasPermission('configuracion', 'diagrams', 'create');
  const canUpdate = permissions.hasPermission('configuracion', 'diagrams', 'update');

  // ── Sheet de alta/edición (el form sigue leyendo el store de edición) ─────
  const setDiagramType = useDiagramTypeStore((state) => state.setDiagramType);
  const handleClearStore = useCallback(() => setDiagramType(null), [setDiagramType]);
  const sheet = useCatalogSheet<DiagramTypeListItem>({
    canCreate,
    canUpdate,
    onOpenEdit: setDiagramType,
    onOpenCreate: handleClearStore,
    onClosed: handleClearStore,
  });
  const handleEdit = sheet.openEdit;

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getDiagramTypesPaginated(params), []);

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns = useMemo(() => getColumns(permissions, handleEdit), [permissions, handleEdit]);

  // ── Lazy-load facets ──────────────────────────────────────────────────────

  const fetchWorkActiveFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getDiagramTypeSingleFacet('work_active', params);
    if (!result) return { options: [], counts: new Map() };
    // Mismas etiquetas que la celda de la columna ("Trabajando" / "No trabajando")
    const options = [
      { value: 'true', label: 'Trabajando', icon: Check },
      { value: 'false', label: 'No trabajando', icon: X },
      ...(result.counts.has(NULL_FILTER_VALUE)
        ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff }]
        : []),
    ];
    return { options, counts: result.counts };
  }, []);

  const fetchIsActiveFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getDiagramTypeSingleFacet('is_active', params);
    if (!result) return { options: [], counts: new Map() };
    return buildActiveFacetResult(result.counts);
  }, []);

  const fetchComputesFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getDiagramTypeSingleFacet('computes_absenteeism', params);
    if (!result) return { options: [], counts: new Map() };
    // Mismas etiquetas que la celda de la columna ("Sí" / "No")
    const options = [
      { value: 'true', label: 'Sí', icon: Check },
      { value: 'false', label: 'No', icon: X },
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

      // ── short_description (texto libre) ────────────────────────────────────
      {
        columnId: 'short_description',
        title: 'Descripción corta',
        type: 'text' as const,
        placeholder: 'Buscar por descripción corta...',
      },

      // ── work_active (booleano nullable) ────────────────────────────────────
      {
        columnId: 'work_active',
        title: 'Lab. Activa',
        fetchFacet: fetchWorkActiveFacet,
      },

      // ── is_active (booleano NOT NULL) ──────────────────────────────────────
      {
        columnId: 'is_active',
        title: 'Estado',
        fetchFacet: fetchIsActiveFacet,
      },

      // ── computes_absenteeism (booleano NOT NULL — oculto por defecto) ───────
      {
        columnId: 'computes_absenteeism',
        title: 'Computa ausentismo',
        fetchFacet: fetchComputesFacet,
      },

      // ── created_at (rango de fechas) ───────────────────────────────────────
      {
        columnId: 'created_at',
        title: 'Fecha de creación',
        type: 'dateRange' as const,
      },
    ],
    [fetchWorkActiveFacet, fetchIsActiveFacet, fetchComputesFacet]
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
      queryKey={['diagram-types']}
      toolbarActions={<CatalogCreateButton sheet={sheet} label="Nuevo tipo de novedad" />}
      searchPlaceholder="Buscar tipos de novedades..."
      emptyMessage="No se encontraron tipos de novedades"
      exportConfig={{
        fetchAllData: async () => unwrapExportResult(await getAllDiagramTypesForExport(currentParams)),
        options: {
          filename: 'tipos-de-novedades',
          sheetName: 'Tipos de Novedades',
          title: 'Tipos de Novedades',
        },
        formatters: {
          work_active: (value) => {
            if (value === null || value === undefined) return 'Sin asignar';
            return value ? 'Trabajando' : 'No trabajando';
          },
          is_active: (value) => activeStatusLabel(value),
          computes_absenteeism: (value) => (value ? 'Sí' : 'No'),
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
        getKey={(diagramType) => diagramType.id}
        title={{ create: 'Nuevo tipo de novedad', edit: 'Editar tipo de novedad' }}
        size="lg"
      >
        {() => <DiagramTypeForm />}
      </CatalogFormSheet>
    </>
  );
}
