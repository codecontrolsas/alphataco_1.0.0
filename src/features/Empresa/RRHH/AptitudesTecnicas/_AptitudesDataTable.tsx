'use client';

import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { CircleOff } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { CatalogSplitLayout } from '../../components/CatalogSplitLayout';
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

  const canCreateOrUpdate =
    permissions.hasPermission('configuracion', 'aptitudes', 'create') ||
    permissions.hasPermission('configuracion', 'aptitudes', 'update');

  // ── Store de edición ─────────────────────────────────────────────────────
  const setAptitud = useAptitudesStore((state) => state.setAptitud);
  const handleEdit = useCallback(
    (item: AptitudTecnicaListItem) => {
      setAptitud(item);
    },
    [setAptitud]
  );

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

  // Si no tiene permisos de crear/editar, mostrar solo la tabla
  if (!canCreateOrUpdate) {
    return table;
  }

  // Con permisos: formulario + tabla (apilados en pantallas chicas, paneles redimensionables desde lg)
  return <CatalogSplitLayout form={<AptitudesForm positions={positions} queryKey={QUERY_KEY} />} table={table} />;
}
