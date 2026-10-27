'use client';

import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { createFacetFilters, dateRangeFilter, textFilter } from '@/shared/components/common/DataTable/facet-filters';
import type {
  DataTableExportConfig,
  DataTableFacetedFilterConfig,
  DataTableSearchParams,
} from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { Briefcase } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { HSE_ASSIGNMENT_STATUS_LABELS, HSE_QUERY_KEYS, type HseAssignmentStatus } from '../../../lib/constants';
import { HSE_ASSIGNMENT_STATUS_UI } from '../../../lib/status-presentation';
import { formatPercent } from '../../../lib/training-status';
import {
  getAllHseTrainingComplianceForExport,
  getHseTrainingCompliancePaginated,
  getHseTrainingComplianceSingleFacet,
  type HseTrainingComplianceItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, attemptsLabel, formatDay, getColumns } from '../columns';

interface Props {
  data: HseTrainingComplianceItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  trainingId: string;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

const STATUS_VALUES = Object.keys(HSE_ASSIGNMENT_STATUS_LABELS) as HseAssignmentStatus[];

export function _TrainingComplianceDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  trainingId,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const tableQueryFn = useCallback(
    (params: DataTableSearchParams) => getHseTrainingCompliancePaginated(params, trainingId),
    [trainingId]
  );
  const columns = useMemo(() => getColumns(trainingId), [trainingId]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(() => {
    const facets = createFacetFilters((columnId, params) =>
      getHseTrainingComplianceSingleFacet(columnId, params, trainingId)
    );
    return [
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
      textFilter('last_score_percent', 'Último puntaje', 'Porcentaje, ej: 80'),
      dateRangeFilter('passed_at', 'Aprobó el'),
      dateRangeFilter('valid_until', 'Vigente hasta'),
    ];
  }, [trainingId]);

  const { currentParams, tableProps } = useServerTableView({
    searchParams,
    tableId,
    hiddenColumnsByDefault: HIDDEN_COLUMNS_BY_DEFAULT,
    defaultVisibleFilters: ['status', 'file', 'employee'],
    facetedFilters,
    initialColumnVisibility,
    savedFilterVisibility: initialFilterVisibility,
  });

  const exportConfig: DataTableExportConfig<HseTrainingComplianceItem> = useMemo(
    () => ({
      fetchAllData: async () =>
        unwrapExportResult(await getAllHseTrainingComplianceForExport(currentParams, trainingId)),
      options: {
        filename: 'cumplimiento-capacitacion',
        title: 'Cumplimiento de la capacitación',
        sheetName: 'Cumplimiento',
      },
      formatters: {
        status: (value) => HSE_ASSIGNMENT_STATUS_LABELS[value as HseAssignmentStatus] ?? '',
        attempts_used: (_value, row) => attemptsLabel(row),
        last_score_percent: (_value, row) => formatPercent(row.last_score_percent),
        passed_at: (value) => (value ? formatArgentinaDay(value as string | Date) : ''),
        valid_until: (_value, row) =>
          row.passed_at && !row.valid_until ? 'Sin vencimiento' : row.valid_until ? formatDay(row.valid_until) : '',
      },
    }),
    [currentParams, trainingId]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      {...tableProps}
      queryFn={tableQueryFn}
      queryKey={[...HSE_QUERY_KEYS.trainingCompliance, trainingId]}
      searchPlaceholder="Buscar por legajo o nombre"
      emptyMessage="Esta capacitación no tiene destinatarios vigentes"
      exportConfig={exportConfig}
      data-testid="hse-training-compliance-table"
    />
  );
}
