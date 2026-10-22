'use client';

import {
  CatalogCreateButton,
  CatalogFormSheet,
  CatalogTableSurface,
  useCatalogSheet,
} from '@/shared/components/common/CatalogFormSheet';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { type DataTableFacetedFilterConfig, type DataTableSearchParams, type FacetResult } from '@/shared/components/common/DataTable/types';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { CircleOff } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { activeStatusLabel, buildActiveFacetResult } from '../../lib/active-status';
import { AptitudesForm } from './AptitudesForm';
import {
  getAllAptitudesTecnicasForExport,
  getAptitudesTecnicasPaginated,
  getAptitudesTecnicasSingleFacet,
  type AptitudTecnicaListItem,
  type CompanyPositionOption,
} from './actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from './columns';
import { useAptitudesStore } from './store/aptitudes.store';

// ============================================================================
// QUERY KEY
// ============================================================================

const QUERY_KEY = ['aptitudes-tecnicas'] as const;

// ============================================================================
// TYPES
// ============================================================================

interface AptitudesDataTableProps {
  data: AptitudTecnicaListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  /** Flat permissions map from server: "module:tab:action" → boolean */
  permissionsMap: Record<string, boolean>;
  positions: CompanyPositionOption[];
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function _AptitudesDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  positions,
  initialColumnVisibility,
  initialFilterVisibility,
}: AptitudesDataTableProps) {
  // ── Permisos: construir helper desde el map serializable del servidor ────────
  const permissions = useMemo(
    () => ({
      hasPermission: (module: string, tab: string, action: string) =>
        permissionsMap[`${module}:${tab}:${action}`] === true,
    }),
    [permissionsMap]
  );

  const canCreate = permissions.hasPermission('configuracion', 'aptitudes', 'create');
  const canUpdate = permissions.hasPermission('configuracion', 'aptitudes', 'update');

  // ── Sheet de alta/edición (el form sigue leyendo el store de edición) ─────
  const setAptitud = useAptitudesStore((state) => state.setAptitud);
  const handleClearStore = useCallback(() => setAptitud(null), [setAptitud]);
  const sheet = useCatalogSheet<AptitudTecnicaListItem>({
    canCreate,
    canUpdate,
    onOpenEdit: setAptitud,
    onOpenCreate: handleClearStore,
    onClosed: handleClearStore,
  });
  const handleEdit = sheet.openEdit;

  // ── Client-side navigation mode ──────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getAptitudesTecnicasPaginated(params), []);

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
  const DEFAULT_VISIBLE_FILTERS = ['is_active', 'puestos', 'nombre'];
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    const allFilterIds = ['nombre', 'puestos', 'is_active'];
    return Object.fromEntries(allFilterIds.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
  }, [initialFilterVisibility]);

  // ── Lazy-load facet: is_active ─────────────────────────────────────────────
  const fetchIsActiveFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getAptitudesTecnicasSingleFacet('is_active', params);
    if (!result) return { options: [], counts: new Map() };
    return buildActiveFacetResult(result.counts);
  }, []);

  // ── Lazy-load facet: puestos (M:M) ─────────────────────────────────────────
  const fetchPuestosFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getAptitudesTecnicasSingleFacet('puestos', params);
    if (!result) return { options: [], counts: new Map() };
    const options = [
      ...result.options,
      ...(result.counts.has(NULL_FILTER_VALUE)
        ? [{ value: NULL_FILTER_VALUE, label: 'Sin puestos asignados', icon: CircleOff }]
        : []),
    ];
    return { options, counts: result.counts };
  }, []);

  // ── Faceted filters ───────────────────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      // ── nombre (texto libre) ───────────────────────────────────────────────
      {
        columnId: 'nombre',
        title: 'Nombre',
        type: 'text' as const,
        placeholder: 'Buscar por nombre...',
      },

      // ── puestos (M:M) ──────────────────────────────────────────────────────
      {
        columnId: 'puestos',
        title: 'Puestos',
        fetchFacet: fetchPuestosFacet,
      },

      // ── is_active (booleano nullable) ──────────────────────────────────────
      {
        columnId: 'is_active',
        title: 'Estado',
        fetchFacet: fetchIsActiveFacet,
      },
    ],
    [fetchIsActiveFacet, fetchPuestosFacet]
  );

  // ── DataTable ─────────────────────────────────────────────────────────────
  const table = (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      queryFn={tableQueryFn}
      queryKey={[...QUERY_KEY]}
      onStateChange={handleStateChange}
      toolbarActions={<CatalogCreateButton sheet={sheet} label="Nueva aptitud" />}
      tableId={tableId}
      paramNamespace={tableId}
      facetedFilters={facetedFilters}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      showFilterToggle
      searchPlaceholder="Buscar aptitudes técnicas..."
      emptyMessage="No se encontraron aptitudes técnicas"
      exportConfig={{
        fetchAllData: async () => unwrapExportResult(await getAllAptitudesTecnicasForExport(currentParams)),
        options: {
          filename: 'aptitudes-tecnicas',
          sheetName: 'Aptitudes Técnicas',
          title: 'Aptitudes Técnicas',
        },
        formatters: {
          is_active: (value) => activeStatusLabel(value),
          // puestos: accessorFn ya retorna string concatenado
          puestos: (value) => (value ? String(value) : 'Sin puestos asignados'),
        },
      }}
    />
  );

  return (
    <>
      <CatalogTableSurface>{table}</CatalogTableSurface>
      <CatalogFormSheet
        sheet={sheet}
        getKey={(aptitud) => aptitud.id}
        title={{ create: 'Nueva aptitud técnica', edit: 'Editar aptitud técnica' }}
        size="md"
      >
        {() => <AptitudesForm positions={positions} queryKey={QUERY_KEY} />}
      </CatalogFormSheet>
    </>
  );
}
