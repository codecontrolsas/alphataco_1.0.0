'use client';

import { TooltipProvider } from '@/components/ui/tooltip';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { createFacetFilters, dateRangeFilter, textFilter } from '@/shared/components/common/DataTable/facet-filters';
import type { DataTableFacetedFilterConfig, DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
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

const facets = createFacetFilters(getDiagramReportSingleFacet);

const UNASSIGNED = { label: 'Sin asignar' };

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
// HELPERS
// ============================================================================

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

  // ─── Faceted filters with lazy-load ─────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      facets.lookup('employee', 'Empleado', undefined, UNASSIGNED),
      facets.lookup('diagramType', 'Novedad', undefined, UNASSIGNED),
      facets.lookup('companyPosition', 'Puesto', undefined, { label: 'Sin puesto' }),

      // ── Text filters ────────────────────────────────────────────────────────
      textFilter('fileNumber', 'Legajo', 'Buscar por legajo (exacto)...'),
      textFilter('lastname', 'Apellido', 'Buscar por apellido...'),
      textFilter('firstname', 'Nombre', 'Buscar por nombre...'),
      textFilter('cuil', 'CUIL', 'Buscar por CUIL...'),

      // ── Numeric text filters ────────────────────────────────────────────────
      textFilter('day', 'Día', 'Ej: 15'),
      textFilter('month', 'Mes', 'Ej: 3'),
      textFilter('year', 'Año', 'Ej: 2024'),

      // ── Date range filter (cuándo se registró; el período de la novedad está en la barra) ──
      dateRangeFilter('created_at', 'Fecha de registro'),

      // ── Text: comentario ─────────────────────────────────────────────────────
      textFilter('comments', 'Comentario', 'Buscar en comentarios...'),
    ],
    []
  );

  const { currentParams, tableProps } = useServerTableView({
    searchParams,
    tableId,
    hiddenColumnsByDefault: HIDDEN_COLUMNS_BY_DEFAULT,
    defaultVisibleFilters: DEFAULT_VISIBLE_FILTERS,
    facetedFilters,
    initialColumnVisibility,
    savedFilterVisibility: initialFilterVisibility,
  });

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        <ReportTotals params={currentParams} />
        <DataTable
          columns={columns}
          data={data}
          totalRows={totalRows}
          {...tableProps}
          mobileCards
          // Client-side navigation: instant fetch via React Query, no router.push
          queryFn={tableQueryFn}
          queryKey={TABLE_QUERY_KEY}
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
