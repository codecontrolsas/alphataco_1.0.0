'use client';

import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { createFacetFilters, dateRangeFilter, textFilter } from '@/shared/components/common/DataTable/facet-filters';
import type {
  DataTableExportConfig,
  DataTableFacetedFilterConfig,
  DataTableSearchParams,
} from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { Briefcase, GraduationCap } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { HSE_ASSIGNMENT_STATUS_LABELS, HSE_QUERY_KEYS, type HseAssignmentStatus } from '../../../lib/constants';
import { formatDuration } from '../../../lib/durations';
import { HSE_ASSIGNMENT_STATUS_UI } from '../../../lib/status-presentation';
import {
  getAllHseTimesForExport,
  getHseTimesPaginated,
  getHseTimesSingleFacet,
  type HseTimesItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, attemptsLabel, getColumns, studyLabel } from '../columns';

interface Props {
  data: HseTimesItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

const STATUS_VALUES = Object.keys(HSE_ASSIGNMENT_STATUS_LABELS) as HseAssignmentStatus[];

export function _TimesDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getHseTimesPaginated(params), []);
  const columns = useMemo(() => getColumns(), []);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(() => {
    const facets = createFacetFilters((columnId, params) => getHseTimesSingleFacet(columnId, params));
    return [
      facets.lookup('training', 'Capacitación', GraduationCap),
      facets.fixed(
        'status',
        'Estado',
        STATUS_VALUES.map((value) => ({
          value,
          label: HSE_ASSIGNMENT_STATUS_LABELS[value],
          icon: HSE_ASSIGNMENT_STATUS_UI[value].icon,
        }))
      ),
      facets.lookup('position', 'Puesto', Briefcase, { label: 'Sin puesto' }),
      textFilter('file', 'Legajo', 'Buscar por legajo...'),
      textFilter('employee', 'Empleado', 'Buscar por apellido o nombre...'),
      textFilter('attempts_used', 'Intentos', 'Cantidad, ej: 2'),
      dateRangeFilter('last_attempt_at', 'Último intento'),
    ];
  }, []);

  const { currentParams, tableProps } = useServerTableView({
    searchParams,
    tableId,
    hiddenColumnsByDefault: HIDDEN_COLUMNS_BY_DEFAULT,
    defaultVisibleFilters: ['training', 'status', 'employee'],
    facetedFilters,
    initialColumnVisibility,
    savedFilterVisibility: initialFilterVisibility,
  });

  const exportConfig: DataTableExportConfig<HseTimesItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllHseTimesForExport(currentParams)),
      options: {
        filename: 'tiempos-capacitaciones',
        title: 'Tiempos de capacitación',
        sheetName: 'Tiempos',
      },
      formatters: {
        status: (value) => HSE_ASSIGNMENT_STATUS_LABELS[value as HseAssignmentStatus] ?? '',
        study_seconds: (_value, row) => studyLabel(row),
        exam_last_seconds: (_value, row) => formatDuration(row.exam_last_seconds),
        exam_total_seconds: (_value, row) => formatDuration(row.exam_total_seconds),
        attempts_used: (_value, row) => attemptsLabel(row),
        last_attempt_at: (value) => (value ? formatArgentinaDateTime(value as string | Date) : ''),
      },
    }),
    [currentParams]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      {...tableProps}
      queryFn={tableQueryFn}
      queryKey={[...HSE_QUERY_KEYS.trainingCompliance, 'times']}
      searchPlaceholder="Buscar por legajo, nombre o capacitación"
      emptyMessage="Todavía no hay empleados con capacitaciones asignadas"
      exportConfig={exportConfig}
      data-testid="hse-times-table"
    />
  );
}
