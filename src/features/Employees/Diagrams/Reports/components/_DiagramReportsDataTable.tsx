'use client';

import { TooltipProvider } from '@/components/ui/tooltip';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { type DataTableFacetedFilterConfig, type DataTableSearchParams, type FacetResult } from '@/shared/components/common/DataTable/types';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import type { LucideIcon } from 'lucide-react';
import { CircleOff } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState } from 'react';
import {
  getDiagramReportSingleFacet,
  getDiagramReportsForExport,
  getDiagramReportsPaginated,
  type DiagramReportListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, formatReportDate, getColumns } from '../columns';
import { PeriodFilter } from './_PeriodFilter';
import { ReportTotals } from './_ReportTotals';

// El Sheet (formulario, historial) solo hace falta al abrir una novedad: no entra al bundle de la tabla.
const DiagramReportDetailSheet = dynamic(
  () => import('./_DiagramReportDetailSheet').then((module) => module.DiagramReportDetailSheet),
  { ssr: false }
);

// ============================================================================
// CONSTANTS
// ============================================================================

/** Filtros visibles de entrada (el resto se activa desde "Filtros"). */
const DEFAULT_VISIBLE_FILTERS = ['diagramType', 'employee', 'fileNumber'];

/** Todos los filtros de la tabla: uno por columna de datos. */
const ALL_FILTER_IDS = [
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

/** Clave base de React Query de la tabla: la usa el Sheet para refrescarla al editar una novedad. */
const TABLE_QUERY_KEY = ['diagram-reports-paginated'] as const;

// ============================================================================
// TYPES
// ============================================================================

interface DiagramReportsDataTableProps {
  data: DiagramReportListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  /** Puede cambiar el tipo y el comentario de una novedad (se calcula en el servidor). */
  canUpdate: boolean;
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

/** Un solo parámetro de texto de la URL (los filtros del DataTable llegan como string). */
function singleParam(params: DataTableSearchParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function _DiagramReportsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  canUpdate,
  initialColumnVisibility,
  initialFilterVisibility,
}: DiagramReportsDataTableProps) {
  // ─── Client-side navigation: estado reactivo para totales, período y export ───
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  // queryFn for client-side data fetching
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getDiagramReportsPaginated(params), []);

  // ─── Detalle de una novedad (Sheet) ──────────────────────────────────────────
  // La fila se conserva al cerrar para que el Sheet no se vacíe durante la animación.
  const [detail, setDetail] = useState<{ item: DiagramReportListItem; open: boolean } | null>(null);

  const handleOpenDetail = useCallback((item: DiagramReportListItem) => {
    setDetail({ item, open: true });
  }, []);

  const handleDetailOpenChange = useCallback((open: boolean) => {
    setDetail((current) => (current ? { ...current, open } : current));
  }, []);

  const columns = useMemo(() => getColumns({ onOpenDetail: handleOpenDetail }), [handleOpenDetail]);

  // Initial column visibility: merge defaults with saved preferences
  const mergedColumnVisibility = useMemo(() => {
    const defaults: Record<string, boolean> = {};
    for (const col of HIDDEN_COLUMNS_BY_DEFAULT) {
      defaults[col] = false;
    }
    return { ...defaults, ...(initialColumnVisibility ?? {}) };
  }, [initialColumnVisibility]);

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    return Object.fromEntries(ALL_FILTER_IDS.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
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

      // ── FK: Novedad ────────────────────────────────────────────────────────
      {
        columnId: 'diagramType',
        title: 'Novedad',
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

      // ── Date range filter (cuándo se registró; el período de la novedad está en la barra) ──
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
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        <ReportTotals params={currentParams} />
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
          mobileCards
          // Client-side navigation: instant fetch via React Query, no router.push
          queryFn={tableQueryFn}
          queryKey={TABLE_QUERY_KEY}
          onStateChange={handleStateChange}
          searchPlaceholder="Buscar por legajo, nombre, apellido o CUIL..."
          showSearch
          emptyMessage="No se encontraron novedades con estos filtros"
          toolbarActions={
            <PeriodFilter
              paramNamespace={tableId}
              dateFrom={singleParam(currentParams, 'date_from')}
              dateTo={singleParam(currentParams, 'date_to')}
            />
          }
          exportConfig={{
            fetchAllData: async () => unwrapExportResult(await getDiagramReportsForExport(currentParams)),
            options: {
              filename: 'reporte-novedades-diagramas',
              sheetName: 'Novedades',
              title: 'Reporte de Novedades de Diagramas',
            },
            formatters: {
              // Columnas con accessorFn devuelven texto o número: solo se formatean fechas
              date: (value) => (typeof value === 'string' ? formatReportDate(value) : '-'),
              created_at: (value) => (value ? formatArgentinaDay(value as string | Date) : '-'),
            },
          }}
        />
      </div>
      {detail && (
        <DiagramReportDetailSheet
          item={detail.item}
          open={detail.open}
          onOpenChange={handleDetailOpenChange}
          canUpdate={canUpdate}
        />
      )}
    </TooltipProvider>
  );
}
