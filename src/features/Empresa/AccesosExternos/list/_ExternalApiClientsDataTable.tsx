'use client';

import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { type DataTableFacetedFilterConfig, type DataTableSearchParams, type FacetResult } from '@/shared/components/common/DataTable/types';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDateTime, formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import type { LucideIcon } from 'lucide-react';
import { CircleOff } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import {
  getAllExternalApiClientsForExport,
  getExternalApiClientsPaginated,
  getExternalApiClientsSingleFacet,
} from './actions.server';
import {
  HIDDEN_COLUMNS_BY_DEFAULT,
  externalApiClientStatusIcons,
  externalApiClientStatusLabels,
  getColumns,
} from './columns';
import type { ExternalApiClientListItem } from './lib/clients-types';

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  data: ExternalApiClientListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
}

const TABLE_ID = 'external-api-clients';

// Filtros visibles por defecto — el resto se crean pero ocultos hasta que el
// usuario los active con el toggle de filtros.
const DEFAULT_VISIBLE_FILTERS = ['status', 'creator', 'last_used_at'];

const ALL_FILTER_IDS = ['status', 'creator', 'last_used_at', 'created_at', 'name', 'client_id', 'notes'];

// ============================================================================
// HELPERS — builders para reducir boilerplate en fetchFacet
// ============================================================================

function buildEnumFacetResult(
  values: string[],
  labels: Record<string, string>,
  icons: Record<string, LucideIcon | undefined>,
  counts: Map<string, number>
): FacetResult {
  return {
    options: values.map((value) => ({ value, label: labels[value] ?? value, icon: icons[value] })),
    counts,
  };
}

function buildFkFacetResult(
  resolvedOptions: Array<{ id: string; name: string | null }> | undefined,
  counts: Map<string, number>
): FacetResult {
  return {
    options: [
      ...(resolvedOptions?.map((o) => ({ value: o.id, label: o.name ?? '' })) ?? []),
      ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff }] : []),
    ],
    counts,
  };
}

// ============================================================================
// CLIENT COMPONENT
// ============================================================================

export function _ExternalApiClientsDataTable({
  data,
  totalRows,
  searchParams,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  // ─── Permisos: construidos desde el map del servidor, nunca re-fetcheados ──
  const canUpdate = permissionsMap['configuracion:accesos-externos:update'] === true;
  const canDelete = permissionsMap['configuracion:accesos-externos:delete'] === true;

  const columns = useMemo(() => getColumns({ canUpdate, canDelete }), [canUpdate, canDelete]);

  // ─── Client-side navigation: estado reactivo para queries dependientes ─────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getExternalApiClientsPaginated(params), []);

  // Columnas ocultas por defecto (unir preferencias guardadas con las del sistema)
  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((col) => [col, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  // Filtros visibles por defecto: preferencias guardadas tienen prioridad
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    return Object.fromEntries(ALL_FILTER_IDS.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
  }, [initialFilterVisibility]);

  // ─── fetchFacet factories: cada filtro carga sus opciones al abrirse ───────
  const makeEnumFetchFacet = useCallback(
    (
      columnId: string,
      values: string[],
      labels: Record<string, string>,
      icons: Record<string, LucideIcon | undefined>
    ) => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getExternalApiClientsSingleFacet(columnId, params);
        if (!result) return { options: [], counts: new Map() };
        return buildEnumFacetResult(values, labels, icons, result.counts);
      };
    },
    []
  );

  const makeFkFetchFacet = useCallback((columnId: string) => {
    return async (params: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getExternalApiClientsSingleFacet(columnId, params);
      if (!result) return { options: [], counts: new Map() };
      return buildFkFacetResult(result.resolvedOptions, result.counts);
    };
  }, []);

  // ─── Filtros facetados con lazy-load ────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      {
        columnId: 'status',
        title: 'Estado',
        fetchFacet: makeEnumFetchFacet(
          'status',
          ['active', 'revoked'],
          externalApiClientStatusLabels,
          externalApiClientStatusIcons as Record<string, LucideIcon | undefined>
        ),
      },
      {
        columnId: 'creator',
        title: 'Creado por',
        fetchFacet: makeFkFetchFacet('creator'),
      },
      { columnId: 'last_used_at', title: 'Última consulta', type: 'dateRange' as const },
      { columnId: 'created_at', title: 'Creado', type: 'dateRange' as const },
      { columnId: 'name', title: 'Sistema', type: 'text' as const, placeholder: 'Buscar por nombre del sistema...' },
      { columnId: 'client_id', title: 'Usuario', type: 'text' as const, placeholder: 'Buscar por usuario...' },
      { columnId: 'notes', title: 'Notas', type: 'text' as const, placeholder: 'Buscar en notas...' },
    ],
    [makeEnumFetchFacet, makeFkFetchFacet]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      tableId={TABLE_ID}
      paramNamespace={TABLE_ID}
      // Client-side navigation: fetch instantáneo via React Query, sin router.push.
      // Comparte prefijo de queryKey con ['external-api-clients'] para que rotar/revocar/crear
      // (que invalidan esa key) refresquen esta tabla.
      queryFn={tableQueryFn}
      queryKey={['external-api-clients', 'paginated']}
      onStateChange={handleStateChange}
      facetedFilters={facetedFilters}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      searchPlaceholder="Buscar por sistema o usuario..."
      showFilterToggle={true}
      emptyMessage="Todavía no hay accesos externos creados."
      data-testid="external-api-clients-table"
      exportConfig={{
        fetchAllData: async () => unwrapExportResult(await getAllExternalApiClientsForExport(currentParams)),
        options: {
          filename: 'accesos-externos',
          title: 'Listado de Accesos Externos',
          sheetName: 'Accesos Externos',
        },
        formatters: {
          status: (val) => externalApiClientStatusLabels[val as string] ?? String(val ?? ''),
          last_used_at: (val) => (val ? formatArgentinaDateTime(val as string | Date) : 'Nunca'),
          created_at: (val) => (val ? formatArgentinaDay(val as string | Date) : ''),
        },
      }}
    />
  );
}
