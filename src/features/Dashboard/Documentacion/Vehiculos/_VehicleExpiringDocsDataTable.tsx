'use client';

import { formatArgentinaDay } from '@/features/Treasury/lib/today';
import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, CheckCircle2, CircleOff, XCircle } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import {
  getAllVehicleExpiringDocsForExport,
  getVehicleExpiringDocsPaginated,
  getVehicleExpiringDocsSingleFacet,
  type VehicleExpiringDocListItem,
} from './actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, columns, stateLabels } from './columns';

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  data: VehicleExpiringDocListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_VISIBLE_FILTER_IDS = ['state', 'document_type', 'validity', 'vehicle'];

const stateIcons: Record<string, LucideIcon | undefined> = {
  presentado: CheckCircle2,
  aprobado: CheckCircle2,
  rechazado: XCircle,
  vencido: AlertTriangle,
};

// ============================================================================
// HELPERS — builders para reducir boilerplate en fetchFacet
// ============================================================================

/** Construye FacetResult para enums: opciones estáticas + counts del servidor */
function buildEnumFacetResult(
  enumValues: string[],
  labels: Record<string, string>,
  icons: Record<string, LucideIcon | undefined>,
  counts: Map<string, number>
): FacetResult {
  return {
    options: [
      ...enumValues.map((value) => ({
        value,
        label: labels[value] ?? value,
        icon: icons[value],
      })),
      ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: 'Sin estado', icon: CircleOff }] : []),
    ],
    counts,
  };
}

/** Construye FacetResult para FK: opciones del servidor + counts */
function buildFkFacetResult(
  resolvedOptions: Array<{ id: string; name: string | null }> | undefined,
  counts: Map<string, number>,
  nullLabel = 'Sin asignar'
): FacetResult {
  return {
    options: [
      ...(resolvedOptions?.map((o) => ({ value: o.id, label: o.name ?? '' })) ?? []),
      ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: nullLabel, icon: CircleOff }] : []),
    ],
    counts,
  };
}

// ============================================================================
// CLIENT COMPONENT
// ============================================================================

export function _VehicleExpiringDocsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  // Estado para export con filtros activos (client-side navigation mode)
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  // QueryFn para client-side navigation mode
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getVehicleExpiringDocsPaginated(params), []);

  // Visibilidad de columnas: defaults + preferencias guardadas
  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((col) => [col, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  // Visibilidad de filtros: preferencias guardadas > defaults
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    const allFilterIds = ['state', 'document_type', 'validity', 'created_at', 'vehicle', 'sub_type', 'owner'];
    return Object.fromEntries(allFilterIds.map((id) => [id, DEFAULT_VISIBLE_FILTER_IDS.includes(id)]));
  }, [initialFilterVisibility]);

  // ── fetchFacet factories ───────────────────────────────────────────────────

  /** Factory para filtros de enum con fetchFacet lazy */
  const makeEnumFetchFacet = useCallback(
    (
      columnId: string,
      enumValues: string[],
      labels: Record<string, string>,
      icons: Record<string, LucideIcon | undefined>
    ) => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getVehicleExpiringDocsSingleFacet(columnId, params);
        if (!result) return { options: [], counts: new Map() };
        return buildEnumFacetResult(enumValues, labels, icons, result.counts);
      };
    },
    []
  );

  /** Factory para filtros de FK con fetchFacet lazy */
  const makeFkFetchFacet = useCallback((columnId: string, nullLabel = 'Sin asignar') => {
    return async (params: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getVehicleExpiringDocsSingleFacet(columnId, params);
      if (!result) return { options: [], counts: new Map() };
      return buildFkFacetResult(result.resolvedOptions, result.counts, nullLabel);
    };
  }, []);

  // ── Filtros facetados (lazy-load) ──────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      // Estado (enum state) — lazy-load
      {
        columnId: 'state',
        title: 'Estado',
        fetchFacet: makeEnumFetchFacet('state', Object.keys(stateLabels), stateLabels, stateIcons),
      },

      // Tipo de documento (FK UUID → document_types) — lazy-load
      {
        columnId: 'document_type',
        title: 'Tipo de Documento',
        fetchFacet: makeFkFetchFacet('document_type', 'Sin tipo'),
      },

      // Subtipo del equipo (FK UUID nullable → sub_type) — lazy-load
      {
        columnId: 'sub_type',
        title: 'Subtipo',
        fetchFacet: makeFkFetchFacet('sub_type'),
      },

      // Propietario del equipo (FK UUID nullable → equipment_owners) — lazy-load.
      // Los null son unidades sin titular externo: en su mayoría de contrato "Propio".
      {
        columnId: 'owner',
        title: 'Propietario',
        fetchFacet: makeFkFetchFacet('owner', 'Propio / Sin asignar'),
      },

      // Vencimiento (rango de fechas)
      {
        columnId: 'validity',
        title: 'Vencimiento',
        type: 'dateRange' as const,
      },

      // Subido el (rango de fechas)
      {
        columnId: 'created_at',
        title: 'Subido el',
        type: 'dateRange' as const,
      },

      // Dominio (texto libre — busca en vehicles.domain)
      {
        columnId: 'vehicle',
        title: 'Dominio',
        type: 'text' as const,
        placeholder: 'Buscar por dominio...',
      },
    ],
    [makeEnumFetchFacet, makeFkFetchFacet]
  );

  // ── Configuración de export ──────────────────────────────────────────────
  const exportConfig = useMemo(
    () => ({
      fetchAllData: () => getAllVehicleExpiringDocsForExport(currentParams),
      options: {
        filename: 'documentos-equipos-por-vencer',
        title: 'Documentos de Equipos por Vencer',
        sheetName: 'Documentos',
      },
      formatters: {
        // vehicle: accessorFn retorna texto (dominio/nro interno), no necesita formatter
        // document_type: accessorFn retorna texto, no necesita formatter
        state: (val: unknown) => stateLabels[val as string] ?? String(val ?? ''),
        validity: (val: unknown) => (val ? formatArgentinaDay(val as string) : ''),
        created_at: (val: unknown) => (val ? formatArgentinaDay(val as string) : ''),
      },
    }),
    [currentParams]
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      queryFn={tableQueryFn}
      queryKey={['dashboard-vehicle-expiring-docs']}
      onStateChange={handleStateChange}
      facetedFilters={facetedFilters}
      exportConfig={exportConfig}
      searchPlaceholder="Buscar por equipo o tipo de documento..."
      emptyMessage="No hay documentos de equipos por vencer"
      tableId={tableId}
      paramNamespace={tableId}
      showFilterToggle={true}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      data-testid="vehicle-expiring-docs-table"
    />
  );
}
