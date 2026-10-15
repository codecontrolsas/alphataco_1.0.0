'use client';

import { formatArgentinaDay } from '@/features/Treasury/lib/today';
import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { unwrapExportResult } from '@/shared/lib/export-result';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, CheckCircle2, CircleOff, XCircle } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import type { EmployeeExpiringDocListItem } from '../lib/expiring-docs-types';
import {
  getAllEmployeeExpiringDocsForExport,
  getEmployeeExpiringDocsPaginated,
  getEmployeeExpiringDocsSingleFacet,
} from './actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, columns, stateLabels } from './columns';

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  data: EmployeeExpiringDocListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_VISIBLE_FILTER_IDS = ['state', 'document_type', 'validity'];

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

export function _EmployeeExpiringDocsDataTable({
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
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getEmployeeExpiringDocsPaginated(params), []);

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
    const allFilterIds = ['state', 'document_type', 'validity', 'created_at', 'fileNumber'];
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
        const result = await getEmployeeExpiringDocsSingleFacet(columnId, params);
        if (!result) return { options: [], counts: new Map() };
        return buildEnumFacetResult(enumValues, labels, icons, result.counts);
      };
    },
    []
  );

  /** Factory para filtros de FK con fetchFacet lazy */
  const makeFkFetchFacet = useCallback((columnId: string, nullLabel = 'Sin asignar') => {
    return async (params: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getEmployeeExpiringDocsSingleFacet(columnId, params);
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

      // Legajo (texto)
      {
        columnId: 'fileNumber',
        title: 'Legajo',
        type: 'text' as const,
        placeholder: 'Buscar por legajo...',
      },
    ],
    [makeEnumFetchFacet, makeFkFetchFacet]
  );

  // ── Configuración de export ──────────────────────────────────────────────
  const exportConfig = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllEmployeeExpiringDocsForExport(currentParams)),
      options: {
        filename: 'documentos-empleados-por-vencer',
        title: 'Documentos de Empleados por Vencer',
        sheetName: 'Documentos',
      },
      formatters: {
        // employee: accessorFn retorna texto, no necesita formatter
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
      queryKey={['dashboard-employee-expiring-docs']}
      onStateChange={handleStateChange}
      facetedFilters={facetedFilters}
      exportConfig={exportConfig}
      searchPlaceholder="Buscar por empleado o tipo de documento..."
      emptyMessage="No hay documentos de empleados por vencer"
      tableId={tableId}
      paramNamespace={tableId}
      showFilterToggle={true}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      data-testid="employee-expiring-docs-table"
    />
  );
}
