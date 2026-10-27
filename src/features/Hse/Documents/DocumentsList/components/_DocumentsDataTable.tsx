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
import { CheckCircle2, CircleDashed, Clock, FileType } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { HSE_DOCUMENT_STATUS_LABELS, HSE_QUERY_KEYS } from '../../../lib/constants';
import { HSE_DOCUMENT_STATUS_UI } from '../../../lib/status-presentation';
import {
  getAllHseDocumentsForExport,
  getHseDocumentSingleFacet,
  getHseDocumentsPaginated,
  type HseDocumentListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, STATUS_VALUES, formatDay, getColumns } from '../columns';

interface Props {
  data: HseDocumentListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['status', 'type', 'compliance'];
const facets = createFacetFilters(getHseDocumentSingleFacet);

export function _DocumentsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getHseDocumentsPaginated(params), []);
  const columns = useMemo(() => getColumns(), []);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      facets.fixed(
        'status',
        'Estado',
        STATUS_VALUES.map((value) => ({
          value,
          label: HSE_DOCUMENT_STATUS_LABELS[value],
          icon: HSE_DOCUMENT_STATUS_UI[value].icon,
        }))
      ),
      facets.lookup('type', 'Tipo', FileType, { label: 'Sin tipo' }),
      facets.fixed('compliance', 'Cumplimiento', [
        { value: 'with_pending', label: 'Con pendientes', icon: Clock },
        { value: 'complete', label: 'Todos respondieron', icon: CheckCircle2 },
        { value: 'none', label: 'Sin destinatarios aún', icon: CircleDashed },
      ]),
      textFilter('title', 'Documento', 'Buscar por título...'),
      textFilter('version', 'Versión', 'Número de versión, ej: 2'),
      dateRangeFilter('expires_at', 'Vence'),
      dateRangeFilter('updated_at', 'Actualizado'),
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

  const exportConfig: DataTableExportConfig<HseDocumentListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllHseDocumentsForExport(currentParams)),
      options: { filename: 'documentos-hse', title: 'Documentos HSE', sheetName: 'Documentos' },
      formatters: {
        status: (value) => HSE_DOCUMENT_STATUS_LABELS[value as keyof typeof HSE_DOCUMENT_STATUS_LABELS] ?? '',
        version: (value) => (value ? `v${value}` : ''),
        expires_at: (value) => formatDay(value as string | null),
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
      queryKey={[...HSE_QUERY_KEYS.documents]}
      searchPlaceholder="Buscar por título, descripción o tipo"
      emptyMessage="Todavía no hay documentos HSE"
      exportConfig={exportConfig}
      data-testid="hse-documents-table"
    />
  );
}
