'use client';

import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { type DataTableFacetedFilterConfig, type DataTableSearchParams, type DataTableFilterOption, type FacetResult } from '@/shared/components/common/DataTable/types';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { dailyReportStatusLabels } from '@/shared/utils/mappers';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { DailyReportPeriodSelector } from './DailyReportPeriodSelector';
import { BookOpen, CheckCircle2, CircleOff, Clock, XCircle, type LucideIcon } from 'lucide-react';
import moment from 'moment';
import { useCallback, useMemo, useState } from 'react';
import {
  getAllDailyReportsForExport,
  getDailyReportSingleFacet,
  getDailyReportsPaginated,
  type DailyReportListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from '../columns';

// ============================================================================
// ICONOS POR STATUS
// ============================================================================

const statusIcons: Record<string, LucideIcon> = {
  abierto: Clock,
  cerrado: XCircle,
  cerrado_completo: CheckCircle2,
  cerrado_incompleto: BookOpen,
};

/** Primer valor de un param de URL (puede venir como string o array). */
function firstParam(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  data: DailyReportListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  /** Clave de las preferencias guardadas (columnas, filtros visibles). */
  tableId: string;
  /** Prefijo de los params de la tabla en la URL. */
  paramNamespace: string;
  /** Flat permissions map from server: "module:tab:action" → boolean */
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
}

// ============================================================================
// CLIENT COMPONENT
// ============================================================================

export function _DailyReportDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  paramNamespace,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  // Construir helper de permisos desde el map serializable del servidor
  const permissions = useMemo(
    () => ({
      hasPermission: (module: string, tab: string, action: string) =>
        permissionsMap[`${module}:${tab}:${action}`] === true,
    }),
    [permissionsMap]
  );
  // Params actuales de la tabla (modo cliente): el export respeta los filtros activos
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);
  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getDailyReportsPaginated(params), []);

  // Facets lazy: cada filtro pide sus conteos al abrirse, con los filtros actuales de la tabla.
  const makeFetchFacet = useCallback(
    (columnId: string, options: DataTableFilterOption[]) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getDailyReportSingleFacet(columnId, params);
        if (!result) return { options: [], counts: new Map() };
        return {
          options: [
            ...options,
            ...(result.counts.has(NULL_FILTER_VALUE)
              ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff }]
              : []),
          ],
          counts: result.counts,
        };
      },
    []
  );

  // Columnas ocultas por defecto
  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((col) => [col, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  // Filtros visibles por defecto — máximo 3
  const DEFAULT_VISIBLE_FILTERS = ['date', 'status'];
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    const allFilterIds = ['date', 'status', 'creation_date', 'is_active'];
    return Object.fromEntries(allFilterIds.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
  }, [initialFilterVisibility]);

  // ─── Filtros facetados ──────────────────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      // Fecha del parte (dateRange)
      {
        columnId: 'date',
        title: 'Fecha',
        type: 'dateRange' as const,
      },

      // Estado (enum NOT NULL, con iconos)
      {
        columnId: 'status',
        title: 'Estado',
        fetchFacet: makeFetchFacet(
          'status',
          Object.entries(dailyReportStatusLabels).map(([value, label]) => ({
            value,
            label,
            icon: statusIcons[value],
          }))
        ),
      },

      // Fecha de creación (dateRange, oculto por defecto)
      {
        columnId: 'creation_date',
        title: 'Fecha de creación',
        type: 'dateRange' as const,
      },

      // Activo/Inactivo
      {
        columnId: 'is_active',
        title: 'Activo',
        fetchFacet: makeFetchFacet('is_active', [
          { value: 'true', label: 'Activo', icon: CheckCircle2 },
          { value: 'false', label: 'Inactivo', icon: XCircle },
        ]),
      },
    ],
    [makeFetchFacet]
  );

  // ─── Columnas ────────────────────────────────────────────────────────────────
  const columns = useMemo(() => getColumns(permissions), [permissions]);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
    <DailyReportPeriodSelector
      paramNamespace={paramNamespace}
      serverFrom={firstParam(searchParams.date_from)}
      serverTo={firstParam(searchParams.date_to)}
    />
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      queryFn={tableQueryFn}
      queryKey={['daily-reports', 'list']}
      onStateChange={handleStateChange}
      mobileCards
      searchPlaceholder="Buscar partes diarios..."
      facetedFilters={facetedFilters}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      tableId={tableId}
      paramNamespace={paramNamespace}
      showFilterToggle={true}
      emptyMessage="No hay partes diarios registrados"
      data-testid="daily-reports-table"
      exportConfig={{
        fetchAllData: async () => unwrapExportResult(await getAllDailyReportsForExport(currentParams)),
        options: {
          filename: 'partes-diarios',
          title: 'Listado de Partes Diarios',
          sheetName: 'Partes Diarios',
        },
        formatters: {
          date: (val) => (val ? moment.utc(val as string).format('DD/MM/YYYY') : ''),
          creation_date: (val) => (val ? moment.utc(val as string).format('DD/MM/YYYY') : ''),
          status: (val) => dailyReportStatusLabels[val as string] ?? String(val ?? ''),
          is_active: (val) => (val ? 'Activo' : 'Inactivo'),
        },
      }}
    />
    </div>
  );
}
