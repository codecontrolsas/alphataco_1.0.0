'use client';

import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { dailyReportStatusLabels } from '@/shared/utils/mappers';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, CircleOff, XCircle } from 'lucide-react';
import moment from 'moment';
import { useMemo } from 'react';
import { getAllDailyReportsForExport, getDailyReportFacets, type DailyReportListItem } from '../actions.server';
import { CreateDailyReportButton } from '../../components/CreateDailyReportButton';
import { DAILY_REPORT_STATUS_ICONS } from '../../lib/daily-report-status-ui';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from '../columns';

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  data: DailyReportListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  /** Flat permissions map from server: "module:tab:action" → boolean */
  permissionsMap: Record<string, boolean>;
  /** Muestra el alta de parte diario en la barra de la tabla. */
  canCreate: boolean;
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
  permissionsMap,
  canCreate,
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
  // Extraer solo los params relevantes para facets (sin page/sort/pageSize)
  const facetParams = useMemo(() => {
    const { page, pageSize, sort, sortBy, sortOrder, ...rest } = searchParams;
    return rest as DataTableSearchParams;
  }, [searchParams]);

  // Facets con cross-filtering
  const { data: facets, isFetching: isFetchingFacets } = useQuery({
    queryKey: ['daily-reports-list-facets', facetParams],
    queryFn: () => getDailyReportFacets(facetParams),
    staleTime: 5 * 60 * 1000,
  });

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
        options: [
          ...Object.entries(dailyReportStatusLabels).map(([value, label]) => ({
            value,
            label,
            icon: DAILY_REPORT_STATUS_ICONS[value],
          })),
          ...(facets?.status?.has(NULL_FILTER_VALUE)
            ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff }]
            : []),
        ],
        externalCounts: facets?.status,
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
        options: [
          { value: 'true', label: 'Activo', icon: CheckCircle2 },
          { value: 'false', label: 'Inactivo', icon: XCircle },
        ],
        externalCounts: facets?.is_active,
      },
    ],
    [facets]
  );

  // ─── Columnas ────────────────────────────────────────────────────────────────
  const columns = useMemo(() => getColumns(permissions), [permissions]);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      searchPlaceholder="Buscar partes diarios..."
      mobileCards
      toolbarActions={canCreate ? <CreateDailyReportButton /> : undefined}
      facetedFilters={facetedFilters}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      tableId={tableId}
      paramNamespace={tableId}
      showFilterToggle={true}
      isFetchingFacets={isFetchingFacets}
      emptyMessage="No hay partes diarios registrados"
      data-testid="daily-reports-table"
      exportConfig={{
        fetchAllData: () => getAllDailyReportsForExport(searchParams),
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
  );
}
