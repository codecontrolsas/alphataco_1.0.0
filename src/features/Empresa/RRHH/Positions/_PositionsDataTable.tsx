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
import PositionsFormNew from './PositionsFormNew';
import {
  getAllPositionsForExport,
  getPositionSingleFacet,
  getPositionsPaginated,
  type PositionListItem,
} from './actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from './columns';

// ============================================================================
// TYPES
// ============================================================================

interface PositionsDataTableProps {
  data: PositionListItem[];
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

export default function _PositionsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: PositionsDataTableProps) {
  // ── Permisos: construir helper desde el map serializable del servidor ────────
  const permissions = useMemo(
    () => ({
      hasPermission: (module: string, tab: string, action: string) =>
        permissionsMap[`${module}:${tab}:${action}`] === true,
    }),
    [permissionsMap]
  );

  const canCreate = permissions.hasPermission('configuracion', 'positions', 'create');
  const canUpdate = permissions.hasPermission('configuracion', 'positions', 'update');

  // ── Sheet de alta/edición (el puesto en edición vive en estado local) ─────
  const [selectedPosition, setSelectedPosition] = useState<PositionListItem | null>(null);
  const handleClearSelected = useCallback(() => setSelectedPosition(null), []);
  const sheet = useCatalogSheet<PositionListItem>({
    canCreate,
    canUpdate,
    onOpenEdit: setSelectedPosition,
    onOpenCreate: handleClearSelected,
    onClosed: handleClearSelected,
  });
  const handleEdit = sheet.openEdit;

  // ── Client-side navigation mode ──────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getPositionsPaginated(params), []);

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
  const DEFAULT_VISIBLE_FILTERS = ['is_active', 'aptitudes', 'hierarchy'];
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    const allFilterIds = ['name', 'is_active', 'hierarchy', 'aptitudes', 'created_at'];
    return Object.fromEntries(allFilterIds.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
  }, [initialFilterVisibility]);

  // ── Lazy-load facet: is_active ─────────────────────────────────────────────
  const fetchIsActiveFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getPositionSingleFacet('is_active', params);
    if (!result) return { options: [], counts: new Map() };
    return buildActiveFacetResult(result.counts);
  }, []);

  // ── Lazy-load facet: aptitudes (M:M) ──────────────────────────────────────
  const fetchAptitudesFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getPositionSingleFacet('aptitudes', params);
    if (!result) return { options: [], counts: new Map() };
    // Agregar opción "Sin aptitudes" si existen puestos sin aptitudes
    const options = [
      ...result.options,
      ...(result.counts.has(NULL_FILTER_VALUE)
        ? [{ value: NULL_FILTER_VALUE, label: 'Sin aptitudes', icon: CircleOff }]
        : []),
    ];
    return { options, counts: result.counts };
  }, []);

  // ── Lazy-load facet: hierarchy (sectores — array de UUIDs) ─────────────────
  const fetchHierarchyFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getPositionSingleFacet('hierarchy', params);
    if (!result) return { options: [], counts: new Map() };
    const options = [
      ...result.options,
      ...(result.counts.has(NULL_FILTER_VALUE)
        ? [{ value: NULL_FILTER_VALUE, label: 'Sin sector', icon: CircleOff }]
        : []),
    ];
    return { options, counts: result.counts };
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

      // ── hierarchy (sectores) ───────────────────────────────────────────────
      {
        columnId: 'hierarchy',
        title: 'Sector/Departamento',
        fetchFacet: fetchHierarchyFacet,
      },

      // ── aptitudes (M:M) ────────────────────────────────────────────────────
      {
        columnId: 'aptitudes',
        title: 'Aptitudes Técnicas',
        fetchFacet: fetchAptitudesFacet,
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
    [fetchIsActiveFacet, fetchHierarchyFacet, fetchAptitudesFacet]
  );

  // ── DataTable ─────────────────────────────────────────────────────────────
  const table = (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      queryFn={tableQueryFn}
      queryKey={['positions']}
      onStateChange={handleStateChange}
      toolbarActions={<CatalogCreateButton sheet={sheet} label="Nuevo puesto" />}
      tableId={tableId}
      paramNamespace={tableId}
      facetedFilters={facetedFilters}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      showFilterToggle
      searchPlaceholder="Buscar puestos..."
      emptyMessage="No se encontraron puestos"
      exportConfig={{
        fetchAllData: async () => unwrapExportResult(await getAllPositionsForExport(currentParams)),
        options: {
          filename: 'puestos',
          sheetName: 'Puestos',
          title: 'Puestos de Trabajo',
        },
        formatters: {
          is_active: (value) => activeStatusLabel(value),
          created_at: (value) => (value ? formatArgentinaDay(value as string | Date) : '-'),
          hierarchy: (value) => (Array.isArray(value) ? value.join(', ') : String(value ?? '-')),
          aptitudes: (value) => {
            // accessorFn retorna string con nombres separados por coma
            return value ? String(value) : 'Sin aptitudes';
          },
        },
      }}
    />
  );

  return (
    <>
      <CatalogTableSurface>{table}</CatalogTableSurface>
      <CatalogFormSheet
        sheet={sheet}
        getKey={(position) => position.id}
        title={{ create: 'Nuevo puesto', edit: 'Editar puesto' }}
        size="lg"
      >
        {({ close }) => <PositionsFormNew selectedPosition={selectedPosition} onDone={close} />}
      </CatalogFormSheet>
    </>
  );
}
