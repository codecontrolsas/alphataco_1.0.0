'use client';

import { usePermissionChecker } from '@/features/Permissions/hooks/usePermissionChecker';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import {
  createFacetFilters,
  dateRangeFilter,
  enumFilterOptions,
} from '@/shared/components/common/DataTable/facet-filters';
import type { DataTableFacetedFilterConfig, DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { dailyReportStatusLabels } from '@/shared/utils/mappers';
import { BookOpen, CheckCircle2, Clock, XCircle, type LucideIcon } from 'lucide-react';
import moment from 'moment';
import { useCallback, useMemo } from 'react';
import {
  getAllDailyReportsForExport,
  getDailyReportSingleFacet,
  getDailyReportsPaginated,
  type DailyReportListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from '../columns';
import { DailyReportPeriodSelector } from './DailyReportPeriodSelector';

// ============================================================================
// ICONOS POR STATUS
// ============================================================================

const DEFAULT_VISIBLE_FILTERS = ['date', 'status'];

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
  const permissions = usePermissionChecker(permissionsMap);
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getDailyReportsPaginated(params), []);

  // ─── Filtros facetados (lazy: cada filtro pide sus conteos al abrirse, con los filtros actuales) ───
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(() => {
    const facets = createFacetFilters(getDailyReportSingleFacet);
    return [
      dateRangeFilter('date', 'Fecha'),
      facets.fixed(
        'status',
        'Estado',
        enumFilterOptions(Object.keys(dailyReportStatusLabels), dailyReportStatusLabels, statusIcons),
        { label: 'Sin asignar' }
      ),
      dateRangeFilter('creation_date', 'Fecha de creación'),
      facets.fixed(
        'is_active',
        'Activo',
        [
          { value: 'true', label: 'Activo', icon: CheckCircle2 },
          { value: 'false', label: 'Inactivo', icon: XCircle },
        ],
        { label: 'Sin asignar' }
      ),
    ];
  }, []);

  // Filtros visibles por defecto: fecha y estado (si hay preferencia guardada, manda esa)
  const { currentParams, tableProps } = useServerTableView({
    searchParams,
    tableId,
    hiddenColumnsByDefault: HIDDEN_COLUMNS_BY_DEFAULT,
    defaultVisibleFilters: DEFAULT_VISIBLE_FILTERS,
    facetedFilters,
    initialColumnVisibility,
    savedFilterVisibility: initialFilterVisibility,
  });

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
        {...tableProps}
        columns={columns}
        data={data}
        totalRows={totalRows}
        queryFn={tableQueryFn}
        queryKey={['daily-reports', 'list']}
        mobileCards
        searchPlaceholder="Buscar partes diarios..."
        paramNamespace={paramNamespace}
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
