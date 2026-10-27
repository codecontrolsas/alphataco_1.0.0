'use client';

import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { createFacetFilters, dateRangeFilter, textFilter } from '@/shared/components/common/DataTable/facet-filters';
import type {
  DataTableExportConfig,
  DataTableFacetedFilterConfig,
  DataTableSearchParams,
} from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { formatArgentinaDateTime, formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { CheckCircle2, CircleDashed, Clock, GraduationCap } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { HSE_QUERY_KEYS, HSE_TRAINING_KIND_LABELS, HSE_TRAINING_STATUS_LABELS } from '../../../lib/constants';
import { HSE_TRAINING_STATUS_UI } from '../../../lib/status-presentation';
import {
  getAllHseTrainingsForExport,
  getHseTrainingSingleFacet,
  getHseTrainingsPaginated,
  type HseTrainingListItem,
} from '../actions.server';
import {
  HIDDEN_COLUMNS_BY_DEFAULT,
  KIND_VALUES,
  STATUS_VALUES,
  examLabel,
  getColumns,
  progressLabel,
} from '../columns';

interface Props {
  data: HseTrainingListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['status', 'kind', 'progress'];
const facets = createFacetFilters(getHseTrainingSingleFacet);

export function _TrainingsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getHseTrainingsPaginated(params), []);
  const columns = useMemo(() => getColumns(), []);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      facets.fixed(
        'status',
        'Estado',
        STATUS_VALUES.map((value) => ({
          value,
          label: HSE_TRAINING_STATUS_LABELS[value],
          icon: HSE_TRAINING_STATUS_UI[value].icon,
        }))
      ),
      facets.fixed(
        'kind',
        'Tipo',
        KIND_VALUES.map((value) => ({ value, label: HSE_TRAINING_KIND_LABELS[value], icon: GraduationCap }))
      ),
      facets.fixed('progress', 'Avance', [
        { value: 'with_pending', label: 'Con pendientes', icon: Clock },
        { value: 'complete', label: 'Todos aprobaron', icon: CheckCircle2 },
        { value: 'none', label: 'Sin asignar', icon: CircleDashed },
      ]),
      textFilter('title', 'Capacitación', 'Buscar por título...'),
      textFilter('passing_score', 'Aprobación (%)', 'Porcentaje, ej: 70'),
      dateRangeFilter('published_at', 'Publicada'),
      dateRangeFilter('updated_at', 'Actualizada'),
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

  const exportConfig: DataTableExportConfig<HseTrainingListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllHseTrainingsForExport(currentParams)),
      options: { filename: 'capacitaciones-hse', title: 'Capacitaciones HSE', sheetName: 'Capacitaciones' },
      formatters: {
        status: (value) => HSE_TRAINING_STATUS_LABELS[value as keyof typeof HSE_TRAINING_STATUS_LABELS] ?? '',
        progress: (_value, row) => progressLabel(row),
        passing_score: (_value, row) => `${row.questions} preguntas · ${examLabel(row)}`,
        published_at: (value) => (value ? formatArgentinaDay(value as string | Date) : ''),
        updated_at: (value) => (value ? formatArgentinaDateTime(value as string | Date) : ''),
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
      queryKey={[...HSE_QUERY_KEYS.trainings]}
      searchPlaceholder="Buscar por título o descripción"
      emptyMessage="Todavía no hay capacitaciones"
      exportConfig={exportConfig}
      data-testid="hse-trainings-table"
    />
  );
}
