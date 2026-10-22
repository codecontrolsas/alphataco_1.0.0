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

/** Filtros visibles hasta que el usuario elija otros (las preferencias guardadas tienen prioridad). */
const DEFAULT_VISIBLE_FILTERS = ['is_active', 'aptitudes', 'hierarchy'];

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
  // ── Permisos: helper armado desde el mapa serializable del servidor ───────────
  const permissions = usePermissionChecker(permissionsMap);

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

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getPositionsPaginated(params), []);

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns = useMemo(() => getColumns(permissions, handleEdit), [permissions, handleEdit]);

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
      queryKey={['positions']}
      toolbarActions={<CatalogCreateButton sheet={sheet} label="Nuevo puesto" />}
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
