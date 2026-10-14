'use client';

import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import type { LucideIcon } from 'lucide-react';
import { CircleOff } from 'lucide-react';
import moment from 'moment';
import { useCallback, useMemo, useState } from 'react';
import {
  getDiagramReportSingleFacet,
  getDiagramReportsForExport,
  getDiagramReportsPaginated,
  type DiagramReportListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from '../columns';

// ============================================================================
// TYPES
// ============================================================================

interface DiagramReportsDataTableProps {
  data: DiagramReportListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

// ============================================================================
// HELPERS — builders para reducir boilerplate en fetchFacet
// ============================================================================

/** Construye FacetResult para FK/M:M: opciones del servidor + counts */
function buildFkFacetResult(
  resolvedOptions: Array<{ id: string; name: string | null }> | undefined,
  counts: Map<string, number>,
  nullLabel = 'Sin asignar'
): FacetResult {
  return {
    options: [
      ...(resolvedOptions?.map((o) => ({ value: o.id, label: o.name ?? '' })) ?? []),
      ...(counts.has(NULL_FILTER_VALUE)
        ? [{ value: NULL_FILTER_VALUE, label: nullLabel, icon: CircleOff as LucideIcon }]
        : []),
    ],
    counts,
  };
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function _DiagramReportsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
}: DiagramReportsDataTableProps) {
  // ─── Client-side navigation: reactive state for dependent queries ───────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  // queryFn for client-side data fetching
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getDiagramReportsPaginated(params), []);

  // Columns (static — no permissions needed for this table)
  const columns = useMemo(() => getColumns(), []);

  // Initial column visibility: merge defaults with saved preferences
  const mergedColumnVisibility = useMemo(() => {
    const defaults: Record<string, boolean> = {};
    for (const col of HIDDEN_COLUMNS_BY_DEFAULT) {
      defaults[col] = false;
    }
    return { ...defaults, ...(initialColumnVisibility ?? {}) };
  }, [initialColumnVisibility]);

  // Default visible filters: top 3 most useful
  const DEFAULT_VISIBLE_FILTERS = ['diagramType', 'employee', 'companyPosition'];

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    const allFilterIds = [
      'employee',
      'diagramType',
      'companyPosition',
      'fileNumber',
      'lastname',
      'firstname',
      'cuil',
      'day',
      'month',
      'year',
      'created_at',
      'comments',
    ];
    return Object.fromEntries(allFilterIds.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
  }, [initialFilterVisibility]);

  // ─── fetchFacet factory for FK filters ─────────────────────────────────────
  const makeFkFetchFacet = useCallback((columnId: string, nullLabel = 'Sin asignar') => {
    return async (params: DataTableSearchParams): Promise<FacetResult> => {
      const result = await getDiagramReportSingleFacet(columnId, params);
      if (!result) return { options: [], counts: new Map() };
      return buildFkFacetResult(result.resolvedOptions, result.counts, nullLabel);
    };
  }, []);

  // ─── Faceted filters with lazy-load ─────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      // ── FK: Empleado ───────────────────────────────────────────────────────
      {
        columnId: 'employee',
        title: 'Empleado',
        fetchFacet: makeFkFetchFacet('employee'),
      },

      // ── FK: Tipo de novedad ────────────────────────────────────────────────
      {
        columnId: 'diagramType',
        title: 'Tipo de novedad',
        fetchFacet: makeFkFetchFacet('diagramType'),
      },

      // ── FK: Puesto ─────────────────────────────────────────────────────────
      {
        columnId: 'companyPosition',
        title: 'Puesto',
        fetchFacet: makeFkFetchFacet('companyPosition', 'Sin puesto'),
      },

      // ── Text filters ────────────────────────────────────────────────────────
      {
        columnId: 'fileNumber',
        title: 'Legajo',
        type: 'text' as const,
        placeholder: 'Buscar por legajo (exacto)...',
      },
      {
        columnId: 'lastname',
        title: 'Apellido',
        type: 'text' as const,
        placeholder: 'Buscar por apellido...',
      },
      {
        columnId: 'firstname',
        title: 'Nombre',
        type: 'text' as const,
        placeholder: 'Buscar por nombre...',
      },
      {
        columnId: 'cuil',
        title: 'CUIL',
        type: 'text' as const,
        placeholder: 'Buscar por CUIL...',
      },

      // ── Numeric text filters ────────────────────────────────────────────────
      {
        columnId: 'day',
        title: 'Día',
        type: 'text' as const,
        placeholder: 'Ej: 15',
      },
      {
        columnId: 'month',
        title: 'Mes',
        type: 'text' as const,
        placeholder: 'Ej: 3',
      },
      {
        columnId: 'year',
        title: 'Año',
        type: 'text' as const,
        placeholder: 'Ej: 2024',
      },

      // ── Date range filter ───────────────────────────────────────────────────
      {
        columnId: 'created_at',
        title: 'Fecha de registro',
        type: 'dateRange' as const,
      },

      // ── Text: comentario ─────────────────────────────────────────────────────
      {
        columnId: 'comments',
        title: 'Comentario',
        type: 'text' as const,
        placeholder: 'Buscar en comentarios...',
      },
    ],
    [makeFkFetchFacet]
  );

  // ─── Render ─────────────────────────────────────────────────────────────────
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
      // Client-side navigation: instant fetch via React Query, no router.push
      queryFn={tableQueryFn}
      queryKey={['diagram-reports-paginated']}
      onStateChange={handleStateChange}
      enableRowSelection
      showRowSelection
      searchPlaceholder="Buscar por nombre, apellido, legajo o CUIL..."
      emptyMessage="No se encontraron registros de novedades"
      exportConfig={{
        fetchAllData: async () => unwrapExportResult(await getDiagramReportsForExport(currentParams)),
        options: {
          filename: 'reporte-novedades-diagramas',
          sheetName: 'Novedades',
          title: 'Reporte de Novedades de Diagramas',
        },
        formatters: {
          // FK columns with accessorFn return strings directly — no formatter needed
          // Decimal fields
          day: (value) => (value != null ? String(Number(value)) : '-'),
          month: (value) => (value != null ? String(Number(value)) : '-'),
          year: (value) => (value != null ? String(Number(value)) : '-'),
          // Date computed
          date: (_value, row) => {
            const d = Number(row.day);
            const m = Number(row.month);
            const y = Number(row.year);
            const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            return moment(dateStr, 'YYYY-MM-DD').format('DD/MM/YYYY');
          },
          // Timestamps
          created_at: (value) => (value ? formatArgentinaDay(value as string | Date) : '-'),
        },
      }}
    />
  );
}
