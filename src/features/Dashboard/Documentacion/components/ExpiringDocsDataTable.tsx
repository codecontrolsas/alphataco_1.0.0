'use client';

import {
  HIDDEN_COLUMNS_BY_DEFAULT,
  stateLabels,
} from '@/features/Dashboard/Documentacion/components/expiring-doc-columns';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import type { DataTableFacetedFilterConfig, DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult, type ExportResult } from '@/shared/lib/export-result';
import type { ColumnDef } from '@tanstack/react-table';
import { useCallback, useMemo } from 'react';

interface ExpiringDocsDataTableProps<T extends Record<string, unknown>> {
  columns: ColumnDef<T>[];
  data: T[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
  /** Filtros de la tabla, definidos a nivel de módulo para que su referencia sea estable. */
  facetedFilters: DataTableFacetedFilterConfig[];
  defaultVisibleFilters: readonly string[];
  fetchPage: (params: DataTableSearchParams) => Promise<{ data: T[]; total: number }>;
  fetchExport: (params: DataTableSearchParams) => Promise<ExportResult<T[]>>;
  queryKey: string;
  exportOptions: { filename: string; title: string };
  searchPlaceholder: string;
  emptyMessage: string;
  testId: string;
}

/** Tabla de documentos por vencer del dashboard (empleados y equipos comparten todo salvo columnas y filtros). */
export function ExpiringDocsDataTable<T extends Record<string, unknown>>({
  columns,
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
  facetedFilters,
  defaultVisibleFilters,
  fetchPage,
  fetchExport,
  queryKey,
  exportOptions,
  searchPlaceholder,
  emptyMessage,
  testId,
}: ExpiringDocsDataTableProps<T>) {
  const tableQueryFn = useCallback((params: DataTableSearchParams) => fetchPage(params), [fetchPage]);

  const { currentParams, tableProps } = useServerTableView({
    searchParams,
    tableId,
    hiddenColumnsByDefault: HIDDEN_COLUMNS_BY_DEFAULT,
    defaultVisibleFilters,
    facetedFilters,
    initialColumnVisibility,
    savedFilterVisibility: initialFilterVisibility,
  });

  const exportConfig = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await fetchExport(currentParams)),
      options: { ...exportOptions, sheetName: 'Documentos' },
      formatters: {
        // employee / vehicle / document_type: el accessorFn retorna texto, no necesitan formatter
        state: (val: unknown) => stateLabels[val as string] ?? String(val ?? ''),
        validity: (val: unknown) => (val ? formatArgentinaDay(val as string) : ''),
        created_at: (val: unknown) => (val ? formatArgentinaDay(val as string) : ''),
      },
    }),
    [currentParams, fetchExport, exportOptions]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      {...tableProps}
      queryFn={tableQueryFn}
      queryKey={[queryKey]}
      exportConfig={exportConfig}
      searchPlaceholder={searchPlaceholder}
      emptyMessage={emptyMessage}
      data-testid={testId}
    />
  );
}
