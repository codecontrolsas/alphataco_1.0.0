'use client';

import { STATUS_LABELS, type PreEmployeeStatus } from '@/features/Seleccion/lib/state-machine';
import { pre_employee_status_enum } from '@/generated/prisma/enums';
import {
  DataTable,
  type DataTableExportConfig,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { CircleOff } from 'lucide-react';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useCallback, useMemo, useState } from 'react';
import {
  getAllPreEmployeesForExport,
  getPreEmployeeSingleFacet,
  getPreEmployeesPaginated,
  type PreEmployeeListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns, statusIcons } from '../columns';

// ============================================================================
// TYPES
// ============================================================================

interface PreEmployeeDataTableProps {
  data: PreEmployeeListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  /** Cantidad de documentos obligatorios (el Y de la columna Documentos) */
  requiredDocs: number;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

// ============================================================================
// HELPERS — builders para reducir boilerplate en fetchFacet
// ============================================================================

/** Construye FacetResult para FK/enum: opciones del servidor + counts */
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
// COMPONENT
// ============================================================================

export function _PreEmployeeDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  requiredDocs,
  initialColumnVisibility,
  initialFilterVisibility,
}: PreEmployeeDataTableProps) {
  // ─── Client-side navigation: estado reactivo para queries dependientes ──────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  // queryFn para fetch client-side de datos de tabla
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getPreEmployeesPaginated(params), []);

  // Columns
  const columns = useMemo(() => getColumns(requiredDocs), [requiredDocs]);

  // Initial column visibility: merge defaults with saved preferences
  const mergedColumnVisibility = useMemo(() => {
    const defaults: Record<string, boolean> = {};
    for (const col of HIDDEN_COLUMNS_BY_DEFAULT) {
      defaults[col] = false;
    }
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  // ─── fetchFacet factories: cada filtro tiene su fetchFacet lazy ────────────

  const makeFkFetchFacet = useCallback((columnId: string) => {
    return async (params: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getPreEmployeeSingleFacet(columnId, params);
      if (!result) return { options: [], counts: new Map() };
      return buildFkFacetResult(result.resolvedOptions, result.counts);
    };
  }, []);

  // ─── Filtros facetados con lazy-load ───────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      // ── Enum ──────────────────────────────────────────────────────────────
      {
        columnId: 'status',
        title: 'Estado',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getPreEmployeeSingleFacet('status', params);
          if (!result) return { options: [], counts: new Map() };
          return {
            options: Object.values(pre_employee_status_enum).map((value) => ({
              value,
              label: STATUS_LABELS[value],
              icon: statusIcons[value],
            })),
            counts: result.counts,
          };
        },
      },

      // ── FK UUID nullable ─────────────────────────────────────────────────
      { columnId: 'hierarchy', title: 'Sector propuesto', fetchFacet: makeFkFetchFacet('hierarchy') },
      {
        columnId: 'company_positions',
        title: 'Puesto propuesto',
        fetchFacet: makeFkFetchFacet('company_positions'),
      },

      // ── Filtros de texto libre ─────────────────────────────────────────────
      {
        columnId: 'pre_file_number',
        title: 'N° Candidato',
        type: 'text' as const,
        placeholder: 'Buscar por N° de candidato...',
      },
      { columnId: 'fullName', title: 'Nombre', type: 'text' as const, placeholder: 'Buscar por nombre...' },
      { columnId: 'document_number', title: 'DNI', type: 'text' as const, placeholder: 'Buscar por DNI...' },
      { columnId: 'cuil', title: 'CUIL', type: 'text' as const, placeholder: 'Buscar por CUIL...' },
      { columnId: 'phone', title: 'Telefono', type: 'text' as const, placeholder: 'Buscar por telefono...' },
      { columnId: 'email', title: 'Email', type: 'text' as const, placeholder: 'Buscar por email...' },
      {
        columnId: 'rejection_reason',
        title: 'Motivo de rechazo',
        type: 'text' as const,
        placeholder: 'Buscar por motivo de rechazo...',
      },

      // ── Filtros de rango de fechas ─────────────────────────────────────────
      { columnId: 'created_at', title: 'Creado', type: 'dateRange' as const },
      { columnId: 'reviewed_at', title: 'Revisado', type: 'dateRange' as const },
    ],
    [makeFkFetchFacet]
  );

  // Filtros visibles por defecto: solo los 3 mas comunes
  const DEFAULT_VISIBLE_FILTERS = ['status', 'hierarchy', 'company_positions'];
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    return Object.fromEntries(
      facetedFilters.map((filter) => [filter.columnId, DEFAULT_VISIBLE_FILTERS.includes(filter.columnId)])
    );
  }, [initialFilterVisibility, facetedFilters]);

  // ─── Exportacion a Excel ────────────────────────────────────────────────
  const exportConfig: DataTableExportConfig<PreEmployeeListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllPreEmployeesForExport(currentParams)),
      options: {
        filename: 'candidatos',
        title: 'Listado de Candidatos',
        sheetName: 'Candidatos',
      },
      formatters: {
        status: (value) => STATUS_LABELS[value as PreEmployeeStatus] || String(value),
        created_at: (value) => (value ? formatArgentinaDay(value as string | Date) : '-'),
        reviewed_at: (value) => (value ? formatArgentinaDay(value as string | Date) : '-'),
      },
    }),
    [currentParams]
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      tableId={tableId}
      paramNamespace={tableId}
      facetedFilters={facetedFilters}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      showFilterToggle
      showSearch
      mobileCards
      // Client-side navigation: fetch instantaneo via React Query, sin router.push
      queryFn={tableQueryFn}
      queryKey={['pre-employees-paginated']}
      onStateChange={handleStateChange}
      enableRowSelection
      showRowSelection
      searchPlaceholder="Buscar por nombre, CUIL o N° de candidato"
      emptyMessage="No hay candidatos cargados"
      exportConfig={exportConfig}
      data-testid="pre-employees-table"
    />
  );
}
