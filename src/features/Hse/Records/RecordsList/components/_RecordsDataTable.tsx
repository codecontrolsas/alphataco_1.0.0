'use client';

import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { createFacetFilters, dateRangeFilter, textFilter } from '@/shared/components/common/DataTable/facet-filters';
import type {
  DataTableExportConfig,
  DataTableFacetedFilterConfig,
  DataTableSearchParams,
} from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { formatArgentinaDateTime, formatDateAr } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { MapPin } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { HSE_QUERY_KEYS } from '../../../lib/constants';
import { HSE_RECORD_MODALITY_LABELS, HSE_RECORD_STATUS_LABELS } from '../../../lib/pdf-content';
import { HSE_RECORD_STATUS_UI } from '../../../lib/status-presentation';
import {
  getAllHseRecordsForExport,
  getHseRecordSingleFacet,
  getHseRecordsPaginated,
  type HseRecordListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, MODALITY_VALUES, STATUS_VALUES, getColumns } from '../columns';

interface Props {
  data: HseRecordListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['status', 'training', 'held_on'];
const facets = createFacetFilters(getHseRecordSingleFacet);

export function _RecordsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getHseRecordsPaginated(params), []);
  const columns = useMemo(() => getColumns(), []);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      facets.fixed(
        'status',
        'Estado',
        STATUS_VALUES.map((value) => ({
          value,
          label: HSE_RECORD_STATUS_LABELS[value],
          icon: HSE_RECORD_STATUS_UI[value].icon,
        }))
      ),
      facets.fixed(
        'modality',
        'Modalidad',
        MODALITY_VALUES.map((value) => ({ value, label: HSE_RECORD_MODALITY_LABELS[value], icon: MapPin }))
      ),
      textFilter('training', 'Capacitación', 'Buscar por título...'),
      textFilter('number', 'N° de acta', 'Número, ej: 3'),
      textFilter('location', 'Lugar', 'Buscar por lugar...'),
      textFilter('attendees', 'Presentes', 'Cantidad, ej: 12'),
      dateRangeFilter('held_on', 'Fecha'),
      dateRangeFilter('closed_at', 'Cerrada'),
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

  const exportConfig: DataTableExportConfig<HseRecordListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllHseRecordsForExport(currentParams)),
      options: { filename: 'actas-hse', title: 'Actas de capacitación HSE', sheetName: 'Actas' },
      formatters: {
        held_on: (value) => (value ? formatDateAr(value as string) : ''),
        status: (value) => HSE_RECORD_STATUS_LABELS[value as keyof typeof HSE_RECORD_STATUS_LABELS] ?? '',
        closed_at: (value) => (value ? formatArgentinaDateTime(value as string | Date) : ''),
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
      queryKey={[...HSE_QUERY_KEYS.records]}
      searchPlaceholder="Buscar por capacitación, temario, lugar o N°"
      emptyMessage="Todavía no hay actas"
      exportConfig={exportConfig}
      data-testid="hse-records-table"
    />
  );
}
